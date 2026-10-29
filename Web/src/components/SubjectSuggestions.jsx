import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useApp } from "../context.js";
import { subjectPalette } from "../lib/domain.js";
import { FormError } from "../ui.jsx";

// Disciplinas que outras contas do mesmo curso e instituição já cadastraram (só nomes usados por 2 ou mais contas).
// Vêm todas marcadas: a pessoa desmarca o que não cursa, corrige nomes e adiciona o que faltar.
// Nada é criado até ela confirmar, e as disciplinas que já existem na conta nunca são tocadas.
export default function SubjectSuggestions({ compact = false }) {
  const { call, data, create, toast } = useApp();
  const [state, setState] = useState({ status: "loading", items: [] });
  const [rows, setRows] = useState([]);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    call("/subjects/suggestions")
      .then((result) => {
        setState({ status: "ready", ...result });
        setRows(result.items.map((item) => ({ name: item.name, checked: true })));
      })
      .catch(() => setState({ status: "error", items: [] }));
  }, [call]);

  if (hidden || state.status !== "ready" || !state.items.length) return null;

  const chosen = rows.filter((row) => row.checked && row.name.trim());
  const setRow = (index, changes) => setRows((list) => list.map((row, position) => (position === index ? { ...row, ...changes } : row)));
  const add = async () => {
    setBusy(true);
    setError("");
    const used = new Set(data.subjects.map((subject) => subject.color));
    let created = 0;
    try {
      for (const [index, row] of chosen.entries()) {
        const free = subjectPalette.filter((color) => !used.has(color));
        const color = free[0] || subjectPalette[(data.subjects.length + index) % subjectPalette.length];
        used.add(color);
        await create("subjects", { name: row.name.trim(), color, schedule: [], professor: "", startDate: "", endDate: "" });
        created += 1;
      }
      toast(`${created} ${created === 1 ? "disciplina adicionada" : "disciplinas adicionadas"}. Abra cada uma para pôr horários e modalidade.`);
      setHidden(true);
    } catch (failure) {
      setError(`${created ? `${created} foram adicionadas, mas ` : ""}${failure.message}`);
      setRows((list) => list.slice(created));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`subject-suggestions ${compact ? "is-compact" : ""}`} aria-labelledby="sugestoes-title">
      <div className="section-head">
        <h2 className="section-title" id="sugestoes-title">
          Disciplinas do seu curso
        </h2>
        <button type="button" className="icon-btn" aria-label="Esconder sugestões" onClick={() => setHidden(true)}>
          <X size={16} />
        </button>
      </div>
      <p className="hint">Outras pessoas do seu curso e da sua faculdade cursam estas. Desmarque o que não é seu, corrija os nomes e adicione o que faltar.</p>
      <ul className="group suggestion-list">
        {rows.map((row, index) => (
          <li key={index} className="row">
            <label className="check">
              <input type="checkbox" checked={row.checked} onChange={(event) => setRow(index, { checked: event.target.checked })} aria-label={`Incluir ${row.name}`} />
            </label>
            <input className="suggestion-name" value={row.name} maxLength={100} onChange={(event) => setRow(index, { name: event.target.value })} aria-label="Nome da disciplina" />
          </li>
        ))}
        <li className="row">
          <Plus size={16} className="row-icon" aria-hidden="true" />
          <input
            className="suggestion-name"
            value={extra}
            maxLength={100}
            placeholder="Outra disciplina que você cursa"
            onChange={(event) => setExtra(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && extra.trim()) {
                event.preventDefault();
                setRows((list) => [...list, { name: extra.trim(), checked: true }]);
                setExtra("");
              }
            }}
            aria-label="Adicionar outra disciplina"
          />
          <button type="button" className="btn ghost small" disabled={!extra.trim()} onClick={() => { setRows((list) => [...list, { name: extra.trim(), checked: true }]); setExtra(""); }}>
            Incluir
          </button>
        </li>
      </ul>
      <FormError>{error}</FormError>
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn primary" disabled={busy || !chosen.length} onClick={add}>
          <Check size={15} /> {busy ? "Adicionando..." : `Adicionar ${chosen.length} ${chosen.length === 1 ? "disciplina" : "disciplinas"}`}
        </button>
      </div>
    </section>
  );
}
