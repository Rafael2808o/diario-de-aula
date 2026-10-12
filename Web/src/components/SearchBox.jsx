import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useApp } from "../context.js";
import { formatFull } from "../lib/dates.js";
import { searchAll, searchTypes } from "../lib/domain.js";

const typeLabel = Object.fromEntries(searchTypes);

export default function SearchBox() {
  const { data, go } = useApp();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const results = useMemo(() => searchAll(data, query, { type, subjectId }), [data, query, type, subjectId]);

  useEffect(() => {
    const close = (event) => {
      if (!box.current?.contains(event.target)) setOpen(false);
    };
    const shortcut = (event) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        box.current?.querySelector("input")?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", shortcut);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", shortcut);
    };
  }, []);

  const pick = (result) => {
    const { page, ...params } = result.link;
    setOpen(false);
    setQuery("");
    go(page, params);
  };

  return (
    <div className="searchbox" ref={box} role="search">
      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
          placeholder="Buscar aulas, provas, materiais..."
          aria-label="Busca geral"
          aria-expanded={open && query.length >= 2}
          aria-controls="search-results"
        />
        {query && (
          <button type="button" className="icon-btn" aria-label="Limpar busca" onClick={() => setQuery("")}>
            <X size={14} />
          </button>
        )}
      </label>
      {open && query.trim().length >= 2 && (
        <div className="search-panel" id="search-results">
          <div className="filters">
            <select aria-label="Tipo de resultado" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">Todos os tipos</option>
              {searchTypes.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <select aria-label="Disciplina" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">Todas as disciplinas</option>
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </div>
          {results.length ? (
            <ul>
              {results.slice(0, 30).map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <button type="button" onClick={() => pick(result)} style={{ "--subject": result.subject?.color || "var(--accent)" }}>
                    <span className="search-type">{typeLabel[result.type]}</span>
                    <strong>{result.title}</strong>
                    <small>
                      {[result.subject?.name, result.date && formatFull(result.date)].filter(Boolean).join(", ")}
                    </small>
                    <span className="search-snippet">{result.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nada encontrado para “{query}”.</p>
          )}
        </div>
      )}
    </div>
  );
}
