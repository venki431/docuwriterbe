import { DocumentType } from '../types';
import { generateSaleDeedHTML } from '../templates/html/saleDeed';
import { generateRentalHTML } from '../templates/html/rental';
import { generateAffidavitHTML } from '../templates/html/affidavit';

export function generatePreviewHtml(
  type: DocumentType,
  data: Record<string, string | number>,
): string {
  const d = data as any;
  switch (type) {
    case 'agreement-of-sale':
      return generateSaleDeedHTML(d);
    case 'rental':
      return generateRentalHTML(d);
    case 'affidavit':
      return generateAffidavitHTML(d);
  }
}
