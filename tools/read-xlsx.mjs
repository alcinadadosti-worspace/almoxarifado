#!/usr/bin/env node
/**
 * read-xlsx.mjs
 * ------------------------------------------------------------------
 * Lê uma planilha .xlsx e devolve as linhas como objetos, sem depender de
 * nenhuma biblioteca: um .xlsx é um zip com XML dentro, e o que precisamos
 * (strings compartilhadas + células da primeira aba) sai com `zlib` puro.
 *
 * Uso:  node tools/read-xlsx.mjs planilha.xlsx [--json]
 * ------------------------------------------------------------------
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

/* ------------------------------------------------------------- unzip */

/** Extrai as entradas de um zip (deflate ou store) em memória. */
export function unzip(buffer) {
  const files = {};
  let offset = 0;

  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buffer.readUInt16LE(offset + 8);
    let compressed = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;

    // Tamanho zero com bit 3 ligado: o tamanho real vem no data descriptor,
    // depois dos dados. Procuramos o próximo cabeçalho para delimitar.
    if (compressed === 0) {
      let next = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), start);
      if (next < 0) next = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), start);
      compressed = (next < 0 ? buffer.length : next) - start;
    }

    let data = buffer.subarray(start, start + compressed);
    if (method === 8) {
      try {
        data = zlib.inflateRawSync(data);
      } catch {
        data = Buffer.alloc(0);
      }
    }
    files[name] = data;
    offset = start + compressed;
  }
  return files;
}

/* --------------------------------------------------------------- xml */

const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');

/** Texto de um <si>, juntando os <t> de runs formatados. */
function sharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, body]) =>
    decodeEntities([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')),
  );
}

/** "BC12" → { col: 54, row: 12 } */
function parseRef(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  let col = 0;
  for (const char of match[1]) col = col * 26 + (char.charCodeAt(0) - 64);
  return { col, row: Number(match[2]) };
}

/* ------------------------------------------------------------ leitura */

/** Devolve `{ header, rows }`, com `rows` como objetos indexados pelo cabeçalho. */
export function readXlsx(path) {
  const files = unzip(fs.readFileSync(path));
  const strings = sharedStrings(files['xl/sharedStrings.xml']?.toString('utf8'));

  const sheetName =
    Object.keys(files).find((name) => /^xl\/worksheets\/sheet1\.xml$/.test(name)) ??
    Object.keys(files).find((name) => /^xl\/worksheets\/.*\.xml$/.test(name));
  const sheet = files[sheetName]?.toString('utf8') ?? '';

  const grid = new Map();
  let maxCol = 0;

  for (const [, attrs, body] of sheet.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
    const position = ref && parseRef(ref);
    if (!position) continue;

    const type = /t="([^"]+)"/.exec(attrs)?.[1];
    let value = '';

    if (type === 'inlineStr') {
      value = decodeEntities([...(body ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
    } else {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body ?? '')?.[1];
      if (raw != null) value = type === 's' ? (strings[Number(raw)] ?? '') : decodeEntities(raw);
    }

    value = value.trim();
    if (!value) continue;
    if (!grid.has(position.row)) grid.set(position.row, new Map());
    grid.get(position.row).set(position.col, value);
    maxCol = Math.max(maxCol, position.col);
  }

  const rowNumbers = [...grid.keys()].sort((a, b) => a - b);
  if (!rowNumbers.length) return { header: [], rows: [] };

  // A primeira linha com conteúdo é o cabeçalho — planilhas exportadas às
  // vezes começam com linhas vazias.
  const headerRow = grid.get(rowNumbers[0]);
  const header = [];
  for (let col = 1; col <= maxCol; col++) header.push(headerRow.get(col) ?? `coluna${col}`);

  const rows = [];
  for (const number of rowNumbers.slice(1)) {
    const cells = grid.get(number);
    const record = { _linha: number };
    let empty = true;
    for (let col = 1; col <= maxCol; col++) {
      const value = cells.get(col) ?? '';
      record[header[col - 1]] = value;
      if (value) empty = false;
    }
    if (!empty) rows.push(record);
  }

  return { header, rows };
}

/* ---------------------------------------------------------------- cli */

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const file = process.argv[2];
  if (!file) {
    console.error('uso: node tools/read-xlsx.mjs <planilha.xlsx> [--json]');
    process.exit(1);
  }
  const { header, rows } = readXlsx(file);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log('colunas:', header.join(' | '));
    console.log('linhas :', rows.length);
    console.log('');
    for (const row of rows.slice(0, 10)) {
      console.log(' ', header.map((h) => `${h}=${row[h] || '—'}`).join('  ·  '));
    }
    if (rows.length > 10) console.log(`  … e mais ${rows.length - 10}`);
  }
}
