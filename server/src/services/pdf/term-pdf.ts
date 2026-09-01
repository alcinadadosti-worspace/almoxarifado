import crypto from 'node:crypto';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from 'pdf-lib';
import { MONOGRAM_PATH, MONOGRAM_VIEWBOX } from '../../assets/monogram';
import {
  TERM_RESPONSIBILITY_TEXT,
  TERM_SECTIONS,
  TERM_TITLE,
  itemDescription,
  itemQuantityLabel,
  termIntro,
  termPlaceAndDate,
} from '../../domain/term';
import type { CompanyInfo, Delivery } from '../../domain/types';
import { formatCpf } from '../../utils/cpf';

/* --------------------------------------------------------------- paleta */

const GOLD = rgb(0.788, 0.627, 0.314); // #C9A050
const GOLD_DEEP = rgb(0.541, 0.416, 0.184); // #8A6A2F
const GOLD_TINT = rgb(0.973, 0.957, 0.925); // #F8F4EC
const INK = rgb(0.086, 0.086, 0.098); // #161619
const MUTED = rgb(0.42, 0.42, 0.45);
const HAIRLINE = rgb(0.85, 0.83, 0.79);

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 52;
const CONTENT_WIDTH = A4.width - MARGIN * 2;

const dateTimeBR = (value: Date | string): string =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Maceio',
  });

/* ------------------------------------------------------- motor de layout */

interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
}

class TermLayout {
  page: PDFPage;
  y: number;
  private readonly pages: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    readonly fonts: Fonts,
    private readonly company: CompanyInfo,
  ) {
    this.page = this.newPage();
    this.y = A4.height - MARGIN;
  }

  private newPage(): PDFPage {
    const page = this.pdf.addPage([A4.width, A4.height]);
    this.pages.push(page);
    return page;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Garante espaço vertical; se faltar, abre nova página com cabeçalho leve. */
  ensure(height: number): void {
    if (this.y - height >= MARGIN + 42) return;
    this.page = this.newPage();
    this.y = A4.height - MARGIN;
    this.drawContinuationHeader();
  }

  private drawContinuationHeader(): void {
    drawMonogram(this.page, MARGIN, this.y, 18);
    this.page.drawText(ansi(this.company.name.toUpperCase()), {
      x: MARGIN + 26,
      y: this.y - 13,
      size: 7.5,
      font: this.fonts.sansBold,
      color: GOLD_DEEP,
    });
    this.page.drawText('TERMO DE RESPONSABILIDADE (continuação)', {
      x: MARGIN,
      y: this.y - 30,
      size: 7,
      font: this.fonts.sans,
      color: MUTED,
    });
    this.y -= 44;
    this.rule();
    this.y -= 14;
  }

  space(amount: number): void {
    this.y -= amount;
  }

  rule(color: RGB = HAIRLINE, thickness = 0.6, width = CONTENT_WIDTH, x = MARGIN): void {
    this.page.drawLine({
      start: { x, y: this.y },
      end: { x: x + width, y: this.y },
      thickness,
      color,
    });
  }

  /** Escreve um parágrafo com quebra automática e retorna a altura usada. */
  paragraph(
    text: string,
    options: {
      font?: PDFFont;
      size?: number;
      color?: RGB;
      lineHeight?: number;
      x?: number;
      width?: number;
      align?: 'left' | 'center' | 'right';
    } = {},
  ): void {
    const font = options.font ?? this.fonts.serif;
    const size = options.size ?? 10.5;
    const color = options.color ?? INK;
    const lineHeight = options.lineHeight ?? size * 1.55;
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_WIDTH;

    for (const line of wrapText(text, font, size, width)) {
      this.ensure(lineHeight);
      const lineWidth = font.widthOfTextAtSize(line, size);
      const offset =
        options.align === 'center'
          ? (width - lineWidth) / 2
          : options.align === 'right'
            ? width - lineWidth
            : 0;
      this.page.drawText(line, { x: x + offset, y: this.y - size, size, font, color });
      this.y -= lineHeight;
    }
  }

  /** Rótulo de seção dourado com filete — a "assinatura visual" do documento. */
  sectionTitle(label: string): void {
    this.ensure(34);
    this.y -= 8;
    this.page.drawText(spaced(label), {
      x: MARGIN,
      y: this.y - 9,
      size: 8.5,
      font: this.fonts.sansBold,
      color: GOLD_DEEP,
    });
    this.y -= 16;
    this.rule(GOLD, 0.8);
    this.y -= 12;
  }
}

