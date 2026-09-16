import { describe, it, expect } from "vitest";
import { parseCSV, serializeCSV } from "./csv";
import { applyRules, defaultRules, parseDecimal } from "./pipeline";
describe("CSV boundaries", () => {
  it("reads BOM, CRLF, embedded newline and escaped quotes", () =>
    expect(
      parseCSV('\uFEFFnom;note\r\nAlice;"une\n""citation"""').rows,
    ).toEqual([["Alice", 'une\n"citation"']]));
  it("ignores separators inside quotes during detection", () =>
    expect(parseCSV('"nom, prénom";budget\nAlice;25').delimiter).toBe(";"));
  it("preserves trailing empty cells and skips empty physical lines", () =>
    expect(parseCSV("a,b\n1,\n\n2,3\n").rows).toEqual([
      ["1", ""],
      ["2", "3"],
    ]));
  it.each(['a,b\n"x,y', 'a,b\n"x"oops,y', 'a,b\nx"q,y'])(
    "rejects malformed quoting %s",
    (s) => expect(() => parseCSV(s)).toThrow(),
  );
  it.each(["a,a\n1,2", "a,\n1,2", "a,b\n1,2,3", ""])(
    "rejects ambiguous records %s",
    (s) => expect(() => parseCSV(s)).toThrow(),
  );
  it("roundtrips quoted punctuation", () => {
    const rows = [
      ["x;y", 'a"b'],
      ["x\ny", ""],
    ];
    expect(parseCSV(serializeCSV(["a", "b"], rows)).rows).toEqual(rows);
  });
  it("neutralizes formulas including leading controls", () => {
    const out = serializeCSV(["a"], [[" =HYPERLINK(1)"], ["\t+CMD"], ["@A1"]]);
    expect(out).toContain("' =HYPERLINK");
    expect(out).toContain("'\t+CMD");
  });
});
describe("transformation audit", () => {
  const t = parseCSV(
    "Nom;Email;Ville;Budget\n Alice ; ALICE@example.test ; Lyon ;1 200,50 €\nAlice;alice@example.test;Lyon;1200.50\nBob;;Paris;abc\nJean;;Paris;5",
  );
  it("deduplicates valid identities, preserves invalid identities and source rows", () => {
    const r = applyRules(t, defaultRules);
    expect(r.removed).toEqual([3]);
    expect(r.rows.map((x) => x.sourceRow)).toEqual([2, 4, 5]);
    expect(r.issues).toHaveLength(3);
  });
  it("does not mutate source and records exact differences", () => {
    const r = applyRules(t, defaultRules);
    expect(t.rows[0][0]).toBe(" Alice ");
    expect(r.changes).toContainEqual({
      row: 2,
      column: 3,
      before: "1 200,50 €",
      after: "1200.50",
    });
  });
  it("rejects stale schema indices", () =>
    expect(() =>
      applyRules(t, { ...defaultRules, emailColumn: 20 }),
    ).toThrow());
  it.each([
    ["0", "0.00"],
    ["0002,1", "2.10"],
    ["-5,30", "-5.30"],
    ["1.234,56", null],
    ["Infinity", null],
    ["1e3", null],
  ])("parses explicit decimal %s", (a, b) => expect(parseDecimal(a!)).toBe(b));
});
