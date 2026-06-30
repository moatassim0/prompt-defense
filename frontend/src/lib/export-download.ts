/** Trigger a UTF-8 file download in the browser (no deps). */

export function downloadTextFile(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filenameBase: string, data: unknown) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  downloadTextFile(`${sanitizeFilename(filenameBase)}.json`, 'application/json', body);
}

function sanitizeFilename(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'export';
}

export function escapeCsvField(cell: unknown): string {
  const raw = cell === undefined || cell === null ? '' : String(cell);
  const escaped = raw.replace(/"/g, '""');
  if (/[",\r\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

export function buildCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const line = headers.map((h) => escapeCsvField(h)).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvField(row[h])).join(','));
  return [line, ...dataLines].join('\r\n');
}

export function downloadCsv(filenameBase: string, headers: string[], rows: Record<string, unknown>[]) {
  const csv = '\uFEFF' + buildCsv(headers, rows);
  downloadTextFile(`${sanitizeFilename(filenameBase)}.csv`, 'text/csv', csv);
}
