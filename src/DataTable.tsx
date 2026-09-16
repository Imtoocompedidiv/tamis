import { useState } from "react";
import type { Result } from "./core/pipeline";
export function DataTable({ result, name }: { result: Result; name: string }) {
  const [errors, setErrors] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const filtered = result.rows.filter(
    (r) =>
      (!errors || r.issues.length > 0) &&
      r.values.some((v) => v.toLowerCase().includes(query.toLowerCase())),
  );
  const maxPage = Math.max(0, Math.ceil(filtered.length / 12) - 1),
    current = Math.min(page, maxPage);
  return (
    <section className="data-panel" aria-label="Aperçu des données">
      <div className="table-top">
        <div>
          <h2>{name}</h2>
          <p>
            {result.rows.length} lignes · {result.headers.length} colonnes
          </p>
        </div>
        <div className="filters">
          <div className="segments">
            <button
              aria-pressed={!errors}
              onClick={() => {
                setErrors(false);
                setPage(0);
              }}
            >
              Toutes les lignes
            </button>
            <button
              aria-pressed={errors}
              onClick={() => {
                setErrors(true);
                setPage(0);
              }}
            >
              À vérifier ({result.rows.filter((r) => r.issues.length).length})
            </button>
          </div>
          <input
            aria-label="Filtrer les lignes"
            placeholder="Filtrer…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>
      <div className="table-scroll" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Ligne</th>
              {result.headers.map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 12, current * 12 + 12).map((r) => (
              <tr key={r.sourceRow}>
                <td className="line">{r.sourceRow}</td>
                {r.values.map((v, c) => {
                  const issue = r.issues.find((i) => i.column === c);
                  const change = result.changes.find(
                    (i) => i.row === r.sourceRow && i.column === c,
                  );
                  return (
                    <td
                      key={c}
                      className={issue ? "issue" : change ? "changed" : ""}
                      title={
                        issue?.message ??
                        (change ? `Avant : ${change.before}` : undefined)
                      }
                    >
                      <span>{v || "—"}</span>
                      {issue && (
                        <span className="cell-note">{issue.message}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="empty">Aucune ligne ne correspond à ce filtre.</p>
        )}
      </div>
      <div className="table-foot">
        <span className="anomaly">
          {result.issues.length} anomalie{result.issues.length > 1 ? "s" : ""}
        </span>
        <span>
          {result.removed.length} doublon{result.removed.length > 1 ? "s" : ""}{" "}
          retiré{result.removed.length > 1 ? "s" : ""}
        </span>
        <span className="pager">
          <button
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            aria-label="Page précédente"
          >
            Précédent
          </button>
          {current + 1} / {maxPage + 1}
          <button
            disabled={current === maxPage}
            onClick={() => setPage(current + 1)}
            aria-label="Page suivante"
          >
            Suivant
          </button>
        </span>
      </div>
    </section>
  );
}
