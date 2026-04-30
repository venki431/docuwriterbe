import JSZip from 'jszip';

const FIXED_PARTS = new Set([
  'word/document.xml',
  'word/styles.xml',
  'word/numbering.xml',
  'word/settings.xml',
  'word/footnotes.xml',
  'word/endnotes.xml',
  'word/comments.xml',
  'word/fontTable.xml',
  'word/webSettings.xml',
]);

const HEADER_FOOTER_RE = /^word\/(header|footer)\d*\.xml$/;

export async function makeOfficeCompatible(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!FIXED_PARTS.has(name) && !HEADER_FOOTER_RE.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const patched = expandIgnorableOnRoot(xml);
    if (patched !== xml) zip.file(name, patched);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const CORE_PREFIXES = new Set(['mc', 'w', 'r', 'o', 'v', 'm', 'wp', 'w10', 'wne']);

function expandIgnorableOnRoot(xml: string): string {
  const rootMatch = xml.match(/<([\w]+:[\w]+)([^>]*)>/);
  if (!rootMatch) return xml;
  const fullTag = rootMatch[0];
  const tagName = rootMatch[1];
  const attrs = rootMatch[2];

  const prefixes = [...attrs.matchAll(/\sxmlns:([\w]+)=/g)].map((m) => m[1]);
  if (prefixes.length === 0) return xml;

  const ignorableMatch = attrs.match(/\smc:Ignorable="([^"]*)"/);
  const existing = ignorableMatch
    ? ignorableMatch[1].trim().split(/\s+/).filter(Boolean)
    : [];

  const additions = prefixes.filter(
    (p) => !CORE_PREFIXES.has(p) && !existing.includes(p),
  );
  if (additions.length === 0) return xml;

  const merged = [...existing, ...additions].join(' ');
  const newAttrs = ignorableMatch
    ? attrs.replace(/\smc:Ignorable="[^"]*"/, ` mc:Ignorable="${merged}"`)
    : `${attrs} mc:Ignorable="${merged}"`;
  const newTag = `<${tagName}${newAttrs}>`;
  return xml.replace(fullTag, newTag);
}
