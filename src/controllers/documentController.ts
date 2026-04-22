import { Request, Response, NextFunction } from 'express';
import { generateDocx } from '../services/docxService';
import { generatePdf } from '../services/pdfService';
import { generatePreviewHtml } from '../services/previewService';
import { DocumentType } from '../types';
import {
  generateRequestSchema,
  previewRequestSchema,
  validateDocumentData,
} from '../utils/validation';

const DOCUMENT_TITLES: Record<DocumentType, string> = {
  'sale-deed': 'Sale-Deed',
  rental: 'Rental-Agreement',
  affidavit: 'Affidavit',
};

function fileName(type: DocumentType, format: 'pdf' | 'docx'): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${DOCUMENT_TITLES[type]}-${stamp}.${format}`;
}

export async function generateDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = generateRequestSchema.parse(req.body);
    const data = validateDocumentData(parsed.type, parsed.data);

    if (parsed.format === 'pdf') {
      const buffer = await generatePdf(parsed.type, data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName(parsed.type, 'pdf')}"`,
      );
      res.send(buffer);
      return;
    }

    const buffer = await generateDocx(parsed.type, data);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName(parsed.type, 'docx')}"`,
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export function previewDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const parsed = previewRequestSchema.parse(req.body);
    const data = validateDocumentData(parsed.type, parsed.data);
    const html = generatePreviewHtml(parsed.type, data);
    res.json({ html });
  } catch (err) {
    next(err);
  }
}
