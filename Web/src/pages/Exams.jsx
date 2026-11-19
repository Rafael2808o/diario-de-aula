import { useState } from "react";
import { ArrowLeft, BookOpen, ChevronRight, Moon, CircleHelp, Layers, Link2, LifeBuoy, ListPlus, PenLine, Plus, Route, Search, Unlink } from "lucide-react";
import { useApp } from "../context.js";
import { countdown, daysBetween, formatFull, formatLong, monthShort, todayIso } from "../lib/dates.js";
import { examLessons, lessonHasContent, lessonsMentioning, subjectById } from "../lib/domain.js";
import { Confirm, Empty, Modal, Nox, Segmented, SubjectTag } from "../ui.jsx";
import { ExamForm, MaterialForm, MaterialLinks, NoteForm } from "../components/forms.jsx";
import { PlanBuilder } from "../components/ai/ExamTools.jsx";

export const topicStates = ["Não iniciado", "Em estudo", "Revisado", "Dominado"];
export const originClass = (confirmation) => (confirmation === "Confirmado pelo professor" ? "prof" : confirmation === "Hipótese pessoal" ? "self" : "ai");

const revisedCount = (exam) => exam.topics.filter((topic) => topic.status === "Revisado" || topic.status === "Dominado").length;
const prepTone = { "Não iniciada": "idle", "Em andamento": "doing", "Revisão final": "final", Pronto: "done" };

function TopicBar({ exam }) {
  const total = exam.topics.length;
  if (!total) return <small className="ex-bar-empty">Nenhum assunto ainda</small>;
  const done = revisedCount(exam);
  return (
    <span className="ex-bar" role="img" aria-label={`${done} de ${total} assuntos revisados`}>
      <span className="ex-bar-track">
        {exam.topics.slice(0, 12).map((topic, index) => (
          <i key={index} className={topic.status === "Revisado" || topic.status === "Dominado" ? "on" : ""} />
        ))}
      </span>
      <small>
        {done} de {total} revisados
      </small>
    </span>
  );
}

