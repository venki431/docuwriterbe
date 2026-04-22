import {
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { SaleDeedData } from '../../types';
import {
  DOC_NUMBERING,
  DOC_STYLES,
  body,
  bold,
  buildSection,
  clause,
  plain,
  sectionHeading,
  signatureBlock,
  spacer,
  stampNote,
  subtitle,
  title,
  witnessSection,
} from './helpers';

function boundaryRow(direction: string, desc: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 22, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        shading: { fill: 'F3F4F6' },
        children: [
          new Paragraph({
            children: [new TextRun({ text: direction, bold: true, size: 24 })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 78, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: desc, size: 24 })],
          }),
        ],
      }),
    ],
  });
}

function boundariesTable(data: SaleDeedData): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: '9CA3AF' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [
      boundaryRow('North', data.northBoundary),
      boundaryRow('South', data.southBoundary),
      boundaryRow('East', data.eastBoundary),
      boundaryRow('West', data.westBoundary),
    ],
  });
}

export async function generateSaleDeedDocx(data: SaleDeedData): Promise<Buffer> {
  const doc = new Document({
    creator: 'DocuWriter',
    title: 'Sale Deed',
    description: 'Sale Deed generated via DocuWriter',
    styles: DOC_STYLES,
    numbering: DOC_NUMBERING,
    sections: [
      buildSection([
        title('Sale Deed'),
        subtitle('State of Telangana'),

        stampNote('[ Affix Non-Judicial Stamp / e-Stamp of requisite value here ]'),

        body([
          `This `,
          bold('SALE DEED'),
          ` is made and executed on this `,
          bold(data.executionDate),
          ` at `,
          bold(data.executionPlace),
          `.`,
        ]),

        sectionHeading('Between'),
        body([
          bold(data.sellerName),
          `, residing at ${data.sellerAddress}, hereinafter referred to as the `,
          bold('“SELLER”'),
          ` (which expression shall, unless repugnant to the context, include their legal heirs, successors, executors and administrators) of the ONE PART;`,
        ]),

        sectionHeading('And'),
        body([
          bold(data.buyerName),
          `, residing at ${data.buyerAddress}, hereinafter referred to as the `,
          bold('“BUYER”'),
          ` (which expression shall, unless repugnant to the context, include their legal heirs, successors, executors and administrators) of the OTHER PART.`,
        ]),

        sectionHeading('Whereas'),
        body([
          `The Seller is the absolute owner in lawful possession of the property more particularly described in the Schedule of Property below, having acquired the same through lawful means, and has agreed to sell the same to the Buyer who has agreed to purchase the same for the consideration and on the terms set forth herein.`,
        ]),

        sectionHeading('Schedule of Property'),
        body([bold('Description: '), plain(data.propertyDetails)]),
        body([bold('Address: '), plain(data.propertyAddress)]),

        sectionHeading('Consideration'),
        body([
          `The total sale consideration agreed between the parties is `,
          bold(`Rs. ${data.saleAmount}/-`),
          ` (Rupees ${data.saleAmountWords} only), the receipt of which in full is hereby acknowledged by the Seller.`,
        ]),

        sectionHeading('Now this deed witnesseth as follows'),
        clause([
          `The Seller hereby conveys, transfers, assigns and assures unto the Buyer, absolutely and forever, the Scheduled Property together with all rights, easements, privileges and appurtenances attached thereto.`,
        ]),
        clause([
          `The Seller has received the full sale consideration of Rs. ${data.saleAmount}/- (Rupees ${data.saleAmountWords} only) from the Buyer, the receipt whereof is hereby acknowledged.`,
        ]),
        clause([
          `The Seller covenants and warrants that the Scheduled Property is free from all encumbrances, liens, charges, mortgages, attachments, litigations and claims of whatsoever nature by any third party.`,
        ]),
        clause([
          `The Buyer shall hereafter hold, possess and enjoy the Scheduled Property as its absolute owner without any let, hindrance, interruption, claim or demand from the Seller or any person claiming under or through them.`,
        ]),
        clause([
          `The Seller shall execute and deliver any further documents or assurances as may be reasonably required to perfect the Buyer’s title to the Scheduled Property.`,
        ]),
        clause([
          `All statutory dues, taxes, cesses and charges in respect of the Scheduled Property up to the date of execution of this deed shall be borne by the Seller, and thereafter by the Buyer.`,
        ]),

        sectionHeading('Schedule of Boundaries'),
        boundariesTable(data),

        spacer(320),
        body([
          `IN WITNESS WHEREOF, the parties hereto have set their hands on this deed on the day, month and year first above written, in the presence of the witnesses whose names and signatures appear hereunder.`,
        ]),

        signatureBlock(
          { label: 'Signature of Seller', name: data.sellerName },
          { label: 'Signature of Buyer', name: data.buyerName },
        ),

        ...witnessSection(),
      ]),
    ],
  });

  return await Packer.toBuffer(doc);
}
