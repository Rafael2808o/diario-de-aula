import { useEffect, useState } from "react";
import { ArchiveRestore, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { fileToBase64, openStoredFile } from "../lib/api.js";
import { formatFull, todayIso, weekdayNames, weekdays } from "../lib/dates.js";
import { nextPaletteColor, subjectPalette } from "../lib/domain.js";
import { Confirm, FormError, Modal, useSubmit } from "../ui.jsx";

export const formValues = (form) => Object.fromEntries(new FormData(form));

export function SubjectSelect({ name = "subjectId", value, onChange, required = false, defaultValue, allowEmpty = !required }) {
  const { data } = useApp();
  return (
    <label>
      Disciplina{required ? "" : " (opcional)"}
      <select name={name} required={required} value={value} defaultValue={value === undefined ? defaultValue || "" : undefined} onChange={onChange}>
        {allowEmpty || !data.subjects.length ? <option value="">{data.subjects.length ? "Nenhuma" : "Cadastre uma disciplina primeiro"}</option> : null}
        {data.subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormActions({ busy, label = "Salvar", onCancel, onDelete, deleteLabel = "Excluir" }) {
  return (
    <div className="form-actions">
      {onDelete && (
        <button type="button" className="btn ghost danger-text" onClick={onDelete} disabled={busy}>
          <Trash2 size={15} /> {deleteLabel}
        </button>
      )}
      <span className="spacer" />
      <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
        Cancelar
      </button>
      <button className="btn primary" disabled={busy}>
        {busy ? "Salvando..." : label}
      </button>
    </div>
  );
}

const emptySlot = () => ({ day: "Seg", start: "19:00", end: "20:40", room: "" });
export const subjectModalities = ["Presencial", "EAD", "Híbrida"];

export function SubjectForm({ subject, onClose, onDelete }) {
  const { data, create, update, user } = useApp();
  const [color, setColor] = useState(subject?.color || nextPaletteColor(data.subjects));
  const [modality, setModality] = useState(subject?.modality || "");
  const [slots, setSlots] = useState(subject?.schedule?.length ? subject.schedule : subject?.modality === "EAD" ? [] : [emptySlot()]);
  const { submit, busy, error, setError } = useSubmit(
    (body) => (subject ? update("subjects", subject.id, body) : create("subjects", body)),
    { success: subject ? "Disciplina atualizada." : "Disciplina cadastrada.", onDone: onClose },
  );
  const setSlot = (index, key, value) => setSlots((current) => current.map((slot, position) => (position === index ? { ...slot, [key]: value } : slot)));
  const termHint =
    user.termStart && user.termEnd
      ? `Sem datas, as aulas seguem o semestre letivo do perfil.`
      : "Informe as datas ou o semestre letivo no perfil para as aulas aparecerem no calendário.";
  return (
    <Modal title={subject ? "Editar disciplina" : "Nova disciplina"} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = formValues(event.currentTarget);
          const invalid = slots.find((slot) => slot.start >= slot.end);
          if (invalid) return setError("O horário de término precisa ser depois do início.");
          submit({ name: values.name, professor: values.professor, color, schedule: slots, startDate: values.startDate, endDate: values.endDate, modality });
        }}
      >
        <div className="form-row">
          <label>
            Nome da disciplina
            <input name="name" required maxLength={100} defaultValue={subject?.name} placeholder="Ex.: Produção Gráfica" />
          </label>
          <label>
            Professor (opcional)
            <input name="professor" maxLength={100} defaultValue={subject?.professor} />
          </label>
        </div>
        <label>
          Modalidade
          <select value={modality} onChange={(event) => setModality(event.target.value)}>
            <option value="">Não informada</option>
            {subjectModalities.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          {modality === "EAD" && <small className="hint">Disciplina EAD pode ficar sem horário fixo: aulas, materiais, atividades e prazos continuam organizados por ela.</small>}
        </label>
        <fieldset>
          <legend>Cor</legend>
          <div className="swatches">
            {subjectPalette.map((option) => (
              <button
                type="button"
                key={option}
                className={color === option ? "swatch active" : "swatch"}
                style={{ "--subject": option }}
                aria-label={`Cor ${option}`}
                aria-pressed={color === option}
                onClick={() => setColor(option)}
              />
            ))}
            <label className="swatch-custom">
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Escolher outra cor" />
              Outra
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Aulas na semana</legend>
          <div className="slots">
            {slots.map((slot, index) => (
              <div className="slot" key={index}>
                <label>
                  <span className="sr-only">Dia</span>
                  <select value={slot.day} onChange={(event) => setSlot(index, "day", event.target.value)} aria-label="Dia da semana">
                    {weekdays.map((day, position) => (
                      <option key={day} value={day}>
                        {weekdayNames[position]}
                      </option>
                    ))}
                  </select>
                </label>
                <input type="time" value={slot.start} required onChange={(event) => setSlot(index, "start", event.target.value)} aria-label="Início" />
                <input type="time" value={slot.end} required onChange={(event) => setSlot(index, "end", event.target.value)} aria-label="Término" />
                <input value={slot.room || ""} maxLength={60} placeholder="Sala (opcional)" onChange={(event) => setSlot(index, "room", event.target.value)} aria-label="Sala ou local" />
                <button type="button" className="icon-btn" aria-label="Remover horário" onClick={() => setSlots((current) => current.filter((_, position) => position !== index))}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn ghost small" onClick={() => setSlots((current) => [...current, { ...emptySlot(), ...(current.at(-1) || {}), room: current.at(-1)?.room || "" }])}>
            <Plus size={15} /> Adicionar horário
          </button>
        </fieldset>
        <div className="form-row">
          <label>
            Início do período
            <input type="date" name="startDate" defaultValue={subject?.startDate} />
          </label>
          <label>
            Fim do período
            <input type="date" name="endDate" defaultValue={subject?.endDate} />
          </label>
        </div>
        <p className="hint">{termHint}</p>
        <FormError>{error}</FormError>
        <FormActions busy={busy} onCancel={onClose} onDelete={onDelete} />
      </form>
    </Modal>
  );
}

const topicsFromText = (text, previous = []) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title) => previous.find((topic) => topic.title === title) || { title, status: "Não iniciado" });

export function ExamForm({ exam, defaults = {}, onClose, onSaved, onDelete }) {
  const { create, update } = useApp();
  const { submit, busy, error } = useSubmit((body) => (exam ? update("exams", exam.id, body) : create("exams", body)), {
    success: exam ? "Avaliação atualizada." : "Avaliação cadastrada.",
    onDone: (saved) => {
      onClose();
      onSaved?.(saved);
    },
  });
  return (
    <Modal title={exam ? "Editar avaliação" : "Nova avaliação"} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = formValues(event.currentTarget);
          submit({ ...values, topics: topicsFromText(values.topics, exam?.topics) });
        }}
      >
        <div className="form-row">
          <SubjectSelect required defaultValue={exam?.subjectId || defaults.subjectId} />
          <label>
            Nome da avaliação
            <input name="title" required maxLength={160} defaultValue={exam?.title} placeholder="Ex.: P1, Seminário" />
          </label>
        </div>
        <div className="form-row three">
          <label>
            Data
            <input type="date" name="date" required defaultValue={exam?.date || defaults.date} />
          </label>
          <label>
            Horário
            <input type="time" name="time" defaultValue={exam?.time} />
          </label>
          <label>
            Local ou sala
            <input name="location" maxLength={100} defaultValue={exam?.location} />
          </label>
        </div>
        <label>
          Assuntos cobrados (um por linha)
          <textarea name="topics" rows={4} defaultValue={exam?.topics.map((topic) => topic.title).join("\n")} placeholder="Só o que o professor confirmou" />
        </label>
        <details className="more" open={Boolean(exam?.instructions || exam?.format)}>
          <summary>Mais detalhes (opcional)</summary>
          <div className="form-row">
            <label>
              Formato
              <input name="format" maxLength={80} defaultValue={exam?.format} placeholder="Ex.: Prova escrita individual" />
            </label>
            <label>
              Situação da preparação
              <select name="prepStatus" defaultValue={exam?.prepStatus || "Não iniciada"}>
                {["Não iniciada", "Em andamento", "Revisão final", "Pronto"].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Quantidade e tipos de questões
            <input name="questionsInfo" maxLength={1000} defaultValue={exam?.questionsInfo} placeholder="Ex.: 10 objetivas e 2 dissertativas" />
          </label>
          <label>
            Instruções do professor
            <textarea name="instructions" rows={3} defaultValue={exam?.instructions} />
          </label>
          <label>
            Materiais de referência
            <textarea name="references" rows={2} defaultValue={exam?.references} />
          </label>
          <label>
            Observações pessoais
            <textarea name="personalNotes" rows={2} defaultValue={exam?.personalNotes} />
          </label>
        </details>
        <FormError>{error}</FormError>
        <FormActions busy={busy} onCancel={onClose} onDelete={onDelete} />
      </form>
    </Modal>
  );
}

export const taskKinds = ["Trabalho", "Atividade", "Entrega", "Lista de exercícios", "Outro"];

export function TaskForm({ task, defaults = {}, onClose, onDelete }) {
  const { create, update } = useApp();
  const { submit, busy, error } = useSubmit((body) => (task ? update("tasks", task.id, body) : create("tasks", body)), {
    success: task ? "Atividade atualizada." : "Atividade cadastrada.",
    onDone: onClose,
  });
  return (
    <Modal title={task ? "Editar atividade" : "Nova atividade"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(formValues(event.currentTarget));
        }}
      >
        <label>
          O que precisa ser feito
          <input name="title" required maxLength={160} defaultValue={task?.title} placeholder="Ex.: Entregar portfólio" />
        </label>
        <div className="form-row">
          <label>
            Tipo
            <select name="kind" defaultValue={task?.kind || "Atividade"}>
              {taskKinds.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <SubjectSelect defaultValue={task?.subjectId || defaults.subjectId} />
        </div>
        <div className="form-row">
          <label>
            Prazo
            <input type="date" name="dueDate" required defaultValue={task?.dueDate || defaults.date || todayIso()} />
          </label>
          <label>
            Horário (opcional)
            <input type="time" name="dueTime" defaultValue={task?.dueTime} />
          </label>
        </div>
        <label>
          Observações
          <textarea name="notes" rows={3} defaultValue={task?.notes} />
        </label>
        <FormError>{error}</FormError>
        <FormActions busy={busy} onCancel={onClose} onDelete={onDelete} />
      </form>
    </Modal>
  );
}

export const reminderOptions = [
  [0, "Sem aviso"],
  [15, "15 minutos antes"],
  [60, "1 hora antes"],
  [1440, "1 dia antes"],
  [4320, "3 dias antes"],
];

export function EventForm({ event, defaults = {}, onClose, onDelete }) {
  const { create, update } = useApp();
  const { submit, busy, error, setError } = useSubmit((body) => (event ? update("events", event.id, body) : create("events", body)), {
    success: event ? "Evento atualizado." : "Evento criado.",
    onDone: onClose,
  });
  return (
    <Modal title={event ? "Editar evento" : "Novo evento"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          const values = formValues(submitEvent.currentTarget);
          if (values.startTime && values.endTime && values.startTime >= values.endTime) return setError("O fim precisa ser depois do início.");
          submit(values);
        }}
      >
        <label>
          Título
          <input name="title" required maxLength={160} defaultValue={event?.title} placeholder="Ex.: Revisar capítulo 3" />
        </label>
        <div className="form-row">
          <label>
            Tipo
            <select name="kind" defaultValue={event?.kind || defaults.kind || "Compromisso"}>
              {["Sessão de estudo", "Compromisso", "Outro"].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <SubjectSelect defaultValue={event?.subjectId || defaults.subjectId} />
        </div>
        <div className="form-row three">
          <label>
            Data
            <input type="date" name="date" required defaultValue={event?.date || defaults.date || todayIso()} />
          </label>
          <label>
            Início
            <input type="time" name="startTime" defaultValue={event?.startTime} />
          </label>
          <label>
            Fim
            <input type="time" name="endTime" defaultValue={event?.endTime} />
          </label>
        </div>
        <label>
          Lembrete
          <select name="reminderMinutes" defaultValue={event?.reminderMinutes || 0}>
            {reminderOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small className="hint">O aviso aparece no Início da Grimiau. Notificações no celular ainda não estão disponíveis.</small>
        </label>
        <label>
          Observações
          <textarea name="notes" rows={2} defaultValue={event?.notes} />
        </label>
        <FormError>{error}</FormError>
        <FormActions busy={busy} onCancel={onClose} onDelete={onDelete} />
      </form>
    </Modal>
  );
}

export const noteCategories = [
  "Formato da prova",
  "Conteúdos cobrados",
  "Data de avaliação",
  "Tipo e quantidade de questões",
  "Orientações para trabalhos",
  "Materiais indicados",
  "Mudanças de planejamento",
  "Outro",
];
export const noteConfirmations = ["Confirmado pelo professor", "Hipótese pessoal", "Sugestão da IA"];

export function NoteForm({ note, defaults = {}, onClose, onDelete }) {
  const { data, create, update } = useApp();
  const [subjectId, setSubjectId] = useState(note?.subjectId || defaults.subjectId || data.subjects[0]?.id || "");
  const { submit, busy, error } = useSubmit((body) => (note ? update("teacher-notes", note.id, body) : create("teacher-notes", body)), {
    success: note ? "Informação atualizada." : "Informação guardada no cofre.",
    onDone: onClose,
  });
  const lessons = data.lessons.filter((lesson) => lesson.subjectId === subjectId).sort((a, b) => b.date.localeCompare(a.date));
  const exams = data.exams.filter((exam) => exam.subjectId === subjectId);
  return (
    <Modal title={note ? "Editar informação do professor" : "Nova informação do professor"} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(formValues(event.currentTarget));
        }}
      >
        <SubjectSelect required value={subjectId} onChange={(event) => setSubjectId(event.target.value)} />
        <label>
          O que foi informado
          <textarea name="content" rows={3} required maxLength={4000} defaultValue={note?.content} placeholder="Ex.: A P1 terá 10 questões objetivas sobre CMYK e retícula." />
        </label>
        <div className="form-row">
          <label>
            Categoria
            <select name="category" defaultValue={note?.category || defaults.category || "Outro"}>
              {noteCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Origem da informação
            <select name="confirmation" defaultValue={note?.confirmation || "Confirmado pelo professor"}>
              {noteConfirmations.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row three">
          <label>
            Informado em
            <input type="date" name="informedOn" defaultValue={note?.informedOn || defaults.informedOn || todayIso()} />
          </label>
          <label>
            Aula relacionada
            <select name="lessonId" defaultValue={note?.lessonId || defaults.lessonId || ""}>
              <option value="">Nenhuma</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {formatFull(lesson.date)} {lesson.theme ? `– ${lesson.theme}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Avaliação relacionada
            <select name="examId" defaultValue={note?.examId || defaults.examId || ""}>
              <option value="">Nenhuma</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <FormError>{error}</FormError>
        <FormActions busy={busy} onCancel={onClose} onDelete={onDelete} />
      </form>
    </Modal>
  );
}

export const materialTypes = ["Link", "PDF", "Slides", "Documento", "Foto", "Áudio", "Artigo", "Livro", "Anotação"];

const maxUpload = 3 * 1024 * 1024;
const kindFromFile = (file) =>
  file.type === "application/pdf" ? "PDF" : file.type.startsWith("image/") ? "Foto" : file.type.startsWith("audio/") ? "Áudio" : /presentation|powerpoint/.test(file.type) ? "Slides" : "Documento";

export function MaterialForm({ material, defaults = {}, onClose, onDelete }) {
  const { data, session, create, update, call, replace, remove, toast } = useApp();
  const uploadId = `upload-${material?.id || "novo"}`;
  const [subjectId, setSubjectId] = useState(material?.subjectId || defaults.subjectId || "");
  const [file, setFile] = useState(null);
  const [type, setType] = useState(material?.type || "Link");
  // Arquivo a excluir (com confirmação) ou a substituir pelo novo envio.
  const [removing, setRemoving] = useState(null);
  const [replacing, setReplacing] = useState(null);
  const attached = material ? data.files.filter((item) => item.materialId === material.id) : [];
  const { submit, busy, error, setError } = useSubmit(
    async (body) => {
      const saved = material ? await update("materials", material.id, body) : await create("materials", body);
      if (file) {
        let uploaded;
        try {
          uploaded = await call("/files", { method: "POST", body: { materialId: saved.id, name: file.name, mime: file.type || "application/octet-stream", data: await fileToBase64(file) } });
        } catch (failure) {
          // O material já foi salvo; avisamos que só o arquivo falhou para a pessoa tentar de novo.
          throw new Error(`O material foi salvo, mas o arquivo não foi enviado: ${failure.message}`);
        }
        // Substituição: o antigo só sai depois que o novo chegou (e vai para a lixeira, não some de vez).
        const old = replacing && attached.find((item) => item.id === replacing);
        replace("files", [uploaded, ...data.files.filter((item) => item.id !== old?.id)]);
        if (old) await call(`/files/${old.id}`, { method: "DELETE" }).catch(() => {});
      }
      return saved;
    },
    { success: material ? "Material atualizado." : "Material adicionado.", onDone: onClose },
  );
  const lessons = data.lessons.filter((lesson) => lesson.subjectId === subjectId);
  return (
    <Modal title={material ? "Editar material" : "Novo material"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = formValues(event.currentTarget);
          delete values.upload;
          if (!values.url && !file && !attached.length && type !== "Anotação" && type !== "Livro") return setError("Anexe um arquivo ou cole um link.");
          submit({ ...values, subject: data.subjects.find((subject) => subject.id === values.subjectId)?.name || material?.subject || "" });
        }}
      >
        <label>
          Título
          <input name="title" required maxLength={180} defaultValue={material?.title || defaults.title} placeholder="Ex.: Slides da aula 4" />
        </label>
        <div className="form-row">
          <label>
            Tipo
            <select name="type" required value={type} onChange={(event) => setType(event.target.value)}>
              {materialTypes.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <SubjectSelect value={subjectId} onChange={(event) => setSubjectId(event.target.value)} />
        </div>
        <label>
          Arquivo
          <input
            id={uploadId}
            type="file"
            name="upload"
            accept="application/pdf,image/*,audio/*,text/plain,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            onChange={(event) => {
              const chosen = event.target.files?.[0] || null;
              setError("");
              if (chosen && chosen.size > maxUpload) {
                event.target.value = "";
                setFile(null);
                return setError("O arquivo precisa ter até 3 MB. Para arquivos maiores, use um link do Drive ou OneDrive.");
              }
              setFile(chosen);
              if (chosen && type === "Link") setType(kindFromFile(chosen));
            }}
          />
          <small className="hint">PDF, foto do quadro, áudio ou documento de até 3 MB. Também dá para usar só o link abaixo.</small>
        </label>
        {attached.length > 0 && (
          <ul className="attached">
            {attached.map((item) => (
              <li key={item.id}>
                <button type="button" className="link-btn" onClick={() => openStoredFile(session.token, item).catch((failure) => setError(failure.message))}>
                  {item.name}
                </button>
                <small>{Math.max(1, Math.round(item.size / 1024))} KB{replacing === item.id ? " · será substituído pelo novo arquivo" : ""}</small>
                <button type="button" className="icon-btn" aria-label={`Substituir arquivo ${item.name}`} title="Substituir por outro arquivo" onClick={() => {
                  setReplacing(item.id);
                  document.getElementById(uploadId)?.click();
                }}>
                  <RefreshCw size={15} />
                </button>
                <button type="button" className="icon-btn" aria-label={`Excluir arquivo ${item.name}`} title="Excluir só este arquivo" onClick={() => setRemoving(item)}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label>
          Link
          <input name="url" type="url" maxLength={1000} defaultValue={material?.url} placeholder="https://" />
        </label>
        <label>
          Aula relacionada
          <select name="lessonId" defaultValue={material?.lessonId || defaults.lessonId || ""}>
            <option value="">Nenhuma (só na disciplina)</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {formatFull(lesson.date)}
                {lesson.startTime ? `, ${lesson.startTime}` : ""} {lesson.theme ? `– ${lesson.theme}` : ""}
              </option>
            ))}
          </select>
          <small className="hint">Enviou na aula ou na data errada? Troque aqui: o material e os arquivos mudam de aula sem precisar enviar de novo.</small>
        </label>
        <input type="hidden" name="examId" value={material?.examId || defaults.examId || ""} />
        <label>
          Anotações
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={material?.notes} />
        </label>
        <FormError>{error}</FormError>
        <FormActions busy={busy} label={file ? (replacing ? "Salvar e substituir" : "Salvar e enviar") : "Salvar"} onCancel={onClose} onDelete={onDelete} deleteLabel="Excluir material" />
        {onDelete && <p className="hint">“Excluir material” apaga o material e os arquivos dele. A aula continua como está.</p>}
      </form>
      {removing && (
        <Confirm
          title="Excluir arquivo"
          message={`“${removing.name}” sai deste material e vai para a lixeira por 30 dias. O material e a aula continuam como estão.`}
          confirmLabel="Excluir arquivo"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await remove("files", removing.id);
            toast("Arquivo excluído. Dá para restaurar pela lixeira em Materiais.");
          }}
        />
      )}
    </Modal>
  );
}

// Mostra o material como link externo e/ou arquivos enviados, abrindo cada um no destino certo.
export function MaterialLinks({ material }) {
  const { data, session, toast } = useApp();
  const files = data.files.filter((file) => file.materialId === material.id);
  return (
    <span className="material-links">
      {material.url && (
        <a href={material.url} target="_blank" rel="noreferrer">
          {material.title}
        </a>
      )}
      {files.map((file) => (
        <button key={file.id} type="button" className="link-btn" onClick={() => openStoredFile(session.token, file).catch((failure) => toast(failure.message))}>
          {material.url || files.length > 1 ? file.name : material.title}
        </button>
      ))}
      {!material.url && !files.length && <span>{material.title}</span>}
    </span>
  );
}

// Arquivos excluídos nos últimos 30 dias, com a opção de restaurar no mesmo material.
export function FileTrash({ onClose }) {
  const { call, data, replace, toast } = useApp();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    call("/files/trash").then(setItems).catch((failure) => setError(failure.message));
  }, [call]);
  const restore = async (file) => {
    try {
      const restored = await call(`/files/${file.id}/restore`, { method: "POST" });
      replace("files", [restored, ...data.files]);
      setItems((list) => list.filter((item) => item.id !== file.id));
      toast(`“${file.name}” voltou para o material.`);
    } catch (failure) {
      setError(failure.message);
    }
  };
  return (
    <Modal title="Lixeira de arquivos" onClose={onClose}>
      <p className="hint">Arquivos excluídos ficam aqui por 30 dias. Depois disso, saem de vez.</p>
      <FormError>{error}</FormError>
      {items === null ? (
        <p className="quiet">Abrindo a lixeira...</p>
      ) : items.length ? (
        <ul className="attached">
          {items.map((file) => {
            const material = data.materials.find((item) => item.id === file.materialId);
            return (
              <li key={file.id}>
                <span>
                  {file.name}
                  <small> · {material ? material.title : "material excluído"} · excluído em {formatFull(file.deletedAt.slice(0, 10))}</small>
                </span>
                <button type="button" className="btn ghost small" disabled={!material} onClick={() => restore(file)}>
                  <ArchiveRestore size={14} /> Restaurar
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="quiet">A lixeira está vazia.</p>
      )}
    </Modal>
  );
}