/* ------------------------------------------------------------ utilidades */

/** Letterspacing manual (pdf-lib não expõe tracking). */
function spaced(text: string, amount = ' '): string {
  return text.split('').join(amount);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = String(text ?? '').split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // palavra maior que a linha inteira: quebra à força
        let chunk = word;
        while (font.widthOfTextAtSize(chunk, size) > maxWidth && chunk.length > 1) {
          let cut = chunk.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(chunk.slice(0, cut), size) > maxWidth) cut--;
          lines.push(chunk.slice(0, cut));
          chunk = chunk.slice(cut);
        }
        current = chunk;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Sanitiza para WinAnsi (CP1252), a codificação das fontes padrão do PDF.
 * Latin-1 passa direto; acima disso só sobrevive o que o CP1252 mapeia —
 * incluindo o travessão "—", essencial em "Camisa — Tamanho G".
 */
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));

function ansi(text: string): string {
  // «U+0000..U+00FF» passa direto (inclui quebras de linha); acima disso,
  // só o que o CP1252 mapeia.
  return String(text ?? '').replace(/[^\u0000-\u00FF]/g, (char) =>
    CP1252_EXTRA.has(char) ? char : '',
  );
}

function drawMonogram(page: PDFPage, x: number, topY: number, size: number): void {
  page.drawSvgPath(MONOGRAM_PATH, {
    x,
    y: topY,
    scale: size / MONOGRAM_VIEWBOX,
    color: GOLD,
    borderWidth: 0,
  });
}

/* --------------------------------------------------------------- tabela */

