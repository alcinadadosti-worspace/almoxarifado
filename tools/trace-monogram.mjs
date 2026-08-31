#!/usr/bin/env node
/**
 * trace-monogram.mjs
 * ------------------------------------------------------------------
 * Vetoriza o monograma "AM" (PNG dourado do Grupo Alcina Maria) para:
 *   - assets/brand/monogram-am.svg          -> logo vetorial (UI / favicon)
 *   - web/src/assets/monogram.ts            -> path + contornos (Three.js)
 *   - server/src/assets/monogram.ts         -> path (pdf-lib drawSvgPath)
 *
 * Pipeline: decode PNG (zlib) -> máscara binária -> crack-following
 *           -> suavização Chaikin -> simplificação Ramer-Douglas-Peucker
 *           -> normalização para viewBox 0 0 1000 1000.
 *
 * Uso: node tools/trace-monogram.mjs
 * ------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PNG = path.join(ROOT, 'assets/brand/monogram-am.png');

const INK_THRESHOLD = 238; // luminância abaixo disso = traço
const MIN_AREA = 40; // descarta ruído (px²)
const CHAIKIN_PASSES = 3;
const RDP_EPSILON = 0.9;
const VIEWBOX = 1000;

/* ---------------------------------------------------------------- PNG */
function decodePng(buffer) {
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  let colorType = 6;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      colorType = buffer[offset + 17];
      if (buffer[offset + 16] !== 8) throw new Error('Somente PNG 8-bit é suportado');
      if (buffer[offset + 20] !== 0) throw new Error('PNG entrelaçado não é suportado');
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`colorType ${colorType} não suportado`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const base = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[base + i - channels] : 0;
      const b = y > 0 ? px[base - stride + i] : 0;
      const c = i >= channels && y > 0 ? px[base - stride + i - channels] : 0;
      let v = row[i];
      switch (filter) {
        case 1: v = (v + a) & 255; break;
        case 2: v = (v + b) & 255; break;
        case 3: v = (v + ((a + b) >> 1)) & 255; break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          break;
        }
        default: break;
      }
      px[base + i] = v;
    }
  }
  return { width, height, channels, px };
}

/* --------------------------------------------------------------- mask */
function buildMask({ width, height, channels, px }) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    let lum;
    if (channels === 1) lum = px[o];
    else lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
    const alpha = channels === 4 ? px[o + 3] : 255;
    mask[i] = alpha > 16 && lum < INK_THRESHOLD ? 1 : 0;
  }
  return mask;
}

/* ------------------------------------------------- crack following */
// Extrai contornos exatos ao longo das arestas dos pixels ("cracks").
function traceContours(mask, width, height) {
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]);
  const edges = new Map(); // "x,y" -> [{ tx, ty }]
  const push = (x, y, tx, ty) => {
    const key = `${x},${y}`;
    const list = edges.get(key);
    if (list) list.push({ tx, ty });
    else edges.set(key, [{ tx, ty }]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) push(x + 1, y, x, y); // topo  -> esquerda
      if (!at(x, y + 1)) push(x, y + 1, x + 1, y + 1); // base  -> direita
      if (!at(x - 1, y)) push(x, y, x, y + 1); // esq.  -> baixo
      if (!at(x + 1, y)) push(x + 1, y + 1, x + 1, y); // dir.  -> cima
    }
  }

  const contours = [];
  for (const [startKey, list] of edges) {
    while (list.length) {
      const contour = [];
      let [sx, sy] = startKey.split(',').map(Number);
      let cx = sx;
      let cy = sy;
      let dir = null;
      let guard = 0;
      while (guard++ < 4_000_000) {
        const key = `${cx},${cy}`;
        const outs = edges.get(key);
        if (!outs || !outs.length) break;
        let index = 0;
        if (outs.length > 1 && dir) {
          // vértice ambíguo (xadrez): escolhe a curva mais fechada à direita
          let best = -Infinity;
          outs.forEach((e, i) => {
            const nx = e.tx - cx;
            const ny = e.ty - cy;
            const cross = dir.x * ny - dir.y * nx; // > 0 = vira à direita (y p/ baixo)
            const dot = dir.x * nx + dir.y * ny;
            const score = cross > 0 ? 2 : cross < 0 ? 0 : dot > 0 ? 1 : -1;
            if (score > best) { best = score; index = i; }
          });
        }
        const edge = outs.splice(index, 1)[0];
        if (!outs.length) edges.delete(key);
        contour.push([cx, cy]);
        dir = { x: edge.tx - cx, y: edge.ty - cy };
        cx = edge.tx;
        cy = edge.ty;
        if (cx === sx && cy === sy) break;
      }
      if (contour.length > 7) contours.push(contour);
    }
  }
  return contours;
}

