import { useMemo, useState } from "react";
import { PenLine, Plus, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso } from "../../lib/dates.js";
import { Confirm, Empty, FormError, Modal, Segmented, useSubmit } from "../../ui.jsx";
import { BasisHint, SourceNote, SubjectTopicFields, buildContext, postAi } from "./shared.jsx";

// Ordem de revisão: novos e difíceis antes; os fáceis só voltam quando não houver mais nada pendente.
const order = { difícil: 0, nova: 1, fácil: 2 };

function CardForm({ card, subjectId, onClose }) {
  const { create, update } = useApp();
  const { submit, busy, error } = useSubmit((body) => (card ? update("flashcards", card.id, body) : create("flashcards", body)), {
    success: card ? "Cartão atualizado." : "Cartão criado.",
    onDone: onClose,
  });
  return (
    <Modal title={card ? "Editar cartão" : "Novo cartão"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          submit({ ...values, subjectId: card?.subjectId || subjectId });
        }}
      >
        <label>
          Pergunta
          <input name="front" required maxLength={300} defaultValue={card?.front} />
        </label>
        <label>
          Resposta
          <textarea name="back" required rows={4} maxLength={1200} defaultValue={card?.back} />
        </label>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Review({ cards }) {
  const { update, toast } = useApp();
  const [round, setRound] = useState(() => [...cards].sort((a, b) => order[a.level] - order[b.level]).map((card) => card.id));
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = cards.find((card) => card.id === round[0]);
  if (!current) {
    const hard = cards.filter((card) => card.level !== "fácil");
    return (
      <Empty compact mood="happy" title="Rodada concluída.">
        {hard.length ? `${hard.length} ${hard.length === 1 ? "cartão continua difícil" : "cartões continuam difíceis"}.` : "Todos os cartões estão marcados como fáceis."}
        <button className="btn small" onClick={() => setRound((hard.length ? hard : cards).map((card) => card.id))}>
          {hard.length ? "Repetir os difíceis" : "Revisar tudo de novo"}
        </button>
      </Empty>
    );
  }
  const mark = async (level) => {
    setBusy(true);
    try {
      await update("flashcards", current.id, { level, reviews: current.reviews + 1, reviewedOn: todayIso() });
      setRound((ids) => (level === "difícil" ? [...ids.slice(1), ids[0]] : ids.slice(1)));
      setShown(false);
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flashcard-stage">
      <p className="hint">{round.length} {round.length === 1 ? "cartão restante" : "cartões restantes"} nesta rodada</p>
      <button type="button" className={`flashcard ${shown ? "is-flipped" : ""}`} onClick={() => setShown(true)} aria-live="polite">
        <span className="flashcard-side">{shown ? "Resposta" : "Pergunta"}</span>
        <strong>{shown ? current.back : current.front}</strong>
        {!shown && <small>Toque para ver a resposta</small>}
      </button>
      {shown && (
        <div className="form-actions centered">
          <button className="btn" disabled={busy} onClick={() => mark("difícil")}>
            Difícil, repetir
          </button>
          <button className="btn primary" disabled={busy} onClick={() => mark("fácil")}>
            Fácil
          </button>
        </div>
      )}
    </div>
  );
}

export default function Flashcards({ preset = {} }) {
  const { data, session, create, remove, toast } = useApp();
  const [subjectId, setSubjectId] = useState(preset.subjectId || data.subjects[0]?.id || "");
  const [mode, setMode] = useState("revisar");
  const [topic, setTopic] = useState(preset.topic || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [modal, setModal] = useState(null);
  const plan = useMemo(() => buildContext(data, subjectId, topic), [data, subjectId, topic]);
  const subject = data.subjects.find((item) => item.id === subjectId);
  const cards = data.flashcards.filter((card) => card.subjectId === subjectId);

  const generate = async (event) => {
    event.preventDefault();
    if (!plan.sources.length) return setError("Registre ao menos uma aula desta disciplina para gerar cartões a partir dela.");
    setLoading(true);
    setError("");
    try {
      const payload = await postAi(session, "/ai/study", { tool: "flashcards", subject: subject.name, topic, quantity: 8, context: plan.context });
      setDraft({ ...payload, keep: payload.cards.map(() => true), sources: plan.sources, generic: plan.generic });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    const chosen = draft.cards.filter((_, index) => draft.keep[index]);
    setLoading(true);
    try {
      for (const card of chosen) await create("flashcards", { subjectId, front: card.front, back: card.back, origin: "Sugestão da IA", examId: preset.examId || null });
      toast(`${chosen.length} ${chosen.length === 1 ? "cartão salvo" : "cartões salvos"}.`);
      setDraft(null);
      setMode("revisar");
    } catch (failure) {
      setError(`Parte dos cartões não foi salva: ${failure.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-body">
      <div className="toolbar">
        <label className="inline-field">
          Disciplina
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {data.subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <Segmented label="Modo" value={mode} onChange={setMode} options={[["revisar", `Revisar (${cards.length})`], ["criar", "Criar cartões"], ["lista", "Todos os cartões"]]} />
      </div>

      {mode === "revisar" &&
        (cards.length ? (
          <Review key={subjectId} cards={cards} />
        ) : (
          <Empty compact title="Nenhum cartão nesta disciplina.">
            Crie cartões manualmente ou peça para a IA sugerir a partir das suas aulas.
            <button className="btn small" onClick={() => setMode("criar")}>
              Criar cartões
            </button>
          </Empty>
        ))}

      {mode === "criar" && (
        <>
          <form className="form" onSubmit={generate}>
            <SubjectTopicFields subjectId={subjectId} setSubjectId={setSubjectId} topic={topic} setTopic={setTopic} topicLabel="Assunto (opcional)" placeholder="Deixe vazio para usar todas as aulas" />
            <BasisHint plan={plan} />
            <FormError>{error}</FormError>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setModal({ type: "card" })}>
                <Plus size={16} /> Escrever um cartão
              </button>
              <button className="btn primary" disabled={loading}>
                <Sparkles size={16} /> {loading ? "Gerando..." : "Sugerir com IA"}
              </button>
            </div>
          </form>
          {draft && (
            <section className="ai-result">
              <SourceNote sources={draft.sources} generic={draft.generic} />
              <p className="hint">Desmarque o que não quiser guardar. Você pode editar os cartões depois de salvar.</p>
              <ul className="group">
                {draft.cards.map((card, index) => (
                  <li key={index} className="row draft-card">
                    <input type="checkbox" className="round-check" checked={draft.keep[index]} aria-label={`Guardar cartão: ${card.front}`} onChange={() => setDraft((current) => ({ ...current, keep: current.keep.map((value, position) => (position === index ? !value : value)) }))} />
                    <span className="row-main">
                      <strong>{card.front}</strong>
                      <small>{card.back}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="form-actions">
                <button className="btn primary" disabled={loading || !draft.keep.some(Boolean)} onClick={saveDraft}>
                  {loading ? "Salvando..." : `Guardar ${draft.keep.filter(Boolean).length} cartões`}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {mode === "lista" &&
        (cards.length ? (
          <ul className="group">
            {cards.map((card) => (
              <li key={card.id} className="row">
                <span className="row-main">
                  <strong>{card.front}</strong>
                  <small>{card.back}</small>
                  <small>
                    {card.level === "nova" ? "Novo" : card.level === "fácil" ? "Fácil" : "Difícil"}, {card.reviews} {card.reviews === 1 ? "revisão" : "revisões"}
                    {card.origin === "Sugestão da IA" ? ", sugerido pela IA" : ""}
                  </small>
                </span>
                <button className="icon-btn" aria-label="Editar cartão" onClick={() => setModal({ type: "card", card })}>
                  <PenLine size={15} />
                </button>
                <button className="icon-btn" aria-label="Excluir cartão" onClick={() => setModal({ type: "delete", card })}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="quiet">Nenhum cartão ainda.</p>
        ))}

      {modal?.type === "card" && <CardForm card={modal.card} subjectId={subjectId} onClose={() => setModal(null)} />}
      {modal?.type === "delete" && (
        <Confirm
          title="Excluir cartão?"
          message={`“${modal.card.front}” será excluído.`}
          onConfirm={async () => {
            await remove("flashcards", modal.card.id);
            toast("Cartão excluído.");
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
