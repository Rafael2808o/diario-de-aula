import { useState } from "react";
import { Link2, Plus, Vault } from "lucide-react";
import { useApp } from "../context.js";
import { formatLong } from "../lib/dates.js";
import { lessonStatus } from "../lib/domain.js";
import { FormError, Modal, Segmented, SubjectTag, useSubmit } from "../ui.jsx";
import { MaterialForm, MaterialLinks, NoteForm } from "./forms.jsx";

// Cria o registro da ocorrência na primeira gravação e atualiza nas seguintes.
export function saveLesson({ create, update }, occurrence, changes) {
  if (occurrence.lesson) return update("lessons", occurrence.lesson.id, changes);
  return create("lessons", { subjectId: occurrence.subject.id, date: occurrence.date, startTime: occurrence.start || "", ...changes });
}

export function LessonForm({ occurrence, onClose }) {
  const app = useApp();
  const lesson = occurrence.lesson;
  const [mode, setMode] = useState(lesson && (lesson.expected || lesson.examInfo || lesson.mastery) ? "completo" : "rapido");
  const [status, setStatus] = useState(lesson?.status && lesson.status !== "pendente" ? lesson.status : "presente");
  const [mastery, setMastery] = useState(lesson?.mastery || 0);
  const [extra, setExtra] = useState(null);
  const [current, setCurrent] = useState(occurrence);
  const { submit, busy, error } = useSubmit(async ({ values, draft }) => {
    const saved = await saveLesson(app, current, { ...values, status, mastery, draft, recovered: values.recovered === "on" });
    setCurrent((previous) => ({ ...previous, lesson: saved }));
    return { saved, draft };
  }, {
    onDone: ({ draft }) => {
      if (!draft) onClose();
    },
    success: undefined,
  });
  const materials = current.lesson ? app.data.materials.filter((material) => material.lessonId === current.lesson.id) : [];
  const notes = current.lesson ? app.data["teacher-notes"].filter((note) => note.lessonId === current.lesson.id) : [];
  const read = (form) => Object.fromEntries(new FormData(form));
  const ensureSaved = async (form) => {
    if (current.lesson) return current.lesson;
    const result = await submit({ values: read(form), draft: true });
    return result?.saved;
  };

  return (
    <Modal title="Registro da aula" onClose={onClose} wide>
      <div className="lesson-head">
        <SubjectTag subject={occurrence.subject} />
        <span>
          {formatLong(occurrence.date)}
          {occurrence.start ? `, ${occurrence.start}${occurrence.end ? `–${occurrence.end}` : ""}` : ""}
          {occurrence.room ? `, ${occurrence.room}` : ""}
        </span>
        {current.lesson?.draft && <span className="badge">Rascunho</span>}
      </div>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit({ values: read(event.currentTarget), draft: false }).then((result) => result && app.toast("Registro da aula salvo."));
        }}
      >
        <fieldset>
          <legend>Situação da aula</legend>
          <Segmented
            label="Situação da aula"
            value={status}
            onChange={setStatus}
            options={["presente", "falta", "cancelada"].map((id) => [id, lessonStatus[id].label])}
          />
        </fieldset>
        <Segmented label="Modo de registro" value={mode} onChange={setMode} options={[["rapido", "Registro rápido"], ["completo", "Registro completo"]]} />
        {status === "cancelada" ? (
          <label>
            Observação (opcional)
            <textarea name="notes" rows={2} defaultValue={lesson?.notes} placeholder="Ex.: Professor avisou que repõe na próxima semana." />
          </label>
        ) : (
          <>
            {mode === "completo" && (
              <label>
                O que era esperado para hoje?
                <textarea name="expected" rows={2} defaultValue={lesson?.expected} />
              </label>
            )}
            <label>
              Tema principal da aula
              <input name="theme" maxLength={180} defaultValue={lesson?.theme} placeholder="Ex.: Modelo de cor CMYK" />
            </label>
            {status === "falta" && (
              <>
                <label>
                  Conteúdo perdido
                  <textarea name="missedContent" rows={3} defaultValue={lesson?.missedContent} placeholder="O que foi dado nesta aula, segundo colegas ou o professor." />
                </label>
                <label className="check">
                  <input type="checkbox" name="recovered" defaultChecked={lesson?.recovered} /> Já recuperei este conteúdo
                </label>
              </>
            )}
            {status === "presente" && (
              <label>
                O que o professor ensinou?
                <textarea name="taught" rows={mode === "completo" ? 6 : 4} defaultValue={lesson?.taught} placeholder="Conceitos, explicações, exemplos e atividades." />
              </label>
            )}
            <label>
              Observações importantes
              <textarea name="notes" rows={3} defaultValue={lesson?.notes} placeholder="Dúvidas, recados e pontos a lembrar." />
            </label>
            {mode === "completo" && (
              <>
                <label>
                  Informações sobre a prova
                  <textarea name="examInfo" rows={3} defaultValue={lesson?.examInfo} placeholder="Formato, assuntos, datas e orientações que o professor comentou." />
                </label>
                <fieldset>
                  <legend>Quanto você entendeu? (sua percepção)</legend>
                  <div className="scale" role="radiogroup" aria-label="Nível de domínio de 1 a 5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        type="button"
                        key={level}
                        role="radio"
                        aria-checked={mastery === level}
                        className={mastery === level ? "active" : ""}
                        onClick={() => setMastery(mastery === level ? 0 : level)}
                      >
                        {level}
                      </button>
                    ))}
                    <small>1 = não entendi, 5 = entendi bem</small>
                  </div>
                </fieldset>
              </>
            )}
          </>
        )}
        <section className="lesson-links">
          <div>
            <strong>Materiais da aula</strong>
            {materials.length ? (
              <ul>
                {materials.map((material) => (
                  <li key={material.id}>
                    <Link2 size={14} />
                    <MaterialLinks material={material} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nenhum material ligado a esta aula.</p>
            )}
            <button
              type="button"
              className="btn ghost small"
              disabled={busy}
              onClick={async (event) => {
                const saved = await ensureSaved(event.currentTarget.form);
                if (saved) setExtra("material");
              }}
            >
              <Plus size={14} /> Adicionar material
            </button>
          </div>
          <div>
            <strong>Cofre do professor</strong>
            {notes.length ? (
              <ul>
                {notes.map((note) => (
                  <li key={note.id}>
                    <Vault size={14} /> {note.content}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Guarde avisos importantes do professor sobre provas e trabalhos.</p>
            )}
            <button
              type="button"
              className="btn ghost small"
              disabled={busy}
              onClick={async (event) => {
                const saved = await ensureSaved(event.currentTarget.form);
                if (saved) setExtra("note");
              }}
            >
              <Plus size={14} /> Guardar informação
            </button>
          </div>
        </section>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={(event) =>
              submit({ values: read(event.currentTarget.form), draft: true }).then((result) => result && app.toast("Rascunho salvo. Continue quando quiser."))
            }
          >
            Salvar rascunho
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Salvando..." : "Concluir registro"}
          </button>
        </div>
      </form>
      {extra === "material" && current.lesson && (
        <MaterialForm defaults={{ subjectId: occurrence.subject.id, lessonId: current.lesson.id }} onClose={() => setExtra(null)} />
      )}
      {extra === "note" && current.lesson && (
        <NoteForm defaults={{ subjectId: occurrence.subject.id, lessonId: current.lesson.id, informedOn: occurrence.date }} onClose={() => setExtra(null)} />
      )}
    </Modal>
  );
}
