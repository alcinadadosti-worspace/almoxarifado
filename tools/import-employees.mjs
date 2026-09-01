#!/usr/bin/env node
/**
 * import-employees.mjs
 * ------------------------------------------------------------------
 * Importa colaboradores de uma planilha (.xlsx ou .csv) para o cadastro.
 *
 * Cria APENAS fichas de colaborador. Nenhuma mensagem é enviada no Slack —
 * quem dispara DM é a criação de entregas, nunca este comando.
 *
 * Uso:
 *   node tools/import-employees.mjs planilha.xlsx              # confere e mostra
 *   node tools/import-employees.mjs planilha.xlsx --aplicar    # grava
 *   node tools/import-employees.mjs planilha.xlsx --aplicar --api https://…
 *
 * Sem --api, escreve direto no Firestore com a conta de serviço.
 * Colunas são reconhecidas pelo nome, em qualquer ordem e grafia:
 *   nome/fullname/colaborador · slack/userid/slack_id · cpf · cargo · setor · email
 * ------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './read-xlsx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--aplicar');
const apiBase = args.includes('--api') ? args[args.indexOf('--api') + 1] : null;

if (!file) {
  console.error('uso: node tools/import-employees.mjs <planilha> [--aplicar] [--api <url>]');
  process.exit(1);
}

/* ------------------------------------------------------- leitura */

const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Aceita variações de nome de coluna sem exigir formato do arquivo. */
const FIELDS = {
  fullName: ['nome', 'nomecompleto', 'fullname', 'name', 'colaborador', 'funcionario'],
  slackUserId: ['slack', 'slackid', 'userid', 'slackuserid', 'iddoslack', 'idslack', 'memberid'],
  cpf: ['cpf', 'documento'],
  role: ['cargo', 'funcao', 'cargofuncao', 'role', 'ocupacao'],
  sector: ['setor', 'unidade', 'setorunidade', 'sector', 'loja', 'departamento'],
  email: ['email', 'mail', 'ema'],
};