interface Column {
  title: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

function drawItemsTable(layout: TermLayout, delivery: Delivery): void {
  const columns: Column[] = [
    { title: 'Item', width: 34, align: 'center' },
    { title: 'Descrição do material', width: 214 },
    { title: 'Marca/Modelo', width: 96 },
    { title: 'Quantidade', width: 84, align: 'center' },
    { title: 'Estado de conservação', width: CONTENT_WIDTH - 34 - 214 - 96 - 84 },
  ];

  const headerHeight = 22;

  // cabeçalho — repetido no topo de cada página que a tabela ocupar
  const drawHeader = () => {
    layout.page.drawRectangle({
      x: MARGIN,
      y: layout.y - headerHeight,
      width: CONTENT_WIDTH,
      height: headerHeight,
      color: GOLD_TINT,
    });
    layout.page.drawLine({
      start: { x: MARGIN, y: layout.y - headerHeight },
      end: { x: MARGIN + CONTENT_WIDTH, y: layout.y - headerHeight },
      thickness: 0.6,
      color: GOLD,
    });

    let cursorX = MARGIN;
    for (const column of columns) {
      const label = ansi(column.title);
      const textWidth = layout.fonts.sansBold.widthOfTextAtSize(label, 7.5);
      const offset =
        column.align === 'center'
          ? (column.width - textWidth) / 2
          : column.align === 'right'
            ? column.width - textWidth - 8
            : 8;
      layout.page.drawText(label, {
        x: cursorX + offset,
        y: layout.y - 14.5,
        size: 7.5,
        font: layout.fonts.sansBold,
        color: GOLD_DEEP,
      });
      cursorX += column.width;
    }
    layout.y -= headerHeight;
  };

  layout.ensure(headerHeight + 26);
  drawHeader();

  // linhas
  delivery.items.forEach((item, index) => {
    const cells = [
      String(index + 1).padStart(2, '0'),
      ansi(itemDescription(item)),
      ansi([item.brand, item.model].filter(Boolean).join(' / ') || '—'),
      ansi(itemQuantityLabel(item)),
      ansi(item.conservation || '—'),
    ];

    // A descrição tem a primeira linha em negrito — medimos com a fonte mais
    // larga para que nenhuma linha invada a coluna vizinha.
    const wrapped = cells.map((cell, columnIndex) =>
      wrapText(
        cell,
        columnIndex === 1 ? layout.fonts.serifBold : layout.fonts.serif,
        9,
        columns[columnIndex].width - 16,
      ),
    );
    const lineCount = Math.max(...wrapped.map((lines) => lines.length));
    const rowHeight = Math.max(24, lineCount * 12.5 + 11);

    // Se a linha não couber e uma página nova for aberta, a tabela continua
    // com o cabeçalho — uma linha solta sem títulos de coluna é ilegível.
    const pagesBefore = layout.pageCount;
    layout.ensure(rowHeight + headerHeight);
    if (layout.pageCount !== pagesBefore) drawHeader();

    if (index % 2 === 1) {
      layout.page.drawRectangle({
        x: MARGIN,
        y: layout.y - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: rgb(0.988, 0.984, 0.976),
      });
    }

    let x = MARGIN;
    wrapped.forEach((lines, columnIndex) => {
      const column = columns[columnIndex];
      lines.forEach((line, lineIndex) => {
        const font = columnIndex === 1 && lineIndex === 0 ? layout.fonts.serifBold : layout.fonts.serif;
        const textWidth = font.widthOfTextAtSize(line, 9);
        const offset =
          column.align === 'center'
            ? (column.width - textWidth) / 2
            : column.align === 'right'
              ? column.width - textWidth - 8
              : 8;
        layout.page.drawText(line, {
          x: x + offset,
          y: layout.y - 15 - lineIndex * 12.5,
          size: 9,
          font,
          color: columnIndex === 0 ? MUTED : INK,
        });
      });
      x += column.width;
    });

    layout.y -= rowHeight;
    layout.page.drawLine({
      start: { x: MARGIN, y: layout.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: layout.y },
      thickness: 0.4,
      color: HAIRLINE,
    });
  });
}

/* --------------------------------------------------------- bloco de firma */

interface SignatureBlockInput {
  title: string;
  image?: Uint8Array;
  name: string;
  subtitle?: string;
  signedAt?: string;
}

async function drawSignatureBlock(
  layout: TermLayout,
  pdf: PDFDocument,
  input: SignatureBlockInput,
  x: number,
  width: number,
  baseY: number,
): Promise<void> {
  const lineY = baseY + 34;

  if (input.image) {
    try {
      // O canvas gera PNG, mas o schema aceita JPEG — embutir com o decodificador errado falha.
      const isJpeg = input.image[0] === 0xff && input.image[1] === 0xd8;
      const png = isJpeg ? await pdf.embedJpg(input.image) : await pdf.embedPng(input.image);
      const maxWidth = width - 20;
      const maxHeight = 46;
      const scale = Math.min(maxWidth / png.width, maxHeight / png.height, 1);
      const drawWidth = png.width * scale;
      const drawHeight = png.height * scale;
      layout.page.drawImage(png, {
        x: x + (width - drawWidth) / 2,
        y: lineY + 4,
        width: drawWidth,
        height: drawHeight,
      });
    } catch (error) {
      console.warn('[pdf] não foi possível embutir a assinatura', error);
    }
  }

  layout.page.drawLine({
    start: { x, y: lineY },
    end: { x: x + width, y: lineY },
    thickness: 0.8,
    color: GOLD,
  });

  const center = (text: string, font: PDFFont, size: number, y: number, color: RGB) => {
    const value = ansi(text);
    const textWidth = font.widthOfTextAtSize(value, size);
    layout.page.drawText(value, { x: x + (width - textWidth) / 2, y, size, font, color });
  };

  center(input.title, layout.fonts.sansBold, 7, lineY - 12, GOLD_DEEP);
  center(input.name, layout.fonts.serifBold, 9.5, lineY - 25, INK);
  if (input.subtitle) center(input.subtitle, layout.fonts.serif, 8, lineY - 36, MUTED);
  if (input.signedAt) center(input.signedAt, layout.fonts.sans, 7, lineY - 47, MUTED);
}

/* ------------------------------------------------------------- documento */

export interface TermPdfInput {
  delivery: Delivery;
  company: CompanyInfo;
  employeeSignature?: Uint8Array;
  adminSignature?: Uint8Array;
}

/** Gera o Termo de Responsabilidade assinado (A4, multipágina). */
export async function buildTermPdf(input: TermPdfInput): Promise<Uint8Array> {
  const { delivery, company } = input;
  const pdf = await PDFDocument.create();

  const fonts: Fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  pdf.setTitle(`Termo de Responsabilidade — ${delivery.employeeDraft.fullName}`);
  pdf.setAuthor(company.name);
  pdf.setSubject('Termo de Responsabilidade — Materiais da Empresa');
  pdf.setCreator('ACQUA Almoxarifado');
  pdf.setProducer('ACQUA Almoxarifado');
  pdf.setCreationDate(new Date());

  const layout = new TermLayout(pdf, fonts, company);

  /* ---------------------------------------------------------- cabeçalho */
  layout.page.drawRectangle({
    x: 0,
    y: A4.height - 6,
    width: A4.width,
    height: 6,
    color: GOLD,
  });

  drawMonogram(layout.page, MARGIN, layout.y - 6, 44);
  layout.page.drawText(spaced(ansi(company.name.toUpperCase())), {
    x: MARGIN + 58,
    y: layout.y - 26,
    size: 10,
    font: fonts.sansBold,
    color: INK,
  });
  layout.page.drawText(`CNPJ ${company.cnpj}  ·  ${ansi(company.headquarters)}`, {
    x: MARGIN + 58,
    y: layout.y - 39,
    size: 7.5,
    font: fonts.sans,
    color: MUTED,
  });
  layout.y -= 62;
  layout.rule(GOLD, 0.8);
  layout.y -= 26;

  /* -------------------------------------------------------------- título */
  layout.paragraph(ansi(TERM_TITLE), {
    font: fonts.serifBold,
    size: 13.5,
    align: 'center',
    lineHeight: 19,
  });
  layout.space(10);
  layout.paragraph(ansi(termIntro(company)), { size: 10, lineHeight: 15.5 });
  layout.space(6);

  /* ------------------------------------------------- 1. identificação */
  layout.sectionTitle(TERM_SECTIONS.identification);

  const identification: Array<[string, string]> = [
    ['Nome completo', delivery.employeeSignature?.fullName || delivery.employeeDraft.fullName || '—'],
    ['CPF', formatCpf(delivery.employeeSignature?.cpf || delivery.employeeDraft.cpf || '')],
    ['Cargo/Função', delivery.employeeDraft.role || '—'],
    ['Setor/Unidade', delivery.employeeDraft.sector || '—'],
  ];

  identification.forEach(([label, value], index) => {
    const columnIndex = index % 2;
    const x = MARGIN + columnIndex * (CONTENT_WIDTH / 2);
    if (columnIndex === 0) layout.ensure(34);
    const y = layout.y;
    layout.page.drawText(ansi(label.toUpperCase()), {
      x,
      y: y - 8,
      size: 6.5,
      font: fonts.sansBold,
      color: MUTED,
    });
    layout.page.drawText(ansi(value), {
      x,
      y: y - 22,
      size: 10.5,
      font: fonts.serifBold,
      color: INK,
    });
    layout.page.drawLine({
      start: { x, y: y - 28 },
      end: { x: x + CONTENT_WIDTH / 2 - 18, y: y - 28 },
      thickness: 0.4,
      color: HAIRLINE,
    });
    if (columnIndex === 1 || index === identification.length - 1) layout.y -= 40;
  });

  /* --------------------------------------------------------- 2. materiais */
  layout.sectionTitle(TERM_SECTIONS.materials);
  drawItemsTable(layout, delivery);
  layout.space(18);

  /* --------------------------------------------------- 3. responsabilidade */
  layout.sectionTitle(TERM_SECTIONS.responsibility);
  layout.paragraph(ansi(TERM_RESPONSIBILITY_TEXT), { size: 10, lineHeight: 15.5 });
  layout.space(12);

  const signedAt = delivery.employeeSignature?.signedAt
    ? new Date(delivery.employeeSignature.signedAt)
    : new Date();
  layout.paragraph(ansi(termPlaceAndDate(company, signedAt)), {
    size: 10,
    font: fonts.serif,
    align: 'right',
  });
  layout.space(26);

  /* -------------------------------------------------------- assinaturas */
  // Altura real do bloco (imagem + linha + três legendas) ≈ 112pt. Manter o
  // valor justo evita empurrar as assinaturas para uma página quase vazia.
  layout.ensure(112);
  const blockWidth = (CONTENT_WIDTH - 40) / 2;
  const baseY = layout.y - 62;

  await drawSignatureBlock(
    layout,
    pdf,
    {
      title: 'ASSINATURA DO(A) COLABORADOR(A)',
      image: input.employeeSignature,
      name: delivery.employeeSignature?.fullName || delivery.employeeDraft.fullName || '',
      subtitle: `CPF ${formatCpf(delivery.employeeSignature?.cpf || delivery.employeeDraft.cpf || '')}`,
      signedAt: delivery.employeeSignature
        ? `Assinado em ${dateTimeBR(delivery.employeeSignature.signedAt)}`
        : 'Aguardando assinatura',
    },
    MARGIN,
    blockWidth,
    baseY,
  );

  await drawSignatureBlock(
    layout,
    pdf,
    {
      title: 'ASSINATURA DO REPRESENTANTE DA EMPRESA',
      image: input.adminSignature,
      name: delivery.adminSignature?.adminName || company.name,
      subtitle: company.name,
      signedAt: delivery.adminSignature
        ? `Assinado em ${dateTimeBR(delivery.adminSignature.signedAt)}`
        : 'Aguardando contra-assinatura',
    },
    MARGIN + blockWidth + 40,
    blockWidth,
    baseY,
  );

  layout.y = baseY - 62;

  /* ---------------------------------------------- evidências e rodapé */
  const evidence = buildEvidence(delivery);
  layout.ensure(64);
  layout.rule(HAIRLINE, 0.5);
  layout.space(12);
  layout.page.drawText(spaced(ansi('REGISTRO ELETRÔNICO')), {
    x: MARGIN,
    y: layout.y - 7,
    size: 6.5,
    font: fonts.sansBold,
    color: GOLD_DEEP,
  });
  layout.space(16);
  layout.paragraph(ansi(evidence.text), {
    font: fonts.sans,
    size: 6.8,
    color: MUTED,
    lineHeight: 10,
  });

  // rodapé de todas as páginas
  const total = layout.pageCount;
  pdf.getPages().forEach((page, index) => {
    page.drawText(ansi(`${company.name} · Termo de Responsabilidade · ${delivery.id}`), {
      x: MARGIN,
      y: 28,
      size: 6.5,
      font: fonts.sans,
      color: MUTED,
    });
    const label = `${index + 1}/${total}`;
    page.drawText(label, {
      x: A4.width - MARGIN - fonts.sans.widthOfTextAtSize(label, 6.5),
      y: 28,
      size: 6.5,
      font: fonts.sans,
      color: MUTED,
    });
  });

  return pdf.save();
}

/** Bloco de evidências que dá força probatória ao documento eletrônico. */
function buildEvidence(delivery: Delivery): { text: string; hash: string } {
  const employee = delivery.employeeSignature;
  const admin = delivery.adminSignature;
  const payload = JSON.stringify({
    id: delivery.id,
    items: delivery.items,
    employee: employee && { cpf: employee.cpf, signedAt: employee.signedAt, ip: employee.ip },
    admin: admin && { uid: admin.adminUid, signedAt: admin.signedAt },
  });
  const hash = crypto.createHash('sha256').update(payload).digest('hex');

  const lines = [
    `Documento: ${delivery.id} · gerado em ${dateTimeBR(new Date())} (America/Maceio).`,
    employee
      ? `Aceite do(a) colaborador(a) em ${dateTimeBR(employee.signedAt)} · IP ${employee.ip ?? 'n/d'} · ` +
        `agente ${(employee.userAgent ?? 'n/d').slice(0, 96)}.`
      : 'Aceite do(a) colaborador(a): pendente.',
    admin
      ? `Contra-assinatura da empresa em ${dateTimeBR(admin.signedAt)} por ${admin.adminName} (${admin.adminUid}).`
      : 'Contra-assinatura da empresa: pendente.',
    `Integridade (SHA-256): ${hash}`,
  ];

  return { text: lines.join('\n'), hash };
}