/* ------------------------------------------------------ geometria 2D */
const signedArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return a / 2;
};

function chaikin(pts, passes) {
  let out = pts;
  for (let k = 0; k < passes; k++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      const q = out[(i + 1) % out.length];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    out = next;
  }
  return out;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/* ---------------------------------------------------------------- run */
const png = decodePng(fs.readFileSync(SRC_PNG));
const mask = buildMask(png);
let contours = traceContours(mask, png.width, png.height)
  .map((c) => rdp(chaikin(c, CHAIKIN_PASSES), RDP_EPSILON))
  .filter((c) => c.length > 5 && Math.abs(signedArea(c)) >= MIN_AREA);

// normaliza para viewBox quadrado, mantendo proporção e centralizando
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const c of contours) for (const [x, y] of c) {
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const spanX = maxX - minX;
const spanY = maxY - minY;
const scale = (VIEWBOX * 0.94) / Math.max(spanX, spanY);
const offX = (VIEWBOX - spanX * scale) / 2;
const offY = (VIEWBOX - spanY * scale) / 2;
const round = (n) => Math.round(n * 10) / 10;
contours = contours.map((c) => c.map(([x, y]) => [round((x - minX) * scale + offX), round((y - minY) * scale + offY)]));

// aninhamento -> furos (profundidade ímpar)
const meta = contours.map((c, i) => {
  let depth = 0;
  for (let j = 0; j < contours.length; j++) {
    if (i !== j && pointInPolygon(c[0], contours[j])) depth++;
  }
  return { index: i, depth, hole: depth % 2 === 1, area: Math.abs(signedArea(c)) };
});

const toPath = (c) => `M${c.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
const d = contours.map(toPath).join('');

const points = contours.reduce((n, c) => n + c.length, 0);
const shapes = meta.filter((m) => !m.hole).length;
console.log(`contornos: ${contours.length} (${shapes} sólidos, ${contours.length - shapes} furos) · pontos: ${points} · path: ${(d.length / 1024).toFixed(1)}kB`);

/* ------------------------------------------------------------ output */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" fill="none">
  <defs>
    <linearGradient id="am-gold" x1="18%" y1="6%" x2="86%" y2="94%">
      <stop offset="0%" stop-color="#F2DCA6"/>
      <stop offset="34%" stop-color="#E3C27E"/>
      <stop offset="62%" stop-color="#C9A050"/>
      <stop offset="100%" stop-color="#8A6A2F"/>
    </linearGradient>
  </defs>
  <path fill="url(#am-gold)" fill-rule="evenodd" d="${d}"/>
</svg>
`;

const header = `/* Gerado por tools/trace-monogram.mjs — não edite à mão. */\n`;
const contourLiteral = JSON.stringify(contours.map((c, i) => ({ hole: meta[i].hole, points: c.flat() })));

const targets = [
  {
    file: 'assets/brand/monogram-am.svg',
    content: svg,
  },
  {
    file: 'web/public/monogram-am.svg',
    content: svg,
  },
  {
    file: 'web/src/assets/monogram.ts',
    content:
      header +
      `export const MONOGRAM_VIEWBOX = ${VIEWBOX};\n` +
      `export const MONOGRAM_PATH =\n  '${d}';\n\n` +
      `export type MonogramContour = { hole: boolean; points: number[] };\n` +
      `export const MONOGRAM_CONTOURS: MonogramContour[] = ${contourLiteral};\n`,
  },
  {
    file: 'server/src/assets/monogram.ts',
    content:
      header +
      `export const MONOGRAM_VIEWBOX = ${VIEWBOX};\n` +
      `export const MONOGRAM_PATH =\n  '${d}';\n`,
  },
];

for (const t of targets) {
  const dest = path.join(ROOT, t.file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, t.content);
  console.log(`  ✓ ${t.file}`);
}
