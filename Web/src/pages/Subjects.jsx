import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, ExternalLink, GraduationCap, PenLine, Plus, Search } from "lucide-react";
import { useApp } from "../context.js";
import { countdown, formatFull, formatLong, todayIso, weekdayNames, weekdays } from "../lib/dates.js";
import { lessonStatus } from "../lib/domain.js";
import { Card, Confirm, Empty, Segmented, SubjectTag } from "../ui.jsx";
import { ExamForm, MaterialForm, MaterialLinks, NoteForm, SubjectForm, TaskForm } from "../components/forms.jsx";
import { LessonForm } from "../components/LessonForm.jsx";

export const scheduleText = (subject) =>
  subject.schedule.length
    ? subject.schedule.map((slot) => `${weekdayNames[weekdays.indexOf(slot.day)].slice(0, 3)} ${slot.start}–${slot.end}${slot.room ? ` (${slot.room})` : ""}`).join(", ")
    : "Sem horário fixo";

export function SubjectList({ onEdit }) {
  const { data, call, replace, toast, go } = useApp();
  const today = todayIso();
  const move = async (index, direction) => {
    const ids = data.subjects.map((subject) => subject.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      replace("subjects", await call("/subjects/order", { method: "PUT", body: { ids } }));
    } catch (error) {
      toast(error.message);
    }
  };
  return (
    <div className="subject-grid">
      {data.subjects.map((subject, index) => {
        const lessons = data.lessons.filter((lesson) => lesson.subjectId === subject.id && lesson.status === "presente").length;
        const nextExam = data.exams.find((exam) => exam.subjectId === subject.id && exam.date >= today);
        const pending = data.tasks.filter((task) => task.subjectId === subject.id && !task.done).length;
        return (
          <article key={subject.id} className="subject-card" style={{ "--subject": subject.color }}>
            <button type="button" className="subject-card-main" onClick={() => go("conteudos", { id: subject.id })}>
              <span className="subject-icon" aria-hidden="true">
                <BookOpen size={18} />
              </span>
              <strong>{subject.name}</strong>
              <small>{subject.professor || "Professor não informado"}</small>
              <span className="subject-meta">
                <span>{lessons} {lessons === 1 ? "aula registrada" : "aulas registradas"}</span>
                <span>{pending} {pending === 1 ? "tarefa pendente" : "tarefas pendentes"}</span>
                <span>{nextExam ? `Próxima prova ${countdown(nextExam.date, today)}` : "Sem prova marcada"}</span>
              </span>
            </button>
            <div className="subject-card-tools">
              <button className="icon-btn" aria-label={`Subir ${subject.name}`} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={15} />
              </button>
              <button className="icon-btn" aria-label={`Descer ${subject.name}`} disabled={index === data.subjects.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown size={15} />
              </button>
              <button className="icon-btn" aria-label={`Editar ${subject.name}`} onClick={() => onEdit(subject)}>
                <PenLine size={15} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function useSubjectEditing() {
  const { remove, toast } = useApp();
  const [editing, setEditing] = useState(null);
  const modal =
    editing?.mode === "delete" ? (
      <Confirm
        title="Excluir disciplina?"
        message={`Excluir “${editing.subject.name}” apaga também os registros de aula, as provas e as informações do cofre desta disciplina. Atividades, eventos e materiais continuam salvos, sem disciplina.`}
        onConfirm={async () => {
          await remove("subjects", editing.subject.id, { reload: true });
          toast("Disciplina excluída.");
        }}
        onClose={() => setEditing(null)}
      />
    ) : editing ? (
      <SubjectForm subject={editing.subject} onClose={() => setEditing(null)} onDelete={editing.subject && (() => setEditing({ mode: "delete", subject: editing.subject }))} />
    ) : null;
  return { open: (subject = null) => setEditing({ mode: "edit", subject }), modal };
}

export default function Subjects() {
  const { data, params } = useApp();
  const editing = useSubjectEditing();
  const subject = params.id ? data.subjects.find((item) => item.id === params.id) : null;
  if (subject) return <SubjectDetail subject={subject} />;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Biblioteca Arcana</h1>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => editing.open()}>
            <Plus size={16} /> Nova disciplina
          </button>
        </div>
      </header>
      {data.subjects.length ? (
        <SubjectList onEdit={editing.open} />
      ) : (
        <Empty title="Nenhuma disciplina ainda" action={<button className="btn primary" onClick={() => editing.open()}>Cadastrar disciplina</button>}>
          Cadastre as matérias do semestre com cor e horários. Elas organizam o calendário, as aulas e as provas.
        </Empty>
      )}
      {editing.modal}
    </div>
  );
}

const tabs = [
  ["geral", "Visão geral"],
  ["aulas", "Aulas"],
  ["conteudos", "Conteúdos"],
  ["provas", "Provas"],
  ["atividades", "Atividades"],
  ["materiais", "Materiais"],
  ["professor", "Professor"],
];

function SubjectDetail({ subject }) {
  const { data, params, go, user, update, toast } = useApp();
  const [tab, setTab] = useState(tabs.some(([id]) => id === params.tab) ? params.tab : "geral");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [modal, setModal] = useState(null);
  const editing = useSubjectEditing();
  const today = todayIso();
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lessons = data.lessons
    .filter((lesson) => lesson.subjectId === subject.id)
    .filter((lesson) => !from || lesson.date >= from)
    .filter((lesson) => !query || [lesson.theme, lesson.taught, lesson.notes, lesson.examInfo, lesson.expected].some((text) => normalize(text).includes(normalize(query))))
    .sort((a, b) => a.date.localeCompare(b.date));
  const legacy = (data.diaries || []).filter((diary) => diary.subject.toLowerCase() === subject.name.toLowerCase());
  const exams = data.exams.filter((exam) => exam.subjectId === subject.id);
  const tasks = data.tasks.filter((task) => task.subjectId === subject.id);
  const materials = data.materials.filter((material) => material.subjectId === subject.id);
  const notes = data["teacher-notes"].filter((note) => note.subjectId === subject.id);
  const themes = [
    ...new Map(
      [
        ...data.lessons.filter((lesson) => lesson.subjectId === subject.id && lesson.theme).map((lesson) => [lesson.theme.toLowerCase(), { title: lesson.theme, source: `Aula de ${formatFull(lesson.date)}`, lesson }]),
        ...exams.flatMap((exam) => exam.topics.map((topic) => [topic.title.toLowerCase(), { title: topic.title, source: `Assunto de ${exam.title}`, status: topic.status }])),
      ],
    ).values(),
  ];
  const openLesson = (lesson) =>
    setModal({ type: "lesson", occurrence: { subject, date: lesson.date, start: lesson.startTime, end: "", room: "", lesson } });

  return (
    <div className="page subject-detail" style={{ "--subject": subject.color }}>
      <button className="link-btn back" onClick={() => go("conteudos")}>
        <ArrowLeft size={15} /> Disciplinas
      </button>
      <header className="detail-head">
        <div>
          <SubjectTag subject={subject} />
          <h1>{subject.name}</h1>
          <p>{subject.professor || "Professor não informado"}, {scheduleText(subject)}</p>
        </div>
        <div className="page-actions">
          <button className="btn ghost" onClick={() => editing.open(subject)}>
            <PenLine size={15} /> Editar disciplina
          </button>
        </div>
      </header>
      <div className="tabs-scroll">
        <Segmented label="Seções da disciplina" value={tab} onChange={setTab} options={tabs} />
      </div>

      {tab === "geral" && (
        <div className="detail-grid">
          <Card title="Informações">
            <dl className="facts">
              <dt>Professor</dt>
              <dd>{subject.professor || "Não informado"}</dd>
              <dt>Horários</dt>
              <dd>{scheduleText(subject)}</dd>
              <dt>Período</dt>
              <dd>
                {subject.startDate || subject.endDate
                  ? `${formatFull(subject.startDate) || "?"} a ${formatFull(subject.endDate) || "?"}`
                  : user.termStart
                    ? "Segue o semestre letivo do perfil"
                    : "Não informado"}
              </dd>
            </dl>
          </Card>
          <Card title="Resumo">
            <dl className="stats">
              <div><dt>Aulas registradas</dt><dd>{data.lessons.filter((lesson) => lesson.subjectId === subject.id && lesson.status === "presente").length}</dd></div>
              <div><dt>Faltas</dt><dd>{data.lessons.filter((lesson) => lesson.subjectId === subject.id && lesson.status === "falta").length}</dd></div>
              <div><dt>Provas</dt><dd>{exams.length}</dd></div>
              <div><dt>Tarefas pendentes</dt><dd>{tasks.filter((task) => !task.done).length}</dd></div>
            </dl>
          </Card>
        </div>
      )}

      {tab === "aulas" && (
        <Card>
          <div className="filters">
            <label className="search-field">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por tema ou palavra" aria-label="Buscar aulas" />
            </label>
            <label className="inline-field">
              A partir de
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
          </div>
          {lessons.length ? (
            <ul className="lesson-list">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <button type="button" onClick={() => openLesson(lesson)}>
                    <span className={`status status-${lesson.status}`}>{lessonStatus[lesson.status].short}</span>
                    <span>
                      <strong>{lesson.theme || "Aula sem tema"}</strong>
                      <small>
                        {formatLong(lesson.date)}
                        {lesson.draft ? ", rascunho" : ""}
                        {lesson.mastery ? `, domínio ${lesson.mastery}/5` : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title={query || from ? "Nenhuma aula encontrada" : "Nenhuma aula registrada"}>
              {query || from ? "Tente outra palavra ou data." : "Registre as aulas em Dias de aula."}
            </Empty>
          )}
          {legacy.length > 0 && (
            <details className="more">
              <summary>Diário da versão anterior ({legacy.length})</summary>
              <ul className="legacy-list">
                {legacy.map((diary) => (
                  <li key={diary.id}>
                    <strong>{formatFull(diary.date)}</strong>
                    <p className="prewrap">{[diary.actual, diary.understood, diary.doubts && `Dúvidas: ${diary.doubts}`, diary.notes].filter(Boolean).join("\n")}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {tab === "conteudos" && (
        <Card title="Temas do semestre">
          {themes.length ? (
            <ul className="topics">
              {themes.map((theme) => (
                <li key={theme.title}>
                  <span>
                    {theme.title}
                    <small>, {theme.source}</small>
                  </span>
                  {theme.lesson ? (
                    <button className="link-btn" onClick={() => openLesson(theme.lesson)}>Abrir aula</button>
                  ) : (
                    <span className="badge">{theme.status}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title="Os temas aparecem aqui">Eles vêm do tema de cada aula registrada e dos assuntos das provas.</Empty>
          )}
        </Card>
      )}

      {tab === "provas" && (
        <Card title="Avaliações" action={<button className="link-btn" onClick={() => setModal({ type: "exam" })}><Plus size={14} /> Nova</button>}>
          {exams.length ? (
            <ul className="link-list">
              {exams.map((exam) => (
                <li key={exam.id}>
                  <button className="link-btn" onClick={() => go("provas", { id: exam.id })}>
                    <GraduationCap size={14} /> {exam.title}, {formatFull(exam.date)}, {countdown(exam.date, today)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nenhuma avaliação desta disciplina.</p>
          )}
        </Card>
      )}

      {tab === "atividades" && (
        <Card title="Trabalhos e atividades" action={<button className="link-btn" onClick={() => setModal({ type: "task" })}><Plus size={14} /> Nova</button>}>
          {tasks.length ? (
            <ul className="task-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <label className="check">
                    <input type="checkbox" checked={task.done} onChange={() => update("tasks", task.id, { done: !task.done }).catch((error) => toast(error.message))} />
                    <span>
                      <strong>{task.title}</strong>
                      <small>{task.kind}, prazo {formatFull(task.dueDate)}</small>
                    </span>
                  </label>
                  <button className="icon-btn" aria-label={`Editar ${task.title}`} onClick={() => setModal({ type: "task", task })}>
                    <PenLine size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nenhuma atividade desta disciplina.</p>
          )}
        </Card>
      )}

      {tab === "materiais" && (
        <Card title="Materiais" action={<button className="link-btn" onClick={() => setModal({ type: "material" })}><Plus size={14} /> Novo</button>}>
          {materials.length ? (
            <ul className="material-list">
              {materials.map((material) => (
                <li key={material.id}>
                  <span className="badge">{material.type}</span>
                  <span>
                    <MaterialLinks material={material} />
                    {material.notes && <small>{material.notes}</small>}
                  </span>
                  <button className="icon-btn" aria-label={`Editar ${material.title}`} onClick={() => setModal({ type: "material", material })}>
                    <PenLine size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nenhum material desta disciplina.</p>
          )}
        </Card>
      )}

      {tab === "professor" && (
        <Card title="Cofre do professor" action={<button className="link-btn" onClick={() => setModal({ type: "note" })}><Plus size={14} /> Nova informação</button>}>
          {notes.length ? (
            <ul className="vault-list">
              {notes.map((note) => (
                <li key={note.id}>
                  <span className={`origin origin-${note.confirmation === "Confirmado pelo professor" ? "prof" : note.confirmation === "Hipótese pessoal" ? "self" : "ai"}`}>{note.confirmation}</span>
                  <p>{note.content}</p>
                  <small>
                    {note.category}
                    {note.informedOn ? `, ${formatFull(note.informedOn)}` : ""}
                    {note.examId ? `, ${data.exams.find((exam) => exam.id === note.examId)?.title || ""}` : ""}
                  </small>
                  <button className="link-btn" onClick={() => setModal({ type: "note", note })}>Editar</button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title="Cofre vazio">
              Guarde aqui o que o professor disse em aula sobre provas, trabalhos e mudanças de planejamento.
            </Empty>
          )}
        </Card>
      )}

      {modal?.type === "lesson" && <LessonForm occurrence={modal.occurrence} onClose={() => setModal(null)} />}
      {modal?.type === "exam" && <ExamForm defaults={{ subjectId: subject.id }} onClose={() => setModal(null)} />}
      {modal?.type === "task" && (
        <TaskForm task={modal.task} defaults={{ subjectId: subject.id }} onClose={() => setModal(null)} onDelete={modal.task && (() => setModal({ type: "confirm", name: "tasks", record: modal.task, label: modal.task.title }))} />
      )}
      {modal?.type === "material" && (
        <MaterialForm material={modal.material} defaults={{ subjectId: subject.id }} onClose={() => setModal(null)} onDelete={modal.material && (() => setModal({ type: "confirm", name: "materials", record: modal.material, label: modal.material.title }))} />
      )}
      {modal?.type === "note" && (
        <NoteForm note={modal.note} defaults={{ subjectId: subject.id }} onClose={() => setModal(null)} onDelete={modal.note && (() => setModal({ type: "confirm", name: "teacher-notes", record: modal.note, label: "esta informação" }))} />
      )}
      {modal?.type === "confirm" && <DeleteRecord {...modal} onClose={() => setModal(null)} />}
      {editing.modal}
    </div>
  );
}

function DeleteRecord({ name, record, label, onClose }) {
  const { remove, toast } = useApp();
  return (
    <Confirm
      title="Excluir registro?"
      message={`Excluir ${label.startsWith("esta") ? label : `“${label}”`} permanentemente?`}
      onConfirm={async () => {
        await remove(name, record.id);
        toast("Registro excluído.");
      }}
      onClose={onClose}
    />
  );
}
