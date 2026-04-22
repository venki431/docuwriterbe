export function escapeHtml(input: unknown): string {
  const value = input === null || input === undefined ? '' : String(input);
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nl2br(input: unknown): string {
  return escapeHtml(input).replace(/\r?\n/g, '<br/>');
}
