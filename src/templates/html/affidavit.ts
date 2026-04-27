import { AffidavitData } from '../../types';
import { escapeHtml, nl2br } from '../../utils/escape';
import { wrapHtml } from './layout';

export function generateAffidavitHTML(data: AffidavitData): string {
  const e = escapeHtml;

  const body = `
    <h1 class="doc-title">Affidavit</h1>
    <h2 class="doc-subtitle">Sworn Statement of the Deponent</h2>

    <p>I, <span class="label">${e(data.deponentName)}</span>,
      <span class="label">${e(data.deponentRelationType)} ${e(data.deponentRelationName)}</span>,
      aged about <span class="label">${e(data.age)}</span> years,
      occupation <span class="label">${e(data.occupation)}</span>, residing at
      ${nl2br(data.address)}, do hereby solemnly affirm and declare as follows:</p>

    <div class="section">
      <p><span class="label">1. Purpose:</span> ${nl2br(data.purpose)}</p>
      <p><span class="label">2. Statement:</span></p>
      <p>${nl2br(data.statement)}</p>
      <p><span class="label">3.</span> The contents of this affidavit are
        true and correct to the best of my knowledge and belief, and nothing
        material has been concealed therefrom.</p>
    </div>

    <div class="verification">
      <p><span class="label">VERIFICATION</span></p>
      <p>Verified at <span class="label">${e(data.executionPlace)}</span> on
        this <span class="label">${e(data.executionDate)}</span>, that the
        contents of the above affidavit are true and correct to the best of
        my knowledge and belief.</p>
    </div>

    <div class="signature-block">
      <div class="signature-box">Signature of Deponent<br/>(${e(data.deponentName)})</div>
      <div class="signature-box">Attested by Notary / Magistrate</div>
    </div>
  `;

  return wrapHtml({ title: 'Affidavit', body });
}
