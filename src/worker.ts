import { parseCSV } from "./core/csv";
import { applyRules, type Rules } from "./core/pipeline";
self.onmessage = (
  e: MessageEvent<{ id: number; text: string; rules: Rules }>,
) => {
  try {
    const table = parseCSV(e.data.text);
    self.postMessage({
      id: e.data.id,
      snapshot: {
        result: applyRules(table, e.data.rules),
        rules: e.data.rules,
      },
    });
  } catch (error) {
    self.postMessage({
      id: e.data.id,
      error: error instanceof Error ? error.message : "Lecture impossible.",
    });
  }
};
