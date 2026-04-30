import puppeteer, { Browser } from 'puppeteer';
import { DocumentType } from '../types';
import { generateSaleDeedHTML } from '../templates/html/saleDeed';
import { generateRentalHTML } from '../templates/html/rental';
import { generateAffidavitHTML } from '../templates/html/affidavit';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

function renderHtml(
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

export async function generatePdf(
  type: DocumentType,
  data: Record<string, string | number>,
): Promise<Buffer> {
  const html = renderHtml(type, data);
  return renderHtmlToPdf(html);
}

/**
 * Generic HTML → A4 PDF renderer. Reused by invoice generation and any other
 * server-side document that starts as HTML.
 */
export async function renderHtmlToPdf(
  html: string,
  options: { marginMm?: number } = {},
): Promise<Buffer> {
  const margin = options.marginMm ?? 18;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: `${margin}mm`,
        right: `${margin}mm`,
        bottom: `${margin}mm`,
        left: `${margin}mm`,
      },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
