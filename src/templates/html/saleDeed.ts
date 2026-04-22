import { SaleDeedData } from '../../types';
import { escapeHtml, nl2br } from '../../utils/escape';
import { wrapHtml } from './layout';

export function generateSaleDeedHTML(data: SaleDeedData): string {
  const e = escapeHtml;

  const body = `
    <h1 class="doc-title">Sale Deed</h1>
    <h2 class="doc-subtitle">State of Telangana</h2>

    <p>This <span class="label">SALE DEED</span> is made and executed on this
      <span class="label">${e(data.executionDate)}</span> at
      <span class="label">${e(data.executionPlace)}</span>.</p>

    <div class="section">
      <p><span class="label">BETWEEN</span></p>
      <p><span class="label">${e(data.sellerName)}</span>, residing at
        ${nl2br(data.sellerAddress)}, hereinafter referred to as the
        <span class="label">"SELLER"</span> (which expression shall, unless
        repugnant to the context, include their legal heirs, successors,
        executors and administrators) of the ONE PART.</p>
    </div>

    <div class="section">
      <p><span class="label">AND</span></p>
      <p><span class="label">${e(data.buyerName)}</span>, residing at
        ${nl2br(data.buyerAddress)}, hereinafter referred to as the
        <span class="label">"BUYER"</span> (which expression shall, unless
        repugnant to the context, include their legal heirs, successors,
        executors and administrators) of the OTHER PART.</p>
    </div>

    <div class="section">
      <p><span class="label">WHEREAS</span> the Seller is the absolute owner
        in lawful possession of the property more particularly described below:</p>
      <p><span class="label">Schedule of Property:</span><br/>
        ${nl2br(data.propertyDetails)}</p>
      <p><span class="label">Property Address:</span> ${nl2br(data.propertyAddress)}</p>
    </div>

    <div class="section">
      <p><span class="label">AND WHEREAS</span> the Seller has agreed to sell
        and the Buyer has agreed to purchase the said property for a total
        consideration of <span class="label">₹ ${e(data.saleAmount)}</span>
        (Rupees ${e(data.saleAmountWords)} only).</p>
    </div>

    <div class="section">
      <p><span class="label">NOW THIS DEED WITNESSETH AS FOLLOWS:</span></p>
      <p>1. The Seller hereby conveys, transfers, and assures unto the Buyer,
        absolutely and forever, the said property together with all rights,
        easements and appurtenances attached thereto.</p>
      <p>2. The Seller has received the full sale consideration of
        ₹ ${e(data.saleAmount)} (Rupees ${e(data.saleAmountWords)} only) from
        the Buyer, the receipt of which is hereby acknowledged.</p>
      <p>3. The Seller covenants that the property is free from all
        encumbrances, liens, charges, and claims of any third party.</p>
      <p>4. The Buyer shall hereafter hold, possess, and enjoy the property
        as its absolute owner without any interruption from the Seller or
        any person claiming under them.</p>
      <p>5. The Seller shall execute and deliver such further documents as
        may be reasonably required to perfect the Buyer's title to the property.</p>
    </div>

    <div class="section">
      <p><span class="label">Schedule of Boundaries:</span></p>
      <table class="boundaries">
        <tr>
          <td style="width:20%"><span class="label">North</span></td>
          <td>${e(data.northBoundary)}</td>
        </tr>
        <tr>
          <td><span class="label">South</span></td>
          <td>${e(data.southBoundary)}</td>
        </tr>
        <tr>
          <td><span class="label">East</span></td>
          <td>${e(data.eastBoundary)}</td>
        </tr>
        <tr>
          <td><span class="label">West</span></td>
          <td>${e(data.westBoundary)}</td>
        </tr>
      </table>
    </div>

    <p>IN WITNESS WHEREOF, the parties have signed this Sale Deed on the
      day and year first above written.</p>

    <div class="signature-block">
      <div class="signature-box">Signature of Seller<br/>(${e(data.sellerName)})</div>
      <div class="signature-box">Signature of Buyer<br/>(${e(data.buyerName)})</div>
    </div>

    <div class="witness-block">
      <p><span class="label">Witnesses:</span></p>
      <div class="witness-box">1. _______________________________</div>
      <div class="witness-box">2. _______________________________</div>
    </div>
  `;

  return wrapHtml({ title: 'Sale Deed', body });
}
