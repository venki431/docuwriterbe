import { RentalData } from '../../types';
import { escapeHtml, nl2br } from '../../utils/escape';
import { wrapHtml } from './layout';

export function generateRentalHTML(data: RentalData): string {
  const e = escapeHtml;

  const body = `
    <h1 class="doc-title">Rental Agreement</h1>
    <h2 class="doc-subtitle">Residential Lease &mdash; Telangana / Andhra Pradesh</h2>

    <p>This <span class="label">RENTAL AGREEMENT</span> is made and executed
      on <span class="label">${e(data.executionDate)}</span> at
      <span class="label">${e(data.executionPlace)}</span>.</p>

    <div class="section">
      <p><span class="label">BETWEEN</span></p>
      <p><span class="label">${e(data.landlordName)}</span>, residing at
        ${nl2br(data.landlordAddress)}, hereinafter referred to as the
        <span class="label">"LANDLORD"</span> (which expression shall include
        their heirs, legal representatives and assigns) of the ONE PART;</p>
    </div>

    <div class="section">
      <p><span class="label">AND</span></p>
      <p><span class="label">${e(data.tenantName)}</span>, residing at
        ${nl2br(data.tenantAddress)}, hereinafter referred to as the
        <span class="label">"TENANT"</span> (which expression shall include
        their heirs, legal representatives and assigns) of the OTHER PART.</p>
    </div>

    <div class="section">
      <p><span class="label">WHEREAS</span> the Landlord is the absolute owner
        of the premises situated at
        <span class="label">${nl2br(data.propertyAddress)}</span>
        (hereinafter referred to as the "Scheduled Premises") and has agreed
        to let it out to the Tenant on the terms and conditions set out below.</p>
    </div>

    <div class="section">
      <p><span class="label">NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:</span></p>
      <p><span class="label">1. Term.</span> The tenancy shall commence on
        <span class="label">${e(data.startDate)}</span> and shall remain in
        force for a period of <span class="label">${e(data.leaseDurationMonths)} months</span>,
        renewable with mutual consent.</p>
      <p><span class="label">2. Rent.</span> The Tenant shall pay a monthly
        rent of <span class="label">₹ ${e(data.monthlyRent)}</span>, payable
        on or before the 5th day of every English calendar month.</p>
      <p><span class="label">3. Security Deposit.</span> The Tenant has paid
        a refundable interest-free security deposit of
        <span class="label">₹ ${e(data.securityDeposit)}</span>, which shall
        be returned on vacating the premises after adjusting any unpaid rent
        or damages beyond normal wear and tear.</p>
      <p><span class="label">4. Use.</span> The premises shall be used only
        for residential purposes and shall not be sub-let, assigned, or
        parted with in any manner without the prior written consent of the
        Landlord.</p>
      <p><span class="label">5. Utilities.</span> Electricity, water, gas
        and any other consumption-based charges shall be borne by the Tenant
        and paid directly to the respective authorities.</p>
      <p><span class="label">6. Maintenance.</span> The Tenant shall keep
        the premises in good and tenantable condition. Structural repairs
        shall be the responsibility of the Landlord; day-to-day minor
        repairs shall be borne by the Tenant.</p>
      <p><span class="label">7. Termination.</span> Either party may
        terminate this agreement by giving one month's prior written notice
        to the other party.</p>
      <p><span class="label">8. Inspection.</span> The Landlord or his
        authorised representative may, after reasonable prior notice,
        inspect the premises during daylight hours.</p>
    </div>

    <p>IN WITNESS WHEREOF, the parties have set their hands on the day,
      month and year first above written.</p>

    <div class="signature-block">
      <div class="signature-box">Signature of Landlord<br/>(${e(data.landlordName)})</div>
      <div class="signature-box">Signature of Tenant<br/>(${e(data.tenantName)})</div>
    </div>

    <div class="witness-block">
      <p><span class="label">Witnesses:</span></p>
      <div class="witness-box">1. _______________________________</div>
      <div class="witness-box">2. _______________________________</div>
    </div>
  `;

  return wrapHtml({ title: 'Rental Agreement', body });
}
