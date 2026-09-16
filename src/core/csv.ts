export type Table = { headers: string[]; rows: string[][]; delimiter: string };
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 20000;

/** RFC-4180 style state machine. Rejects malformed quoting instead of guessing. */
export function parseCSV(input: string, delimiter?: string): Table {
  if (new TextEncoder().encode(input).length > MAX_BYTES)
    throw new Error("Le fichier dépasse 2 Mo.");
  const text = input.replace(/^\uFEFF/, "");
  const sep = delimiter ?? detectDelimiter(text);
  if (![",", ";", "\t"].includes(sep))
    throw new Error("Séparateur non pris en charge.");
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    line = 1,
    touched = false;
  const cell = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const record = () => {
    cell();
    if (touched || row.length > 1 || row[0] !== "") records.push(row);
    if (records.length > MAX_ROWS + 1)
      throw new Error(`Maximum : ${MAX_ROWS} lignes.`);
    row = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += c;
        if (c === "\n") line++;
      }
      continue;
    }
    if (c === sep) {
      cell();
      touched = true;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record();
      line++;
    } else if (c === '"' && field === "" && !closed) {
      quoted = true;
      touched = true;
    } else {
      if (closed || c === '"')
        throw new Error(`Guillemet inattendu, ligne ${line}.`);
      field += c;
      touched = true;
    }
  }
  if (quoted)
    throw new Error(`Champ entre guillemets non fermé, ligne ${line}.`);
  if (touched || row.length || field || closed) record();
  if (!records.length) throw new Error("Le fichier est vide.");
  const headers = records.shift()!.map((h) => h.trim());
  if (headers.length > 60) throw new Error("Maximum : 60 colonnes.");
  if (headers.some((h) => !h))
    throw new Error("Chaque colonne doit avoir un nom.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Les noms de colonnes doivent être uniques.");
  records.forEach((r, i) => {
    if (r.length !== headers.length)
      throw new Error(
        `Enregistrement ${i + 2} : ${r.length} colonnes au lieu de ${headers.length}.`,
      );
  });
  return { headers, rows: records, delimiter: sep };
}

export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === "\n" || c === "\r") break;
      if (c in counts) counts[c]++;
    }
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

export function serializeCSV(
  headers: string[],
  rows: string[][],
  delimiter = ";",
): string {
  const encode = (value: string) => {
    // Spreadsheet formula protection also covers control characters preceding a formula.
    const safe =
      /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /^[\t\r\n]/.test(value)
        ? `'${value}`
        : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((r) => r.map(encode).join(delimiter)).join("\r\n")
  );
}
