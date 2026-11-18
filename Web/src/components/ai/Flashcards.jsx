import { useMemo, useState } from "react";
import { PenLine, Plus, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso } from "../../lib/dates.js";
import { Confirm, Empty, FormError, Modal, Segmented, useSubmit } from "../../ui.jsx";
import { TarotBack } from "../Art.jsx";
import { BasisHint, SourceNote, SubjectTopicFields, buildContext, lessonSourceText, postAi, AiProgress } from "./shared.jsx";
import { formatShort } from "../../lib/dates.js";

// Ordem de revisão: o que pede revisão e as dúvidas antes; o que você já sabe vai para o fim.
const order = { difícil: 0, dúvida: 1, nova: 2, fácil: 3 };

function CardForm({ card, subjectId, defaults = {}, onClose }) {
  const { create, update, data } = useApp();
  const subject = card?.subjectId || subjectId;
  const decks = deckNames(data.flashcards.filter((item) => item.subjectId === subject));
  const lessons = lessonsWithContent(data, subject);
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
          submit({ ...values, lessonId: values.lessonId || null, subjectId: subject });
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
        <div className="form-row">
          <label>
            Conjunto ou tema
            <input name="deck" maxLength={80} list="card-decks" defaultValue={card?.deck ?? defaults.deck ?? ""} placeholder="Ex.: Segmentação de mercado" />
            <datalist id="card-decks">
              {decks.map((deck) => (
                <option key={deck} value={deck} />
              ))}
            </datalist>
          </label>
          <label>
            Aula de origem
            <select name="lessonId" defaultValue={card?.lessonId ?? defaults.lessonId ?? ""}>
              <option value="">Nenhuma aula específica</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lessonLabel(lesson)}
                </option>
              ))}
            </select>
          </label>
        </div>
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

