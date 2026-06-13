// Powered by OnSpace.AI
// Web: parse CSV directly from uploaded file (Excel not supported on web)
export async function parseExcelBase64(_content: string): Promise<{
  headers: string[];
  rows: string[][];
}> {
  throw new Error(
    'استيراد Excel غير مدعوم على المتصفح، استخدم CSV أو تطبيق الجوال'
  );
}

export function parseCsvText(content: string): { headers: string[]; rows: string[][] } {
  const cleaned = content.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const all = lines.map(parseLine);
  return { headers: all[0] || [], rows: all.slice(1) };
}
