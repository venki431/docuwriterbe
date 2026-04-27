import { Document, Packer } from 'docx';
import { AffidavitData } from '../../types';
import {
  DOC_NUMBERING,
  DOC_STYLES,
  body,
  bold,
  buildSection,
  clause,
  sectionHeading,
  signatureBlock,
  spacer,
  stampNote,
  subtitle,
  title,
} from './helpers';

export async function generateAffidavitDocx(data: AffidavitData): Promise<Buffer> {
  const doc = new Document({
    creator: 'DocuWriter',
    title: 'Affidavit',
    description: 'Affidavit generated via DocuWriter',
    styles: DOC_STYLES,
    numbering: DOC_NUMBERING,
    sections: [
      buildSection([
        title('Affidavit'),
        subtitle('Sworn Statement of the Deponent'),

        stampNote('[ Affix Non-Judicial Stamp Paper of requisite value here ]'),

        body([
          `I, `,
          bold(data.deponentName),
          `, `,
          bold(`${data.deponentRelationType} ${data.deponentRelationName}`),
          `, aged about ${data.age} years, by occupation ${data.occupation}, residing at ${data.address}, do hereby solemnly affirm and sincerely declare as follows:`,
        ]),

        clause([bold('Purpose. '), data.purpose]),
        clause([bold('Statement. '), data.statement]),
        clause([
          `That the statements made herein above are true and correct to the best of my knowledge, information and belief, and nothing material has been concealed therefrom.`,
        ]),

        sectionHeading('Verification'),
        body([
          `Verified at `,
          bold(data.executionPlace),
          ` on this `,
          bold(data.executionDate),
          `, that the contents of the above affidavit are true and correct to the best of my knowledge and belief, and that no part of it is false and nothing material has been concealed therefrom.`,
        ]),

        spacer(480),

        signatureBlock(
          { label: 'Signature of Deponent', name: data.deponentName },
          { label: 'Attested by', name: 'Notary / Magistrate' },
        ),
      ]),
    ],
  });

  return await Packer.toBuffer(doc);
}