// Organização das cartas: conjunto (tema escrito pela pessoa), aula de origem e prova.
const noDeck = "Sem conjunto";
export const deckNames = (cards) => [...new Set(cards.map((card) => (card.deck || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const lessonLabel = (lesson) => `Aula de ${formatShort(lesson.date)}${lesson.theme ? ` · ${lesson.theme}` : ""}`;
const lessonsWithContent = (data, subjectId) => data.lessons.filter((lesson) => lesson.subjectId === subjectId && lesson.status !== "cancelada" && lessonSourceText(lesson));

// Lista agrupada pelo conjunto; sem conjunto, pela aula de origem; o resto em "Sem conjunto".
function groupByDeck(cards, data) {
  const groups = new Map();
  for (const card of cards) {
    const deck = (card.deck || "").trim();
    const lesson = !deck && card.lessonId ? data.lessons.find((item) => item.id === card.lessonId) : null;
    const key = deck ? `deck:${deck}` : lesson ? `aula:${lesson.id}` : "sem";
    if (!groups.has(key)) groups.set(key, { key, title: deck || (lesson ? lessonLabel(lesson) : noDeck), cards: [] });
    groups.get(key).cards.push(card);
  }
  return [...groups.values()].sort((a, b) => (a.key === "sem") - (b.key === "sem") || a.title.localeCompare(b.title, "pt-BR"));
}

export const levelLabel = { nova: "Nova", difícil: "Não sei", dúvida: "Revisar", fácil: "Dominei" };
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
  const [mixed, setMixed] = useState(true);
  const deckIds = (hard, mix) => {
    const ids = cards.filter((card) => !hard || card.level === "difícil" || card.level === "dúvida").sort((a, b) => order[a.level] - order[b.level]).map((card) => card.id);
    return mix ? shuffled(ids) : ids;
  };
  const [deck, setDeck] = useState(() => deckIds(false, true));
  const [index, setIndex] = useState(0);
  // 0: carta fechada (verso do tarô), 1: pergunta, 2: resposta.
  const [face, setFace] = useState(0);
  const flipped = face > 0;
  const setFlipped = (value) => setFace(value ? 1 : 0);
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
        <input type="checkbox" checked={onlyHard} onChange={(event) => { setOnlyHard(event.target.checked); restart(event.target.checked, mixed); }} /> Só “Não sei” e “Revisar”
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
          Tudo marcado como “Dominei”. Desmarque o filtro para revisar tudo.
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
            ? `Dominei: ${counts.fácil || 0} · Revisar: ${counts.dúvida || 0} · Não sei: ${counts.difícil || 0}.`
            : "Você passou pelas cartas sem classificar nenhuma."}
          <span className="form-actions centered">
            <button className="btn small" onClick={() => move(-deck.length)}>
              Voltar ao início
            </button>
            {pending.length > 0 && (
              <button className="btn small primary" onClick={() => { setOnlyHard(true); restart(true, mixed); }}>
                Revisar {pending.length} {pending.length === 1 ? "carta pendente" : "cartas pendentes"}
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
      <button
        type="button"
        className={`flashcard tarot ${flipped ? "is-flipped" : ""}`}
        onClick={() => setFace((value) => (value === 2 ? 1 : value + 1))}
        aria-label={face === 0 ? "Carta fechada. Toque para ver a pergunta." : face === 1 ? "Pergunta. Toque para ver a resposta." : "Resposta. Toque para voltar à pergunta."}
      >
        <span className="flashcard-inner">
          <span className="flashcard-face tarot-back" aria-hidden={flipped}>
            <TarotBack />
            <span className="tarot-label">Carta do Saber</span>
          </span>
          <span className="flashcard-face back tarot-front" aria-hidden={!flipped}>
            <span className="tarot-frame" aria-hidden="true" />
            <span className="flashcard-side">{face === 2 ? "Resposta" : "Pergunta"}</span>
            <strong key={face}>{face === 2 ? current.back : current.front}</strong>
            <small>{face === 2 ? "Toque para voltar à pergunta" : "Pense na resposta e toque para conferir"}</small>
          </span>
        </span>
      </button>
      <div className="deck-nav">
        <button type="button" className="icon-btn deck-arrow" aria-label="Carta anterior" onClick={() => move(-1)} disabled={index === 0}>
          ‹
        </button>
        <div className="deck-grade" role="group" aria-label="Como foi esta carta?">
          <button type="button" className="btn small grade-hard" disabled={busy || face !== 2} onClick={() => mark("difícil")}>
            Não sei
          </button>
          <button type="button" className="btn small grade-doubt" disabled={busy || face !== 2} onClick={() => mark("dúvida")}>
            Revisar
          </button>
          <button type="button" className="btn small primary" disabled={busy || face !== 2} onClick={() => mark("fácil")}>
            Dominei
          </button>
        </div>
        <button type="button" className="icon-btn deck-arrow" aria-label="Próxima carta" onClick={() => move(1)}>
          ›
        </button>
      </div>
      {face !== 2 && <p className="hint centered">{face === 0 ? "Toque na carta para revelar a pergunta." : "Vire de novo para ver a resposta e se avaliar."} As setas do teclado também navegam.</p>}
    </div>
  );
}

export default function Flashcards({ preset = {} }) {
  const { data, session, create, remove, toast } = useApp();
  const [subjectId, setSubjectId] = useState(preset.subjectId || data.subjects[0]?.id || "");
  const [mode, setMode] = useState(preset.mode === "criar" ? "criar" : "revisar");
  const [topic, setTopic] = useState(preset.topic || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(null);
  const [draft, setDraft] = useState(null);
  const [modal, setModal] = useState(null);
  // Fonte da geração: todas as aulas da disciplina ou uma aula só (inclui o Caderno da aula).
  const [sourceLesson, setSourceLesson] = useState(preset.lessonId || "");
  const plan = useMemo(() => buildContext(data, subjectId, topic, undefined, { lessonId: sourceLesson }), [data, subjectId, topic, sourceLesson]);
  const subject = data.subjects.find((item) => item.id === subjectId);
  // Filtro único: "deck:Nome", "aula:id", "prova:id", "sem" ou "" (todas).
  const [filter, setFilter] = useState(() => (preset.examId ? `prova:${preset.examId}` : preset.lessonId && data.flashcards.some((card) => card.lessonId === preset.lessonId) ? `aula:${preset.lessonId}` : ""));
  const [search, setSearch] = useState("");
  const [deckDraft, setDeckDraft] = useState("");
  const subjectCards = data.flashcards.filter((card) => card.subjectId === subjectId);
  const decks = deckNames(subjectCards);
  const subjectExams = data.exams.filter((exam) => exam.subjectId === subjectId && subjectCards.some((card) => card.examId === exam.id));
  const cardLessons = data.lessons.filter((lesson) => lesson.subjectId === subjectId && subjectCards.some((card) => card.lessonId === lesson.id));
  const sourceLessons = lessonsWithContent(data, subjectId);
  const isLoose = (card) => !(card.deck || "").trim() && !card.lessonId && !card.examId;
  const inFilter = (card) => {
    if (!filter) return true;
    if (filter === "sem") return isLoose(card);
    const split = filter.indexOf(":");
    const [kind, value] = [filter.slice(0, split), filter.slice(split + 1)];
    if (kind === "deck") return (card.deck || "").trim() === value;
    if (kind === "aula") return card.lessonId === value;
    if (kind === "prova") return card.examId === value;
    return true;
  };
  const term = search.trim().toLowerCase();
  const cards = subjectCards.filter((card) => inFilter(card) && (!term || `${card.front} ${card.back} ${card.deck || ""}`.toLowerCase().includes(term)));
  const looseCount = subjectCards.filter(isLoose).length;
  const lesson = data.lessons.find((item) => item.id === sourceLesson);

  const generate = async (event) => {
    event.preventDefault();
    if (!plan.sources.length) return setError("Registre ao menos uma aula desta disciplina para gerar cartões a partir dela.");
    setLoading(true);
    setError("");
    setStage(null);
    try {
      const payload = await postAi(session, "/ai/study", { tool: "flashcards", subject: subject.name, topic: topic || lesson?.theme || "", quantity: 8, context: plan.context }, setStage);
      setDeckDraft(topic.trim() || lesson?.theme || "");
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
      for (const card of chosen) await create("flashcards", { subjectId, front: card.front, back: card.back, origin: "Sugestão da IA", examId: preset.examId || null, lessonId: sourceLesson || null, deck: deckDraft.trim() });
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
          <select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setFilter(""); setSourceLesson(""); }}>
            {data.subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {(decks.length > 0 || cardLessons.length > 0 || subjectExams.length > 0) && (
          <label className="inline-field">
            Conjunto
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="">Todas as cartas ({subjectCards.length})</option>
              {decks.length > 0 && (
                <optgroup label="Conjuntos e temas">
                  {decks.map((deck) => (
                    <option key={deck} value={`deck:${deck}`}>
                      {deck} ({subjectCards.filter((card) => (card.deck || "").trim() === deck).length})
                    </option>
                  ))}
                </optgroup>
              )}
              {cardLessons.length > 0 && (
                <optgroup label="Aulas">
                  {cardLessons.map((item) => (
                    <option key={item.id} value={`aula:${item.id}`}>
                      {lessonLabel(item)}
                    </option>
                  ))}
                </optgroup>
              )}
              {subjectExams.length > 0 && (
                <optgroup label="Provas">
                  {subjectExams.map((exam) => (
                    <option key={exam.id} value={`prova:${exam.id}`}>
                      {exam.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {looseCount > 0 && looseCount < subjectCards.length && <option value="sem">{noDeck} ({looseCount})</option>}
            </select>
          </label>
        )}
        <Segmented label="Modo" value={mode} onChange={setMode} options={[["revisar", `Revisar (${cards.length})`], ["criar", "Criar cartões"], ["lista", "Todos os cartões"]]} />
      </div>

      {mode === "revisar" &&
        (cards.length ? (
          <Review key={subjectId + filter} cards={cards} />
        ) : (
          <Empty compact title={subjectCards.length ? "Nenhum cartão neste conjunto." : "Nenhum cartão nesta disciplina."}>
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
            {sourceLessons.length > 0 && (
              <label>
                Usar as anotações de
                <select value={sourceLesson} onChange={(event) => setSourceLesson(event.target.value)}>
                  <option value="">Todas as aulas da disciplina</option>
                  {sourceLessons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {lessonLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          {loading && !draft && <AiProgress kind="flashcards" stage={stage} />}
          {draft && (
            <section className="ai-result">
              <SourceNote sources={draft.sources} generic={draft.generic} />
              <p className="hint">Desmarque o que não quiser guardar. Você pode editar os cartões depois de salvar.</p>
              <label className="inline-field">
                Guardar no conjunto
                <input value={deckDraft} maxLength={80} list="draft-decks" placeholder="Ex.: Segmentação de mercado" onChange={(event) => setDeckDraft(event.target.value)} />
                <datalist id="draft-decks">
                  {decks.map((deck) => (
                    <option key={deck} value={deck} />
                  ))}
                </datalist>
              </label>
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

      {mode === "lista" && (
        <>
          {subjectCards.length > 0 && (
            <label className="inline-field card-search">
              Buscar
              <input type="search" value={search} placeholder="Pergunta, resposta ou conjunto" onChange={(event) => setSearch(event.target.value)} />
            </label>
          )}
          {cards.length ? (
            groupByDeck(cards, data).map((group) => (
              <section key={group.key} className="deck-group">
                <h3 className="deck-title">
                  {group.title} <small>{group.cards.length} {group.cards.length === 1 ? "carta" : "cartas"}</small>
                </h3>
                <ul className="group">
                  {group.cards.map((card) => {
                    const origin = card.lessonId && data.lessons.find((item) => item.id === card.lessonId);
                    return (
                      <li key={card.id} className="row">
                        <span className="row-main">
                          <strong>{card.front}</strong>
                          <small>{card.back}</small>
                          <small>
                            {levelLabel[card.level]}, {card.reviews} {card.reviews === 1 ? "revisão" : "revisões"}
                            {card.origin === "Sugestão da IA" ? ", sugerido pela IA" : ""}
                            {origin && (card.deck || "").trim() ? `, ${lessonLabel(origin)}` : ""}
                          </small>
                        </span>
                        <button className="icon-btn" aria-label="Editar cartão" onClick={() => setModal({ type: "card", card })}>
                          <PenLine size={15} />
                        </button>
                        <button className="icon-btn" aria-label="Excluir cartão" onClick={() => setModal({ type: "delete", card })}>
                          <Trash2 size={15} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <p className="quiet">{subjectCards.length ? "Nenhum cartão encontrado." : "Nenhum cartão ainda."}</p>
          )}
        </>
      )}

      {modal?.type === "card" && <CardForm card={modal.card} subjectId={subjectId} defaults={{ deck: filter.startsWith("deck:") ? filter.slice(5) : "", lessonId: filter.startsWith("aula:") ? filter.slice(5) : sourceLesson }} onClose={() => setModal(null)} />}
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
