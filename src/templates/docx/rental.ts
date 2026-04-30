import { Document, Packer } from 'docx';
import { RentalData } from '../../types';
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
  witnessSection,
} from './helpers';

export async function generateRentalDocx(data: RentalData): Promise<Buffer> {
  const doc = new Document({
    creator: 'DocGen',
    title: 'Rental Agreement',
    description: 'Rental Agreement generated via DocGen',
    styles: DOC_STYLES,
    numbering: DOC_NUMBERING,
    sections: [
      buildSection([
        title('Rental Agreement'),
        subtitle('Residential Lease — Telangana / Andhra Pradesh'),

        stampNote('[ Affix Non-Judicial Stamp Paper of requisite value here ]'),

        body([
          `This `,
          bold('RENTAL AGREEMENT'),
          ` is made and executed on this `,
          bold(data.executionDate),
          ` at `,
          bold(data.executionPlace),
          `.`,
        ]),

        sectionHeading('Between'),
        body([
          bold(data.landlordName),
          `, residing at ${data.landlordAddress}, hereinafter referred to as the `,
          bold('“LANDLORD”'),
          ` (which expression shall include their heirs, legal representatives, executors, administrators and assigns) of the ONE PART;`,
        ]),

        sectionHeading('And'),
        body([
          bold(data.tenantName),
          `, residing at ${data.tenantAddress}, hereinafter referred to as the `,
          bold('“TENANT”'),
          ` (which expression shall include their heirs, legal representatives, executors, administrators and assigns) of the OTHER PART.`,
        ]),

        sectionHeading('Whereas'),
        body([
          `The Landlord is the absolute owner of the residential premises situated at ${data.propertyAddress} (hereinafter referred to as the `,
          bold('“Scheduled Premises”'),
          `) and has agreed to let out the same to the Tenant, who has agreed to take the Scheduled Premises on lease upon the terms and conditions set forth below.`,
        ]),

        sectionHeading('Now this agreement witnesseth as follows'),

        clause([
          bold('Term. '),
          `The tenancy shall commence on ${data.startDate} and shall remain in force for a period of ${data.leaseDurationMonths} months, renewable for a further period with the mutual written consent of both parties.`,
        ]),
        clause([
          bold('Rent. '),
          `The Tenant shall pay a monthly rent of Rs. ${data.monthlyRent}/- (net of applicable deductions, if any), payable on or before the 5th day of every English calendar month, either by bank transfer or cheque in favour of the Landlord.`,
        ]),
        clause([
          bold('Security Deposit. '),
          `The Tenant has paid to the Landlord a refundable and interest-free security deposit of Rs. ${data.securityDeposit}/-, the receipt of which is hereby acknowledged. The said deposit shall be returned by the Landlord to the Tenant at the time of vacating the Scheduled Premises, after adjusting any unpaid rent, utility dues, or damages beyond normal wear and tear.`,
        ]),
        clause([
          bold('Use. '),
          `The Scheduled Premises shall be used by the Tenant solely for residential purposes and shall not be sub-let, assigned, mortgaged, or parted with in any manner, in whole or in part, without the prior written consent of the Landlord.`,
        ]),
        clause([
          bold('Utilities. '),
          `Charges towards electricity, water, gas, internet, society maintenance and any other consumption-based services shall be borne and paid by the Tenant directly to the respective authorities, and proof of payment shall be furnished to the Landlord on request.`,
        ]),
        clause([
          bold('Maintenance. '),
          `The Tenant shall keep the Scheduled Premises in good and tenantable condition. Day-to-day minor repairs (including but not limited to plumbing, electrical fittings, and fixtures) shall be borne by the Tenant. Structural or major repairs shall be the responsibility of the Landlord.`,
        ]),
        clause([
          bold('Termination. '),
          `Either party may terminate this Agreement by giving to the other party one (1) month’s prior written notice or one month’s rent in lieu thereof.`,
        ]),
        clause([
          bold('Inspection. '),
          `The Landlord or their duly authorised representative shall have the right, after giving reasonable prior notice, to inspect the Scheduled Premises during daylight hours.`,
        ]),
        clause([
          bold('Alterations. '),
          `The Tenant shall not make any structural alterations or additions to the Scheduled Premises without the prior written consent of the Landlord.`,
        ]),
        clause([
          bold('Governing Law & Jurisdiction. '),
          `This Agreement shall be governed by and construed in accordance with the laws of India. Any dispute arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts at ${data.executionPlace}.`,
        ]),

        spacer(320),
        body([
          `IN WITNESS WHEREOF, the parties hereto have set their hands on this Agreement on the day, month and year first above written, in the presence of the witnesses whose names and signatures appear hereunder.`,
        ]),

        signatureBlock(
          { label: 'Signature of Landlord', name: data.landlordName },
          { label: 'Signature of Tenant', name: data.tenantName },
        ),

        ...witnessSection(),
      ]),
    ],
  });

  return await Packer.toBuffer(doc);
}
