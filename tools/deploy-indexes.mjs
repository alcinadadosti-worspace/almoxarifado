#!/usr/bin/env node
/**
 * deploy-indexes.mjs
 * ------------------------------------------------------------------
 * Cria no Firestore os índices compostos declarados em
 * `firestore.indexes.json`, usando a conta de serviço do Admin SDK.
 *
 * Existe para não depender do Firebase CLI (que exige login interativo e
 * ~100 MB de instalação) só para publicar quatro índices.
 *
 * Uso:  npm run firestore:indexes
 *       node tools/deploy-indexes.mjs --dry-run
 *
 * Credencial, na ordem: FIREBASE_SERVICE_ACCOUNT (JSON ou base64),
 * FIREBASE_SERVICE_ACCOUNT_PATH, ou server/service-account.json.
 * ------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const dryRun = process.argv.includes('--dry-run');

/* ------------------------------------------------------- credencial */
function loadServiceAccount() {
  const inline = (process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim();
  if (inline) {
    const json = inline.startsWith('{') ? inline : Buffer.from(inline, 'base64').toString('utf8');
    return JSON.parse(json);
  }
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(ROOT, 'server/service-account.json'),
    path.join(ROOT, 'service-account.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(ROOT, candidate);
    if (fs.existsSync(resolved)) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }
  throw new Error(
    'Conta de serviço não encontrada. Coloque o JSON em server/service-account.json ' +
      'ou defina FIREBASE_SERVICE_ACCOUNT.',
  );
}

const serviceAccount = loadServiceAccount();
const projectId = serviceAccount.project_id;
if (!projectId) throw new Error('A conta de serviço não traz project_id.');

/* ------------------------------------------------------------ token */
async function accessToken() {
  const admin = require('firebase-admin');
  const app = admin.apps.length
    ? admin.apps[0]
    : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'indexes');
  const token = await app.options.credential.getAccessToken();
  return token.access_token;
}

/* ----------------------------------------------------------- índices */
const declared = JSON.parse(fs.readFileSync(path.join(ROOT, 'firestore.indexes.json'), 'utf8'));
const wanted = declared.indexes ?? [];

const signature = (collection, fields) =>
  `${collection}: ${fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath} ${f.order === 'DESCENDING' ? 'DESC' : 'ASC'}`)
    .join(' + ')}`;

const base = (collection) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/${collection}/indexes`;

async function run() {
  console.log(`\nprojeto: ${projectId}`);
  console.log(`índices declarados: ${wanted.length}\n`);

  if (dryRun) {
    for (const index of wanted) console.log('  •', signature(index.collectionGroup, index.fields));
    console.log('\n(--dry-run: nada foi enviado)');
    return;
  }

  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // o que já existe, para não duplicar
  const existing = new Set();
  for (const collection of new Set(wanted.map((i) => i.collectionGroup))) {
    const response = await fetch(base(collection), { headers });
    if (!response.ok) continue;
    const body = await response.json();
    for (const index of body.indexes ?? []) {
      existing.add(signature(collection, index.fields ?? []));
    }
  }

  let created = 0;
  let kept = 0;

  for (const index of wanted) {
    const label = signature(index.collectionGroup, index.fields);
    if (existing.has(label)) {
      console.log(`  = ${label}  (já existia)`);
      kept += 1;
      continue;
    }

    const response = await fetch(base(index.collectionGroup), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        queryScope: index.queryScope ?? 'COLLECTION',
        fields: index.fields,
      }),
    });

    if (response.ok) {
      console.log(`  + ${label}  (criando…)`);
      created += 1;
      continue;
    }

    const error = await response.text();
    if (response.status === 409 || /already exists/i.test(error)) {
      console.log(`  = ${label}  (já existia)`);
      kept += 1;
    } else {
      console.error(`  ! ${label}\n    HTTP ${response.status} ${error.slice(0, 300)}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n${created} criado(s), ${kept} já existente(s).`);
  if (created) {
    console.log('A construção leva alguns minutos; acompanhe em');
    console.log(`https://console.firebase.google.com/project/${projectId}/firestore/indexes`);
  }
}

run().catch((error) => {
  console.error('\nfalhou:', error.message);
  process.exit(1);
});