export default function Exams() {
  const { data, params, go } = useApp();
  const [filter, setFilter] = useState("futuras");
  const [creating, setCreating] = useState(false);
  const today = todayIso();
  const exam = params.id ? data.exams.find((item) => item.id === params.id) : null;
  if (params.id && exam) return <ExamDetail exam={exam} />;

  const upcoming = data.exams.filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  // A próxima prova fica em destaque e não se repete na lista de futuras.
  const list = data.exams
    .filter((item) => (filter === "futuras" ? item.date >= today && item.id !== next?.id : filter === "concluidas" ? item.date < today : true))
    .sort((a, b) => (filter === "concluidas" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  const nextSubject = next ? subjectById(data.subjects, next.subjectId) : null;
  const nextPending = next ? next.topics.filter((topic) => topic.status === "Não iniciado" || topic.status === "Em estudo").length : 0;
  const daysLeft = next ? daysBetween(today, next.date) : 0;
  const topicsTotal = upcoming.reduce((sum, item) => sum + item.topics.length, 0);
  const topicsDone = upcoming.reduce((sum, item) => sum + revisedCount(item), 0);
  const examSubjects = new Set(upcoming.map((item) => item.subjectId));
  const sessions = data["study-sessions"].filter((session) => examSubjects.has(session.subjectId)).length;

  return (
    <div className="page exams-v4">
      <header className="page-head">
        <div>
          <h1>Provas</h1>
          <p>Um passo de cada vez. Seu conhecimento está sendo construído.</p>
        </div>
        <div className="page-actions">
          <button className="btn ex-sos" onClick={() => go("ia", { tool: "socorro" })}>
            <LifeBuoy size={16} /> Socorro, tenho prova!
          </button>
          <button className="btn primary" onClick={() => setCreating(true)} disabled={!data.subjects.length}>
            <Plus size={16} /> Nova avaliação
          </button>
        </div>
      </header>
      {params.id && !exam && <p className="notice">Esta avaliação foi excluída.</p>}

      {next && (
        <div className="ex-top">
          <section className="ex-next" style={{ "--subject": nextSubject?.color }} aria-labelledby="ex-next-title">
            <p className="eyebrow">
              <Moon size={13} /> Próxima avaliação
            </p>
            <div className="ex-next-head">
              <div>
                <h2 id="ex-next-title">{next.title}</h2>
                <p>
                  {nextSubject?.name || "Sem disciplina"} · {formatLong(next.date)}
                  {next.time ? ` · ${next.time}` : ""}
                  {next.location ? ` · ${next.location}` : ""}
                </p>
              </div>
              <div className="ex-days" aria-label={countdown(next.date, today)}>
                <strong>{daysLeft === 0 ? "Hoje" : daysLeft}</strong>
                <small>{daysLeft === 0 ? "é o dia" : daysLeft === 1 ? "dia restante" : "dias restantes"}</small>
              </div>
            </div>
            <div className="ex-next-facts">
              <span>
                <b>{next.topics.length}</b> {next.topics.length === 1 ? "assunto cadastrado" : "assuntos cadastrados"}
              </span>
              <span>
                <b>{revisedCount(next)}</b> {revisedCount(next) === 1 ? "assunto revisado" : "assuntos revisados"}
              </span>
              <span className={`ex-prep ${prepTone[next.prepStatus] || "idle"}`}>{next.prepStatus}</span>
            </div>
            <TopicBar exam={next} />
            <div className="ex-next-actions">
              <button className="btn primary" onClick={() => go("provas", { id: next.id })}>
                Entrar na sala de preparação
              </button>
              <button className="btn ghost" onClick={() => go("ia", { exam: next.id })}>
                Revisar com a IA
              </button>
            </div>
          </section>
          <aside className="ex-corner">
            <h2>
              <Nox size={34} mood="focused" /> Seu cantinho de estudos
            </h2>
            {next.topics.length ? (
              nextPending ? (
                <p>
                  <strong>Que tal revisar {nextSubject?.name || "a matéria"}?</strong> A prova é {countdown(next.date, today)} e ainda {nextPending === 1 ? "falta 1 assunto" : `faltam ${nextPending} assuntos`}.
                </p>
              ) : (
                <p>
                  <strong>Tudo revisado. 💜</strong> Faça um simulado para conferir se ficou mesmo.
                </p>
              )
            ) : (
              <p>
                <strong>Cadastre os assuntos da prova.</strong> Com eles, a IA monta o roteiro e as questões certas.
              </p>
            )}
            <button className="btn ghost" onClick={() => go("ia", nextPending || !next.topics.length ? { tool: "socorro" } : { tool: "simulado", exam: next.id })}>
              {nextPending || !next.topics.length ? "Começar a estudar" : "Fazer um simulado"}
            </button>
          </aside>
        </div>
      )}

      {upcoming.length > 0 && (
        <dl className="ex-stats">
          <div>
            <dt>avaliações futuras</dt>
            <dd>{upcoming.length}</dd>
          </div>
          <div>
            <dt>assuntos cadastrados</dt>
            <dd>{topicsTotal}</dd>
          </div>
          <div>
            <dt>assuntos revisados</dt>
            <dd>{topicsDone}</dd>
          </div>
          <div>
            <dt>sessões de foco nessas matérias</dt>
            <dd>{sessions}</dd>
          </div>
          <div className={topicsTotal - topicsDone ? "warn" : ""}>
            <dt>assuntos pendentes</dt>
            <dd>{topicsTotal - topicsDone}</dd>
          </div>
        </dl>
      )}

      <div className="ex-list-head">
        <h2 className="section-title">Agenda de avaliações</h2>
        <Segmented label="Filtrar avaliações" value={filter} onChange={setFilter} options={[["futuras", "Futuras"], ["concluidas", "Concluídas"], ["todas", "Todas"]]} />
      </div>
      {list.length ? (
        <ul className="ex-list">
          {list.map((item) => {
            const subject = subjectById(data.subjects, item.subjectId);
            return (
              <li key={item.id}>
                <button type="button" style={{ "--subject": subject?.color }} onClick={() => go("provas", { id: item.id })}>
                  <span className="ex-date" aria-hidden="true">
                    <small>{monthShort(item.date)}</small>
                    <strong>{Number(item.date.slice(8))}</strong>
                  </span>
                  <span className="ex-main">
                    <strong>{item.title}</strong>
                    <small>
                      <i aria-hidden="true" /> {subject?.name || "Sem disciplina"}
                      {item.time ? ` · ${item.time}` : ""}
                    </small>
                  </span>
                  <span className="ex-when">{countdown(item.date, today)}</span>
                  <TopicBar exam={item} />
                  <span className={`ex-prep ${prepTone[item.prepStatus] || "idle"}`}>{item.prepStatus}</span>
                  <ChevronRight size={17} className="ex-go" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : next && filter === "futuras" ? (
        <p className="hint">Só a prova em destaque está marcada por enquanto.</p>
      ) : (
        <Empty
          title={data.subjects.length ? (filter === "futuras" ? "Nenhuma prova marcada." : "Nenhuma avaliação neste filtro.") : "Cadastre uma disciplina primeiro."}
          action={
            data.subjects.length ? (
              <button className="btn primary" onClick={() => setCreating(true)}>
                Cadastrar avaliação
              </button>
            ) : (
              <button className="btn primary" onClick={() => go("conteudos")}>
                Cadastrar disciplina
              </button>
            )
          }
        >
          {filter === "futuras" && data.subjects.length ? "Quando o professor marcar uma prova, cadastre a data e os assuntos confirmados." : null}
        </Empty>
      )}
      {list.length > 0 && filter === "futuras" && next && <p className="hint ex-foot">A próxima avaliação aparece em destaque acima e não se repete na agenda.</p>}
      {creating && <ExamForm onClose={() => setCreating(false)} onSaved={(saved) => go("provas", { id: saved.id })} />}
    </div>
  );
}

const normalize = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lessonText = (lesson) => [lesson.taught, lesson.missedContent, lesson.notes, lesson.examInfo].filter(Boolean).join("\n");

// Conteúdos das aulas na revisão da prova: mostra o registro original (nunca uma cópia), então edições
// na aula aparecem aqui na hora e nada é duplicado.
function LessonContents({ exam }) {
  const { data, go, update, toast } = useApp();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [linking, setLinking] = useState(false);
  const items = examLessons(data, exam);
  const term = normalize(query.trim());
  const shown = term ? items.filter(({ lesson }) => normalize([lesson.theme, lessonText(lesson)].join(" ")).includes(term)) : items;
  const included = new Set(items.map(({ lesson }) => lesson.id));
  const candidates = data.lessons.filter((lesson) => lesson.subjectId === exam.subjectId && !included.has(lesson.id) && lessonHasContent(lesson)).sort((a, b) => b.date.localeCompare(a.date));
  // Tema da aula vira assunto da prova, sem repetir assunto que já existe (comparação sem acento e sem caixa).
  const topicKeys = new Set(exam.topics.map((topic) => normalize(topic.title).trim()));
  const missingThemes = items.map(({ lesson }) => lesson.theme?.trim()).filter((theme, index, list) => theme && !topicKeys.has(normalize(theme)) && list.findIndex((other) => normalize(other) === normalize(theme)) === index);
  const addTopics = async (themes) => {
    try {
      await update("exams", exam.id, { topics: [...exam.topics, ...themes.map((title) => ({ title: title.slice(0, 160), status: "Não iniciado" }))] });
      toast(themes.length === 1 ? "Assunto incluído na prova." : `${themes.length} assuntos incluídos na prova.`);
    } catch (failure) {
      toast(failure.message);
    }
  };
  const link = async (lesson, examId) => {
    try {
      await update("lessons", lesson.id, { examId });
      toast(examId ? "Aula vinculada a esta prova." : "Vínculo removido. A aula volta a seguir a data.");
    } catch (failure) {
      toast(failure.message);
    }
  };
  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">Conteúdos das aulas</h2>
        <span className="section-actions">
          {missingThemes.length > 0 && (
            <button className="link-btn" onClick={() => addTopics(missingThemes)}>
              <ListPlus size={14} /> Incluir {missingThemes.length === 1 ? "o tema" : `os ${missingThemes.length} temas`} nos assuntos
            </button>
          )}
          <button className="link-btn" onClick={() => setLinking(true)} disabled={!candidates.length}>
            <Link2 size={14} /> Vincular outra aula
          </button>
        </span>
      </div>
      {items.length ? (
        <>
          <p className="hint">
            Entram sozinhas as aulas desta disciplina registradas até a data da prova e depois da prova anterior. O texto é o do registro da aula: se você editar a aula, muda aqui também.
          </p>
          {items.length > 3 && (
            <label className="search-field lesson-filter">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar por assunto" aria-label="Filtrar conteúdos das aulas por assunto" />
            </label>
          )}
          <ul className="group lesson-contents">
            {shown.map(({ lesson, origin }) => {
              const text = lessonText(lesson);
              const expanded = open === lesson.id;
              return (
                <li key={lesson.id} className="row lesson-content">
                  <span className="row-main">
                    <span className={`origin ${origin === "vinculada" ? "origin-self" : "origin-prof"}`}>{origin === "vinculada" ? "Vinculada por você" : "Da aula, pela data"}</span>
                    <strong>
                      {formatFull(lesson.date)}
                      {lesson.theme ? `: ${lesson.theme}` : ""}
                      {lesson.status === "falta" ? " (falta)" : ""}
                    </strong>
                    {text && <span className={`prewrap lesson-excerpt ${expanded ? "is-open" : ""}`}>{text}</span>}
                    <span className="lesson-content-actions">
                      {text.length > 220 && (
                        <button className="link-btn" onClick={() => setOpen(expanded ? null : lesson.id)}>
                          {expanded ? "Mostrar menos" : "Ler tudo"}
                        </button>
                      )}
                      <button className="link-btn" onClick={() => go("aulas", { lesson: lesson.id })}>
                        Abrir aula
                      </button>
                      {lesson.theme && !topicKeys.has(normalize(lesson.theme).trim()) && (
                        <button className="link-btn" onClick={() => addTopics([lesson.theme.trim()])}>
                          <ListPlus size={13} /> Incluir nos assuntos
                        </button>
                      )}
                      {origin === "vinculada" && (
                        <button className="link-btn" onClick={() => link(lesson, null)}>
                          <Unlink size={13} /> Desvincular
                        </button>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {term && !shown.length && <p className="quiet">Nenhuma aula com esse assunto.</p>}
        </>
      ) : (
        <p className="quiet">Nenhuma aula com conteúdo registrado neste período. Quando você registrar as aulas desta disciplina, o conteúdo aparece aqui.</p>
      )}
      {linking && (
        <Modal title="Vincular aula a esta prova" onClose={() => setLinking(false)}>
          <p className="modal-text">Escolha uma aula da disciplina. Ela passa a aparecer só nesta prova, mesmo que a data indique outra.</p>
          <ul className="group">
            {candidates.map((lesson) => (
              <li key={lesson.id}>
                <button type="button" className="row" onClick={() => link(lesson, exam.id).then(() => setLinking(false))}>
                  <span className="row-main">
                    <strong>
                      {formatFull(lesson.date)}
                      {lesson.theme ? `: ${lesson.theme}` : ""}
                    </strong>
                    <small>{lesson.examId ? `Hoje vinculada a: ${data.exams.find((item) => item.id === lesson.examId)?.title || "outra prova"}` : "Segue a data"}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  );
}

function ExamDetail({ exam }) {
  const { data, params, go, update, remove, toast } = useApp();
  const [modal, setModal] = useState(null);
  const [prepared, setPrepared] = useState(params.preparar === "1");
  const subject = subjectById(data.subjects, exam.subjectId);
  const today = todayIso();
  const notes = data["teacher-notes"].filter(
    (note) => note.examId === exam.id || (note.subjectId === exam.subjectId && !note.examId && ["Formato da prova", "Conteúdos cobrados", "Data de avaliação", "Tipo e quantidade de questões"].includes(note.category)),
  );
  const relatedLessons = data.lessons.filter((lesson) => exam.topics.some((topic) => lessonsMentioning([lesson], exam.subjectId, topic.title).length));
  const materials = data.materials.filter((material) => material.examId === exam.id || material.subjectId === exam.subjectId);
  const pending = exam.topics.filter((topic) => topic.status === "Não iniciado" || topic.status === "Em estudo");
  const results = data["quiz-results"].filter((result) => result.examId === exam.id || (result.subjectId === exam.subjectId && exam.topics.some((topic) => topic.title.toLowerCase() === result.topic.toLowerCase())));
  const mistakes = results.flatMap((result) => result.mistakes);
  const counts = Object.fromEntries(topicStates.map((state) => [state, exam.topics.filter((topic) => topic.status === state).length]));

  const setTopic = (topicId, status) => update("exams", exam.id, { topics: exam.topics.map((topic) => (topic.id === topicId ? { ...topic, status } : topic)) }).catch((error) => toast(error.message));

  return (
    <div className="page exam-detail" style={{ "--subject": subject?.color }}>
      <button className="link-btn back" onClick={() => go("provas")}>
        <ArrowLeft size={15} /> Provas
      </button>
      <header className="detail-head">
        <div>
          <SubjectTag subject={subject} />
          <h1>{exam.title}</h1>
          <p>
            {formatLong(exam.date)}
            {exam.time ? ` às ${exam.time}` : ""}, {countdown(exam.date, today)}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setModal("edit")}>
            <PenLine size={15} /> Editar
          </button>
          <button className="btn primary" onClick={() => setPrepared(true)}>
            <Route size={16} /> Preparar-me para esta prova
          </button>
        </div>
      </header>

      {prepared && (
        <section className="prep">
          <h2 className="section-title">Como estudar</h2>
          {exam.topics.length ? (
            <>
              <p className="lead">
                {pending.length ? `Faltam ${pending.length} de ${exam.topics.length} assuntos. Comece por ${pending[0].title}.` : "Todos os assuntos estão revisados ou dominados. Faça um simulado para conferir."}{" "}
                {relatedLessons.length
                  ? `Eles aparecem em ${relatedLessons.length} ${relatedLessons.length === 1 ? "aula registrada" : "aulas registradas"}, listadas abaixo de cada assunto.`
                  : "Nenhuma aula registrada cita esses assuntos ainda."}
              </p>
              <PlanBuilder exam={exam} />
              <div className="form-actions">
                <button className="btn" onClick={() => go("ia", { tool: "resumo", exam: exam.id })}>
                  <BookOpen size={15} /> Resumir as aulas
                </button>
                <button className="btn" onClick={() => go("ia", { tool: "simulado", exam: exam.id })}>
                  <CircleHelp size={15} /> Fazer um simulado
                </button>
                <button className="btn" onClick={() => go("ia", { tool: "flashcards", exam: exam.id })}>
                  <Layers size={15} /> Flashcards
                </button>
              </div>
            </>
          ) : (
            <p className="warning">
              A Grimiau não adivinha o que vai cair. Informe os assuntos que o professor confirmou para montar a trilha.{" "}
              <button className="link-btn" onClick={() => setModal("edit")}>
                Informar assuntos
              </button>
            </p>
          )}
        </section>
      )}

      <div className="detail-columns">
        <div>
          <LessonContents exam={exam} />
          <section>
            <h2 className="section-title">Assuntos adicionados por você e seu progresso</h2>
            {exam.topics.length ? (
              <>
                <p className="hint">
                  {counts["Não iniciado"]} não iniciados, {counts["Em estudo"]} em estudo, {counts.Revisado} revisados e {counts.Dominado} dominados. Quem marca é você.
                </p>
                <ul className="group">
                  {exam.topics.map((topic) => {
                    const lessons = lessonsMentioning(data.lessons, exam.subjectId, topic.title);
                    return (
                      <li key={topic.id} className="row topic-row">
                        <span className="row-main">
                          <strong>{topic.title}</strong>
                          <small>
                            {lessons.length
                              ? lessons.map((lesson, index) => (
                                  <button key={lesson.id} className="link-btn" onClick={() => go("aulas", { lesson: lesson.id })}>
                                    {index ? ", " : "Aula de "}
                                    {formatFull(lesson.date)}
                                  </button>
                                ))
                              : "Nenhuma aula registrada cita este assunto"}
                          </small>
                        </span>
                        <select aria-label={`Progresso em ${topic.title}`} value={topic.status} onChange={(event) => setTopic(topic.id, event.target.value)}>
                          {topicStates.map((state) => (
                            <option key={state}>{state}</option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="quiet">
                Assuntos ainda não informados.{" "}
                <button className="link-btn" onClick={() => setModal("edit")}>
                  Informar assuntos
                </button>
              </p>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2 className="section-title">Orientações do professor</h2>
              <button className="link-btn" onClick={() => setModal("note")}>
                <Plus size={14} /> Adicionar
              </button>
            </div>
            {notes.length ? (
              <ul className="group">
                {notes.map((note) => (
                  <li key={note.id} className="row vault-row">
                    <span className="row-main">
                      <span className={`origin origin-${originClass(note.confirmation)}`}>{note.confirmation}</span>
                      <span className="vault-text">{note.content}</span>
                      <small>
                        {note.category}
                        {note.informedOn ? `, em ${formatFull(note.informedOn)}` : ""}
                        {note.lessonId ? ", anotado em aula" : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">Nada guardado no cofre sobre esta prova.</p>
            )}
          </section>

          <section>
            <h2 className="section-title">Revisão final</h2>
            {pending.length || mistakes.length ? (
              <ul className="group">
                {pending.map((topic) => (
                  <li key={topic.id} className="row">
                    <span className="row-main">
                      <strong>Revisar {topic.title}</strong>
                      <small>Marcado como {topic.status.toLowerCase()}</small>
                    </span>
                  </li>
                ))}
                {mistakes.slice(0, 8).map((mistake, index) => (
                  <li key={`erro-${index}`} className="row">
                    <span className="row-main">
                      <strong>{mistake.question}</strong>
                      <small>
                        Você marcou “{mistake.chosen}”. Correta: “{mistake.correct}”.
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">{exam.topics.length ? "Sem pendências nem erros registrados." : "A lista aparece quando a prova tiver assuntos."}</p>
            )}
          </section>
        </div>

        <aside>
          <section>
            <h2 className="section-title">Informações gerais</h2>
            <dl className="group stat-list">
              <div className="row">
                <dt>Data</dt>
                <dd>
                  {formatFull(exam.date)}
                  {exam.time ? ` às ${exam.time}` : ""}
                </dd>
              </div>
              <div className="row">
                <dt>Local</dt>
                <dd>{exam.location || "Não informado"}</dd>
              </div>
              <div className="row">
                <dt>Formato</dt>
                <dd>{exam.format || "Não informado"}</dd>
              </div>
              <div className="row">
                <dt>Questões</dt>
                <dd>{exam.questionsInfo || "Não informado"}</dd>
              </div>
              <div className="row">
                <dt>Preparação</dt>
                <dd>
                  <select aria-label="Situação da preparação" value={exam.prepStatus} onChange={(event) => update("exams", exam.id, { prepStatus: event.target.value }).catch((error) => toast(error.message))}>
                    {["Não iniciada", "Em andamento", "Revisão final", "Pronto"].map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </dd>
              </div>
            </dl>
            {exam.instructions && (
              <div className="note-block">
                <h3>Instruções do professor</h3>
                <p className="prewrap">{exam.instructions}</p>
              </div>
            )}
            {exam.personalNotes && (
              <div className="note-block">
                <h3>Observações pessoais</h3>
                <p className="prewrap">{exam.personalNotes}</p>
              </div>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2 className="section-title">Materiais para estudar</h2>
              <button className="link-btn" onClick={() => setModal("material")}>
                <Plus size={14} /> Adicionar
              </button>
            </div>
            {materials.length ? (
              <ul className="group">
                {materials.map((material) => (
                  <li key={material.id} className="row">
                    <span className="row-main">
                      <MaterialLinks material={material} />
                      <small>{material.type}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">Nenhum material desta disciplina.</p>
            )}
            {exam.references && <p className="prewrap hint">{exam.references}</p>}
          </section>

          <section>
            <div className="section-head">
              <h2 className="section-title">Simulados</h2>
              <button className="link-btn" onClick={() => go("ia", { tool: "simulado", exam: exam.id })}>
                Fazer simulado
              </button>
            </div>
            {results.length ? (
              <ul className="group">
                {results.slice(0, 5).map((result) => (
                  <li key={result.id} className="row">
                    <span className="row-main">
                      <strong>{result.topic || "Simulado"}</strong>
                      <small>{formatFull(result.takenOn)}</small>
                    </span>
                    <span className="score">
                      {result.correct} de {result.total}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">Nenhum simulado feito para esta prova.</p>
            )}
          </section>
        </aside>
      </div>

      {modal === "edit" && <ExamForm exam={exam} onClose={() => setModal(null)} onDelete={() => setModal("delete")} />}
      {modal === "note" && <NoteForm defaults={{ subjectId: exam.subjectId, examId: exam.id }} onClose={() => setModal(null)} />}
      {modal === "material" && <MaterialForm defaults={{ subjectId: exam.subjectId, examId: exam.id }} onClose={() => setModal(null)} />}
      {modal === "delete" && (
        <Confirm
          title="Excluir avaliação?"
          message={`“${exam.title}” será excluída. Informações do cofre, materiais e simulados ligados a ela continuam salvos, sem o vínculo.`}
          onConfirm={async () => {
            await remove("exams", exam.id, { reload: true });
            toast("Avaliação excluída.");
            go("provas");
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