function readRows(target) {
  if (/\.csv$/i.test(target)) {
    const text = fs.readFileSync(target, 'utf8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
    const split = (line) =>
      line.split(separator).map((cell) => cell.trim().replace(/^"(.*)"$/s, '$1'));
    const header = split(lines[0]);
    return {
      header,
      rows: lines.slice(1).map((line, index) => {
        const cells = split(line);
        return Object.fromEntries([['_linha', index + 2], ...header.map((h, i) => [h, cells[i] ?? ''])]);
      }),
    };
  }
  return readXlsx(target);
}

const { header, rows } = readRows(path.isAbsolute(file) ? file : path.resolve(ROOT, file));

/** Mapeia cada campo do domínio para a coluna correspondente da planilha. */
const mapping = {};
for (const [field, aliases] of Object.entries(FIELDS)) {
  const found = header.find((column) => aliases.includes(normalize(column)));
  if (found) mapping[field] = found;
}

console.log(`\nplanilha : ${path.basename(file)}`);
console.log(`colunas  : ${header.join(' | ')}`);
console.log('mapeadas : ' + (Object.entries(mapping).map(([f, c]) => `${f}←${c}`).join('  ·  ') || 'nenhuma'));
console.log(`linhas   : ${rows.length}\n`);

if (!mapping.fullName) {
  console.error('✖ Não achei a coluna com o nome do colaborador. Renomeie para "nome" ou "fullname".');
  process.exit(1);
}

/* ------------------------------------------------------ validação */

const onlyDigits = (value) => String(value ?? '').replace(/\D+/g, '');
function validCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const valid = [];
const problems = [];
const seenNames = new Map();
const seenSlack = new Map();

for (const row of rows) {
  const get = (field) => (mapping[field] ? String(row[mapping[field]] ?? '').trim() : '');
  const fullName = get('fullName').replace(/\s+/g, ' ');
  const slackUserId = get('slackUserId');
  const cpf = onlyDigits(get('cpf'));
  const line = row._linha;

  if (!fullName) {
    problems.push({ line, issue: 'sem nome', detail: '' });
    continue;
  }
  if (cpf && !validCpf(cpf)) {
    problems.push({ line, issue: 'CPF inválido', detail: `${fullName} — ${get('cpf')}` });
    continue;
  }
  if (slackUserId && !/^[UW][A-Z0-9]{6,}$/i.test(slackUserId)) {
    problems.push({ line, issue: 'ID do Slack fora do padrão', detail: `${fullName} — ${slackUserId}` });
    continue;
  }

  const nameKey = normalize(fullName);
  if (seenNames.has(nameKey)) {
    problems.push({ line, issue: 'nome repetido na planilha', detail: `${fullName} (linha ${seenNames.get(nameKey)})` });
    continue;
  }
  if (slackUserId && seenSlack.has(slackUserId)) {
    problems.push({ line, issue: 'ID do Slack repetido', detail: `${fullName} (linha ${seenSlack.get(slackUserId)})` });
    continue;
  }
  seenNames.set(nameKey, line);
  if (slackUserId) seenSlack.set(slackUserId, line);

  valid.push({
    fullName,
    cpf,
    role: get('role'),
    sector: get('sector'),
    email: get('email') || undefined,
    slackUserId: slackUserId || undefined,
    active: true,
    _linha: line,
  });
}

console.log(`válidos  : ${valid.length}`);
console.log(`problemas: ${problems.length}`);
if (problems.length) {
  console.log('');
  for (const p of problems.slice(0, 20)) {
    console.log(`  linha ${String(p.line).padStart(4)} · ${p.issue}${p.detail ? ` · ${p.detail}` : ''}`);
  }
  if (problems.length > 20) console.log(`  … e mais ${problems.length - 20}`);
}

const missing = {
  cpf: valid.filter((v) => !v.cpf).length,
  role: valid.filter((v) => !v.role).length,
  sector: valid.filter((v) => !v.sector).length,
  slack: valid.filter((v) => !v.slackUserId).length,
};
console.log('');
console.log('a completar na primeira assinatura:');
console.log(`  sem CPF ${missing.cpf} · sem cargo ${missing.role} · sem setor ${missing.sector}`);
console.log(`  sem ID do Slack (não receberão DM): ${missing.slack}`);

console.log('\namostra:');
for (const person of valid.slice(0, 5)) {
  console.log(`  ${person.fullName.padEnd(40)} ${person.slackUserId ?? '—'}`);
}
if (valid.length > 5) console.log(`  … e mais ${valid.length - 5}`);

if (!apply) {
  console.log('\n(conferência apenas — nada foi gravado. Use --aplicar para importar.)');
  console.log('Nenhuma mensagem do Slack é enviada por este comando.\n');
  process.exit(0);
}

/* -------------------------------------------------------- gravação */

console.log('\ngravando…\n');

const newId = (prefix) => {
  const time = Date.now().toString(36);
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let random = '';
  for (const byte of require('node:crypto').randomBytes(6)) random += alphabet[byte % alphabet.length];
  return `${prefix}${time}${random}`;
};

let created = 0;
let skipped = 0;
const failures = [];

if (apiBase) {
  const token = process.env.API_TOKEN;
  if (!token) {
    console.error('✖ Defina API_TOKEN com um ID token válido para usar --api.');
    process.exit(1);
  }
  const existing = await (
    await fetch(`${apiBase}/api/employees?includeInactive=true`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const known = new Set(existing.employees.map((e) => normalize(e.fullName)));

  for (const person of valid) {
    if (known.has(normalize(person.fullName))) { skipped += 1; continue; }
    const { _linha, ...body } = person;
    const response = await fetch(`${apiBase}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (response.ok) created += 1;
    else failures.push({ person, error: (await response.json()).error });
  }
} else {
  const admin = require(`${ROOT}/node_modules/firebase-admin`);
  const credentialPath = path.join(ROOT, 'server/service-account.json');
  if (!fs.existsSync(credentialPath)) {
    console.error('✖ server/service-account.json não encontrado. Use --api para importar pela API.');
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath, 'utf8'))) });
  }
  const db = admin.firestore();

  const snapshot = await db.collection('employees').get();
  const known = new Set(snapshot.docs.map((doc) => normalize(doc.data().fullName)));

  for (const person of valid) {
    if (known.has(normalize(person.fullName))) { skipped += 1; continue; }
    const { _linha, ...body } = person;
    const now = new Date().toISOString();
    const id = newId('col_');
    try {
      await db.collection('employees').doc(id).set({
        id,
        ...body,
        email: body.email ?? null,
        slackUserId: body.slackUserId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    } catch (error) {
      failures.push({ person, error: error.message });
    }
  }
}

console.log(`  ${created} cadastrado(s) · ${skipped} já existia(m) · ${failures.length} falha(s)`);
for (const failure of failures.slice(0, 10)) {
  console.log(`  ✖ ${failure.person.fullName}: ${failure.error}`);
}
console.log('\nNenhuma mensagem foi enviada no Slack.\n');
