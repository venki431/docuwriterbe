import { DocumentType } from '../types';
import { generateSaleDeedDocx } from '../templates/docx/saleDeed';
import { generateRentalDocx } from '../templates/docx/rental';
import { generateAffidavitDocx } from '../templates/docx/affidavit';
import { makeOfficeCompatible } from '../templates/docx/sanitize';

export async function generateDocx(
  type: DocumentType,
  data: Record<string, string | number>,
): Promise<Buffer> {
  const buffer = await dispatch(type, data);
  return makeOfficeCompatible(buffer);
}

function dispatch(type: DocumentType, data: Record<string, string | number>): Promise<Buffer> {
  const d = data as any;
  switch (type) {
    case 'agreement-of-sale':
      return generateSaleDeedDocx(d);
    case 'rental':
      return generateRentalDocx(d);
    case 'affidavit':
      return generateAffidavitDocx(d);
  }
}
