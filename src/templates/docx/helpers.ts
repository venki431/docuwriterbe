import {
  AlignmentType,
  BorderStyle,
  Footer,
  ISectionOptions,
  IStylesOptions,
  LevelFormat,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const FONT = 'Times New Roman';
const BODY_SIZE = 24; // half-points => 12pt
const SMALL_SIZE = 20; // 10pt
const TITLE_SIZE = 36; // 18pt
const HEADING_SIZE = 26; // 13pt

export const DOC_STYLES: IStylesOptions = {
  default: {
    document: {
      run: { font: FONT, size: BODY_SIZE },
      paragraph: { spacing: { line: 360, after: 160 } },
    },
    heading1: {
      run: { font: FONT, size: HEADING_SIZE, bold: true },
      paragraph: { spacing: { before: 240, after: 120 } },
    },
    title: {
      run: { font: FONT, size: TITLE_SIZE, bold: true },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 80 } },
    },
  },
};

export const DOC_NUMBERING = {
  config: [
    {
      reference: 'clauses',
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
          style: {
            paragraph: { indent: { left: 720, hanging: 360 } },
          },
        },
      ],
    },
  ],
};

function pageNumberFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Page ', size: SMALL_SIZE, color: '808080' }),
          new TextRun({ children: [PageNumber.CURRENT], size: SMALL_SIZE, color: '808080' }),
          new TextRun({ text: ' of ', size: SMALL_SIZE, color: '808080' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: SMALL_SIZE, color: '808080' }),
        ],
      }),
    ],
  });
}

export function buildSection(children: ISectionOptions['children']): ISectionOptions {
  return {
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4 in twips
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1"
      },
    },
    footers: { default: pageNumberFooter() },
    children,
  };
}

export function title(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: TITLE_SIZE,
      }),
    ],
  });
}

export function subtitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 360 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 6 },
    },
    children: [new TextRun({ text, italics: true, size: 22, color: '555555' })],
  });
}

export function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: HEADING_SIZE,
      }),
    ],
  });
}

export function body(children: (TextRun | string)[]): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 360 },
    children: children.map((c) =>
      typeof c === 'string' ? new TextRun({ text: c, size: BODY_SIZE }) : c,
    ),
  });
}

export function clause(children: (TextRun | string)[]): Paragraph {
  return new Paragraph({
    numbering: { reference: 'clauses', level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 360 },
    children: children.map((c) =>
      typeof c === 'string' ? new TextRun({ text: c, size: BODY_SIZE }) : c,
    ),
  });
}

export function bold(text: string): TextRun {
  return new TextRun({ text, bold: true, size: BODY_SIZE });
}

export function plain(text: string): TextRun {
  return new TextRun({ text, size: BODY_SIZE });
}

export function spacer(space = 360): Paragraph {
  return new Paragraph({
    spacing: { before: space, after: 0 },
    children: [new TextRun({ text: '' })],
  });
}

function signatureCell(label: string, name: string): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    borders: noBorders(),
    children: [
      new Paragraph({ spacing: { before: 720 }, children: [new TextRun('')] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 },
        },
        children: [new TextRun({ text: label, bold: true, size: BODY_SIZE })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: name, size: BODY_SIZE })],
      }),
    ],
  });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return {
    top: none,
    bottom: none,
    left: none,
    right: none,
    insideHorizontal: none,
    insideVertical: none,
  };
}

export function signatureBlock(left: { label: string; name: string }, right: { label: string; name: string }): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [signatureCell(left.label, left.name), signatureCell(right.label, right.name)],
      }),
    ],
  });
}

export function witnessSection(): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 480, after: 160 },
      children: [new TextRun({ text: 'WITNESSES:', bold: true, size: BODY_SIZE })],
    }),
    new Paragraph({
      spacing: { before: 320, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 } },
      children: [new TextRun({ text: '', size: BODY_SIZE })],
    }),
    new Paragraph({
      children: [new TextRun({ text: '1.  Name, Address & Signature', size: SMALL_SIZE, color: '555555' })],
    }),
    new Paragraph({
      spacing: { before: 480, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 } },
      children: [new TextRun({ text: '', size: BODY_SIZE })],
    }),
    new Paragraph({
      children: [new TextRun({ text: '2.  Name, Address & Signature', size: SMALL_SIZE, color: '555555' })],
    }),
  ];
}

export function stampNote(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    children: [
      new TextRun({
        text,
        italics: true,
        color: '808080',
        size: SMALL_SIZE,
      }),
    ],
  });
}
