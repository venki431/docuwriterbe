import { DocumentType } from '../types';
import { generateSaleDeedDocx } from '../templates/docx/saleDeed';
import { generateRentalDocx } from '../templates/docx/rental';
import { generateAffidavitDocx } from '../templates/docx/affidavit';

export async function generateDocx(
  type: DocumentType,
  data: Record<string, string | number>,
): Promise<Buffer> {
  const d = data as any;
  switch (type) {
    case 'sale-deed':
      return generateSaleDeedDocx(d);
    case 'rental':
      return generateRentalDocx(d);
    case 'affidavit':
      return generateAffidavitDocx(d);
  }
}
