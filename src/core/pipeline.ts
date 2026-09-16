import type { Table } from "./csv";
export type Rules = {
  trim: boolean;
  normalizeEmail: boolean;
  dedupe: boolean;
  emailColumn: number;
  numberColumn: number;
  normalizeNumbers: boolean;
};
export type Issue = { row: number; column: number; message: string };
export type Change = {
  row: number;
  column: number;
  before: string;
  after: string;
};
export type Result = {
  headers: string[];
  rows: { sourceRow: number; values: string[]; issues: Issue[] }[];
  issues: Issue[];
  changes: Change[];
  removed: number[];
};
export const defaultRules: Rules = {
  trim: true,
  normalizeEmail: true,
  dedupe: true,
  emailColumn: 1,
  numberColumn: 3,
  normalizeNumbers: true,
};

export function parseDecimal(value: string): string | null {
  const s = value
    .trim()
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/€$/, "");
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(s)) return null;
  const [whole, fraction = ""] = s.replace(",", ".").split(".");
  return `${whole.replace(/^(-?)0+(?=\d)/, "$1")}.${fraction.padEnd(2, "0")}`;
}
export function applyRules(table: Table, rules: Rules): Result {
  const { headers } = table;
  for (const col of [rules.emailColumn, rules.numberColumn]) {
    if (!Number.isInteger(col) || col < -1 || col >= headers.length)
      throw new Error("Colonne de règle invalide.");
  }
  const result: Result = {
    headers: [...headers],
    rows: [],
    issues: [],
    changes: [],
    removed: [],
  };
  const seen = new Set<string>();
  table.rows.forEach((source, index) => {
    const sourceRow = index + 2;
    const values = source.map((v) => (rules.trim ? v.trim() : v));
    const issues: Issue[] = [];
    const email = rules.emailColumn;
    if (email >= 0 && rules.normalizeEmail)
      values[email] = values[email].toLowerCase();
    if (email >= 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[email]))
      issues.push({
        row: sourceRow,
        column: email,
        message: "E-mail manquant ou invalide",
      });
    const number = rules.numberColumn;
    if (number >= 0) {
      const parsed = parseDecimal(values[number]);
      if (parsed === null)
        issues.push({
          row: sourceRow,
          column: number,
          message: "Montant invalide (2 décimales maximum)",
        });
      else if (rules.normalizeNumbers) values[number] = parsed;
    }
    // An invalid identity must never make two unrelated rows disappear.
    const key =
      email >= 0 && !issues.some((i) => i.column === email)
        ? values[email].trim().toLowerCase()
        : null;
    if (rules.dedupe && key && seen.has(key)) {
      result.removed.push(sourceRow);
      return;
    }
    if (key) seen.add(key);
    values.forEach((v, c) => {
      if (v !== source[c])
        result.changes.push({
          row: sourceRow,
          column: c,
          before: source[c],
          after: v,
        });
    });
    result.rows.push({ sourceRow, values, issues });
    result.issues.push(...issues);
  });
  return result;
}
export function rawRules(headers: string[]): Rules {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h));
  return {
    ...defaultRules,
    emailColumn: find(/e.?mail/i),
    numberColumn: find(/budget|montant|amount|price/i),
  };
}
