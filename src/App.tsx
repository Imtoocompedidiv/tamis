import { useEffect, useRef, useState } from "react";
import { parseCSV, serializeCSV, MAX_BYTES } from "./core/csv";
import { applyRules, rawRules, type Rules, type Result } from "./core/pipeline";
import { DataTable } from "./DataTable";
import { sample } from "./sample";
import { download } from "./download";
const initialTable = parseCSV(sample);
const untouched = (rules: Rules): Rules => ({
  ...rules,
  trim: false,
  normalizeEmail: false,
  dedupe: false,
  normalizeNumbers: false,
});
type Snapshot = { result: Result; rules: Rules };
export default function App() {
  const [text, setText] = useState(sample),
    [name, setName] = useState("contacts.csv");
  const [rules, setRules] = useState<Rules>(rawRules(initialTable.headers));
  const [snapshot, setSnapshot] = useState<Snapshot>({
    result: applyRules(initialTable, untouched(rawRules(initialTable.headers))),
    rules: untouched(rawRules(initialTable.headers)),
  });
  const [history, setHistory] = useState<Snapshot[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      "Exemple fictif chargé. Choisissez vos règles de nettoyage.",
    );
  const [validOnly, setValidOnly] = useState(true),
    [exporting, setExporting] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    request = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      if (e.data.id !== request.current) return;
      setBusy(false);
      if (e.data.error) {
        setMessage(e.data.error);
        return;
      }
      setSnapshot(e.data.snapshot);
      setMessage(
        `Cellules corrigées : ${e.data.snapshot.result.changes.length}. Doublons retirés : ${e.data.snapshot.result.removed.length}.`,
      );
    };
    w.onerror = () => {
      setBusy(false);
      setMessage("Le traitement a échoué. Rechargez le fichier.");
    };
    return () => w.terminate();
  }, []);
  function load(content: string, filename: string) {
    try {
      const table = parseCSV(content);
      request.current++;
      setBusy(false);
      setText(content);
      setName(filename);
      const inferred = rawRules(table.headers);
      setRules(inferred);
      setSnapshot({
        result: applyRules(table, untouched(inferred)),
        rules: untouched(inferred),
      });
      setHistory([]);
      setMessage(
        `${table.rows.length} lignes importées. Le fichier original reste intact.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import impossible.");
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.[0]) return;
    const f = files[0];
    if (f.size > MAX_BYTES) {
      setMessage("Le fichier dépasse 2 Mo.");
      return;
    }
    try {
      load(await f.text(), f.name);
    } catch {
      setMessage("Lecture du fichier impossible.");
    }
  }
  function apply() {
    if (!worker.current) return;
    setHistory((h) => [...h.slice(-9), snapshot]);
    setBusy(true);
    worker.current.postMessage({ id: ++request.current, text, rules });
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    request.current++;
    setBusy(false);
    setSnapshot(previous);
    setRules(previous.rules);
    setHistory((h) => h.slice(0, -1));
    setMessage("La transformation précédente a été restaurée.");
  }
  const result = snapshot.result,
    eligible = result.rows.filter((r) => !validOnly || !r.issues.length);
  async function report() {
    setExporting(true);
    try {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      );
      download(
        "tamis-rapport.json",
        JSON.stringify(
          {
            version: 1,
            source: name,
            sourceSha256: Array.from(new Uint8Array(hash), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join(""),
            createdAt: new Date().toISOString(),
            rules: snapshot.rules,
            export: {
              validOnly,
              rows: eligible.length,
              formulaProtection: true,
            },
            changes: result.changes,
            issues: result.issues,
            removedSourceRows: result.removed,
          },
          null,
          2,
        ),
        "application/json",
      );
      setMessage("Rapport exporté avec empreinte du fichier source.");
    } catch {
      setMessage("Export du rapport impossible.");
    } finally {
      setExporting(false);
    }
  }
  const toggle = (
    key: keyof Pick<
      Rules,
      "trim" | "normalizeEmail" | "dedupe" | "normalizeNumbers"
    >,
  ) => setRules((r) => ({ ...r, [key]: !r[key] }));
  return (
    <>
      <a className="skip" href="#workbench">
        Aller aux données
      </a>
      <header>
        <a className="brand" href="./">
          tamis
        </a>
        <span>Des données prêtes à travailler.</span>
        <nav>
          <button onClick={() => load(sample, "contacts.csv")}>Exemple</button>
          <a href="https://github.com/Imtoocompedidiv/tamis">Code source</a>
        </nav>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>Du fichier brut au jeu de données fiable.</h1>
            <p>Nettoyez, contrôlez et exportez sans envoyer vos fichiers.</p>
          </div>
          <button className="primary" onClick={() => file.current?.click()}>
            Importer un CSV
          </button>
          <input
            ref={file}
            hidden
            type="file"
            accept=".csv,.tsv,text/csv"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <ol className="steps">
          <li>
            <b>1</b>
            <div>
              <strong>Source</strong>
              <span>Importez et explorez votre fichier</span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>Transformations</strong>
              <span>Nettoyez et standardisez vos données</span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>Export</strong>
              <span>Récupérez un jeu de données fiable</span>
            </div>
          </li>
        </ol>
        <div className="workbench" id="workbench">
          <aside>
            <h2>Règles de nettoyage</h2>
            <p>Appliquez des règles courantes pour corriger et uniformiser.</p>
            <fieldset disabled={busy}>
              <legend className="sr-only">Transformations</legend>
              {(
                [
                  [
                    "trim",
                    "Supprimer les espaces",
                    "En début et fin de champ.",
                  ],
                  [
                    "normalizeEmail",
                    "Normaliser les e-mails",
                    "Passer les adresses en minuscules.",
                  ],
                  [
                    "dedupe",
                    "Retirer les doublons",
                    "Conserver le premier e-mail valide.",
                  ],
                  [
                    "normalizeNumbers",
                    "Normaliser les montants",
                    "Convertir 1 200,50 € en 1200.50.",
                  ],
                ] as const
              ).map(([key, label, hint]) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={rules[key]}
                    onChange={() => toggle(key)}
                  />
                  <span>
                    {label}
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
              {(
                [
                  ["emailColumn", "Colonne e-mail"],
                  ["numberColumn", "Colonne montant"],
                ] as const
              ).map(([key, label]) => (
                <label className="select" key={key}>
                  {label}
                  <select
                    value={rules[key]}
                    onChange={(e) =>
                      setRules((r) => ({ ...r, [key]: Number(e.target.value) }))
                    }
                  >
                    <option value={-1}>Aucune</option>
                    {result.headers.map((h, i) => (
                      <option key={h} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button className="primary" onClick={apply}>
                {busy ? "Traitement…" : "Appliquer les règles"}
              </button>
            </fieldset>
            <button
              className="secondary"
              disabled={!history.length || busy}
              onClick={undo}
            >
              Annuler
            </button>
          </aside>
          <DataTable result={result} name={name} />
        </div>
        <p role="status" className="status">
          {message}
        </p>
        <section className="export">
          <div>
            <h2>Un export que vous pouvez expliquer.</h2>
            <p>Un fichier propre et la trace de chaque correction.</p>
            <label>
              <input
                type="checkbox"
                checked={validOnly}
                onChange={(e) => setValidOnly(e.target.checked)}
              />{" "}
              Exporter uniquement les lignes sans anomalie ({eligible.length})
            </label>
          </div>
          <div className="export-actions">
            <button
              className="primary"
              disabled={busy || !eligible.length}
              onClick={() => {
                download(
                  name.replace(/\.[^.]+$/, "") + "-nettoye.csv",
                  serializeCSV(
                    result.headers,
                    eligible.map((r) => r.values),
                  ),
                  "text/csv;charset=utf-8",
                );
                setMessage(
                  `${eligible.length} lignes exportées. Les formules de tableur sont neutralisées.`,
                );
              }}
            >
              Exporter le CSV
            </button>
            <button
              className="secondary"
              disabled={busy || exporting}
              onClick={() => void report()}
            >
              Rapport JSON
            </button>
          </div>
        </section>
      </main>
      <footer>
        <span>
          Traitement local dans votre navigateur. CSV UTF-8 · 2 Mo · 20 000
          lignes maximum.
        </span>
        <a href="https://imtoocompedidiv.github.io/portfolio/">
          JD
        </a>
      </footer>
    </>
  );
}
