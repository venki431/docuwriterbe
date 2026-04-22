export type DocumentType = 'sale-deed' | 'rental' | 'affidavit';
export type DocumentFormat = 'pdf' | 'docx';

export interface GenerateDocumentRequest {
  type: DocumentType;
  format: DocumentFormat;
  data: Record<string, string | number>;
}

export interface SaleDeedData {
  sellerName: string;
  sellerAddress: string;
  buyerName: string;
  buyerAddress: string;
  propertyDetails: string;
  propertyAddress: string;
  saleAmount: string;
  saleAmountWords: string;
  northBoundary: string;
  southBoundary: string;
  eastBoundary: string;
  westBoundary: string;
  executionPlace: string;
  executionDate: string;
}

export interface RentalData {
  landlordName: string;
  landlordAddress: string;
  tenantName: string;
  tenantAddress: string;
  propertyAddress: string;
  monthlyRent: string;
  securityDeposit: string;
  leaseDurationMonths: string;
  startDate: string;
  executionPlace: string;
  executionDate: string;
}

export interface AffidavitData {
  deponentName: string;
  fatherName: string;
  age: string;
  occupation: string;
  address: string;
  purpose: string;
  statement: string;
  executionPlace: string;
  executionDate: string;
}
