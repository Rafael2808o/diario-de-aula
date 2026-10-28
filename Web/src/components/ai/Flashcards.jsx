import { useMemo, useState } from "react";
import { PenLine, Plus, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso } from "../../lib/dates.js";
import { Confirm, Empty, FormError, Modal, Segmented, useSubmit } from "../../ui.jsx";
import { BasisHint, SourceNote, SubjectTopicFields, buildContext, postAi } from "./shared.jsx";

// Ordem de revisão: o que pede revisão e as dúvidas antes; o que você já sabe vai para o fim.
const order = { difícil: 0, dúvida: 1, nova: 2, fácil: 3 };

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

export const levelLabel = { nova: "Nova", difícil: "Revisar", dúvida: "Dúvida", fácil: "Sei" };
const shuffled = (ids) => {
  const copy = [...ids];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

// Cartas do Saber: pergunta na frente, resposta no verso. A classificação de cada carta fica salva no servidor.
function Review({ cards }) {
  const { update, toast } = useApp();
  const [onlyHard, setOnlyHard] = useState(false);
  const [mixed, setMixed] = useState(false);
  const deckIds = (hard, mix) => {
    const ids = cards.filter((card) => !hard || card.level === "difícil" || card.level === "dúvida").sort((a, b) => order[a.level] - order[b.level]).map((card) => card.id);
    return mix ? shuffled(ids) : ids;
  };
  const [deck, setDeck] = useState(() => deckIds(false, false));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({});
  const [busy, setBusy] = useState(false);
  const current = cards.find((card) => card.id === deck[index]);

  const restart = (hard = onlyHard, mix = mixed) => {
    setDeck(deckIds(hard, mix));
    setIndex(0);
    setFlipped(false);
    setTally({});
  };
  const move = (step) => {
    setIndex((value) => Math.max(0, Math.min(deck.length, value + step)));
    setFlipped(false);
  };
  const mark = async (level) => {
    setBusy(true);
    try {
      await update("flashcards", current.id, { level, reviews: current.reviews + 1, reviewedOn: todayIso() });
      setTally((value) => ({ ...value, [current.id]: level }));
      move(1);
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(false);
    }
  };
  const onKey = (event) => {
    if (event.target.closest("input, select, textarea")) return;
    if (event.key === "ArrowRight") move(1);
    if (event.key === "ArrowLeft") move(-1);
  };

  const counts = Object.values(tally).reduce((sum, level) => ({ ...sum, [level]: (sum[level] || 0) + 1 }), {});
  const options = (
    <div className="deck-options">
      <label className="check">
        <input type="checkbox" checked={onlyHard} onChange={(event) => { setOnlyHard(event.target.checked); restart(event.target.checked, mixed); }} /> Só dúvidas e “revisar”
      </label>
      <label className="check">
        <input type="checkbox" checked={mixed} onChange={(event) => { setMixed(event.target.checked); restart(onlyHard, event.target.checked); }} /> Embaralhar
      </label>
    </div>
  );

  if (!deck.length) {
    return (
      <div className="flashcard-stage">
        {options}
        <Empty compact mood="happy" title="Nenhuma carta de dúvida ou para revisar.">
          Tudo marcado como “Sei”. Desmarque o filtro para revisar tudo.
        </Empty>
      </div>
    );
  }

  if (!current) {
    const pending = deck.filter((id) => ["difícil", "dúvida"].includes(cards.find((card) => card.id === id)?.level));
    return (
      <div className="flashcard-stage">
        <Empty compact mood="happy" title="Feitiço lançado com sucesso. Rodada concluída!">
          {Object.keys(tally).length
            ? `Sei: ${counts.fácil || 0} · Dúvida: ${counts.dúvida || 0} · Revisar: ${counts.difícil || 0}.`
            : "Você passou pelas cartas sem classificar nenhuma."}
          <span className="form-actions centered">
            <button className="btn small" onClick={() => move(-deck.length)}>
              Voltar ao início
            </button>
            {pending.length > 0 && (
              <button className="btn small primary" onClick={() => { setOnlyHard(true); restart(true, mixed); }}>
                Revisar {pending.length} {pending.length === 1 ? "carta difícil" : "cartas difíceis"}
              </button>
            )}
            <button className="btn small" onClick={() => restart()}>
              Nova rodada
            </button>
          </span>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flashcard-stage" onKeyDown={onKey}>
      {options}
      <div className="deck-progress">
        <span>
          Carta {index + 1} de {deck.length}
        </span>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={deck.length} aria-valuenow={index + 1} aria-label="Progresso da rodada">
          <span style={{ width: `${((index + 1) / deck.length) * 100}%` }} />
        </div>
        <span className={`level-tag level-${current.level}`}>{levelLabel[current.level]}</span>
      </div>
      <button type="button" className={`flashcard ${flipped ? "is-flipped" : ""}`} onClick={() => setFlipped((value) => !value)} aria-label={flipped ? "Resposta. Toque para voltar à pergunta." : "Pergunta. Toque para ver a resposta."}>
        <span className="flashcard-inner">
          <span className="flashcard-face front" aria-hidden={flipped}>
            <span className="flashcard-side">Pergunta</span>
            <strong>{current.front}</strong>
            <small>Toque para ver a resposta</small>
          </span>
          <span className="flashcard-face back" aria-hidden={!flipped}>
            <span className="flashcard-side">Resposta</span>
            <strong>{current.back}</strong>
            <small>Toque para voltar à pergunta</small>
          </span>
        </span>
      </button>
      <div className="deck-nav">
        <button type="button" className="btn small ghost" onClick={() => move(-1)} disabled={index === 0}>
          Anterior
        </button>
        <div className="deck-grade" role="group" aria-label="Como foi esta carta?">
          <button type="button" className="btn small grade-hard" disabled={busy || !flipped} onClick={() => mark("difícil")}>
            Revisar
          </button>
          <button type="button" className="btn small grade-doubt" disabled={busy || !flipped} onClick={() => mark("dúvida")}>
            Dúvida
          </button>
          <button type="button" className="btn small primary" disabled={busy || !flipped} onClick={() => mark("fácil")}>
            Sei
          </button>
        </div>
        <button type="button" className="btn small ghost" onClick={() => move(1)}>
          Próxima
        </button>
      </div>
      {!flipped && <p className="hint centered">Vire a carta para classificar. Use as setas do teclado para navegar.</p>}
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
  const [examFilter, setExamFilter] = useState(preset.examId || "");
  const subjectExams = data.exams.filter((exam) => exam.subjectId === subjectId && data.flashcards.some((card) => card.examId === exam.id));
  const cards = data.flashcards.filter((card) => card.subjectId === subjectId && (!examFilter || card.examId === examFilter));

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
          <select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setExamFilter(""); }}>
            {data.subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {subjectExams.length > 0 && (
          <label className="inline-field">
            Assunto
            <select value={examFilter} onChange={(event) => setExamFilter(event.target.value)}>
              <option value="">Todas as cartas</option>
              {subjectExams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <Segmented label="Modo" value={mode} onChange={setMode} options={[["revisar", `Revisar (${cards.length})`], ["criar", "Criar cartões"], ["lista", "Todos os cartões"]]} />
      </div>

      {mode === "revisar" &&
        (cards.length ? (
          <Review key={subjectId + examFilter} cards={cards} />
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
                    {levelLabel[card.level]}, {card.reviews} {card.reviews === 1 ? "revisão" : "revisões"}
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
