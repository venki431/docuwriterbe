import { z } from 'zod';

const baseRecord = z.record(z.union([z.string(), z.number()]));

export const saleDeedSchema = z.object({
  sellerName: z.string().min(1, 'Seller name is required'),
  sellerAddress: z.string().min(1, 'Seller address is required'),
  buyerName: z.string().min(1, 'Buyer name is required'),
  buyerAddress: z.string().min(1, 'Buyer address is required'),
  propertyDetails: z.string().min(1, 'Property details are required'),
  propertyAddress: z.string().min(1, 'Property address is required'),
  saleAmount: z.string().min(1, 'Sale amount is required'),
  saleAmountWords: z.string().min(1, 'Sale amount in words is required'),
  northBoundary: z.string().min(1, 'North boundary is required'),
  southBoundary: z.string().min(1, 'South boundary is required'),
  eastBoundary: z.string().min(1, 'East boundary is required'),
  westBoundary: z.string().min(1, 'West boundary is required'),
  executionPlace: z.string().min(1, 'Execution place is required'),
  executionDate: z.string().min(1, 'Execution date is required'),
});

export const rentalSchema = z.object({
  landlordName: z.string().min(1, 'Landlord name is required'),
  landlordAddress: z.string().min(1, 'Landlord address is required'),
  tenantName: z.string().min(1, 'Tenant name is required'),
  tenantAddress: z.string().min(1, 'Tenant address is required'),
  propertyAddress: z.string().min(1, 'Property address is required'),
  monthlyRent: z.string().min(1, 'Monthly rent is required'),
  securityDeposit: z.string().min(1, 'Security deposit is required'),
  leaseDurationMonths: z.string().min(1, 'Lease duration is required'),
  startDate: z.string().min(1, 'Start date is required'),
  executionPlace: z.string().min(1, 'Execution place is required'),
  executionDate: z.string().min(1, 'Execution date is required'),
});

export const affidavitSchema = z.object({
  deponentName: z.string().min(1, 'Deponent name is required'),
  deponentRelationType: z.enum(['S/o', 'D/o', 'W/o'], {
    errorMap: () => ({ message: 'Select S/o, D/o or W/o' }),
  }),
  deponentRelationName: z.string().min(1, 'Parent / spouse name is required'),
  age: z.string().min(1, 'Age is required'),
  occupation: z.string().min(1, 'Occupation is required'),
  address: z.string().min(1, 'Address is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  statement: z.string().min(1, 'Statement is required'),
  executionPlace: z.string().min(1, 'Execution place is required'),
  executionDate: z.string().min(1, 'Execution date is required'),
});

export const documentTypeSchema = z.enum(['agreement-of-sale', 'rental', 'affidavit']);
export const documentFormatSchema = z.enum(['pdf', 'docx']);

export const generateRequestSchema = z.object({
  type: documentTypeSchema,
  format: documentFormatSchema,
  data: baseRecord,
});

export const previewRequestSchema = z.object({
  type: documentTypeSchema,
  data: baseRecord,
});

export function validateDocumentData(
  type: 'agreement-of-sale' | 'rental' | 'affidavit',
  data: Record<string, unknown>,
) {
  switch (type) {
    case 'agreement-of-sale':
      return saleDeedSchema.parse(data);
    case 'rental':
      return rentalSchema.parse(data);
    case 'affidavit':
      return affidavitSchema.parse(data);
  }
}
