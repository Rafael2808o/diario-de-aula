import { Plus, Trash2 } from "lucide-react";
import { weekdayNames, weekdays } from "../lib/dates.js";

export const shifts = ["Manhã", "Tarde", "Noite", "Integral"];
export const organizations = ["Por disciplina", "Por prazo", "Por prioridade"];

// Campos controlados do perfil acadêmico; o pai guarda o estado e decide quando salvar.
export function AcademicFields({ value, onChange }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return (
    <>
      <div className="form-row">
        <label>
          Faculdade
          <input value={value.institution} onChange={set("institution")} maxLength={100} placeholder="Nome da instituição" />
        </label>
        <label>
          Curso
          <input value={value.course} onChange={set("course")} maxLength={100} placeholder="Ex.: Design Gráfico" />
        </label>
      </div>
      <div className="form-row">
        <label>
          Semestre ou período atual
          <input value={value.semester} onChange={set("semester")} maxLength={40} placeholder="Ex.: 3º semestre" />
        </label>
        <label>
          Turno
          <select value={value.shift} onChange={set("shift")}>
            <option value="">Não informar</option>
            {shifts.map((shift) => (
              <option key={shift}>{shift}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Semestre letivo</legend>
        <div className="form-row">
          <label>
            Mês de início
            <input type="month" value={value.termStart} onChange={set("termStart")} />
          </label>
          <label>
            Mês de término
            <input type="month" value={value.termEnd} onChange={set("termEnd")} min={value.termStart || undefined} />
          </label>
        </div>
        <p className="hint">As aulas de cada disciplina aparecem no calendário dentro deste período.</p>
      </fieldset>
    </>
  );
}

export function RoutineFields({ value, onChange }) {
  const prefs = value.preferences;
  const setPrefs = (changes) => onChange({ ...value, preferences: { ...prefs, ...changes } });
  const slots = prefs.studySlots || [];
  const setSlot = (index, key, entry) => setPrefs({ studySlots: slots.map((slot, position) => (position === index ? { ...slot, [key]: entry } : slot)) });
  const reminders = prefs.reminders || {};
  return (
    <>
      <label>
        Quantos minutos você costuma ter para estudar por dia?
        <input
          type="number"
          min={0}
          max={720}
          step={5}
          value={prefs.studyMinutes || ""}
          placeholder="Ex.: 60"
          onChange={(event) => setPrefs({ studyMinutes: Number(event.target.value) || 0 })}
        />
      </label>
      <fieldset>
        <legend>Dias e horários em que prefere estudar</legend>
        <div className="slots">
          {slots.map((slot, index) => (
            <div className="slot compact" key={index}>
              <select value={slot.day} onChange={(event) => setSlot(index, "day", event.target.value)} aria-label="Dia">
                {weekdays.map((day, position) => (
                  <option key={day} value={day}>{weekdayNames[position]}</option>
                ))}
              </select>
              <input type="time" value={slot.start} onChange={(event) => setSlot(index, "start", event.target.value)} aria-label="Início" />
              <input type="time" value={slot.end} onChange={(event) => setSlot(index, "end", event.target.value)} aria-label="Fim" />
              <button type="button" className="icon-btn" aria-label="Remover horário" onClick={() => setPrefs({ studySlots: slots.filter((_, position) => position !== index) })}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn ghost small" onClick={() => setPrefs({ studySlots: [...slots, { day: "Seg", start: "20:00", end: "21:00" }] })}>
          <Plus size={15} /> Adicionar horário
        </button>
      </fieldset>
      <fieldset>
        <legend>Avisos no Início</legend>
        {[
          ["classes", "Aulas ainda não registradas"],
          ["exams", "Provas chegando (avisar com duas semanas)"],
          ["study", "Sessões de estudo agendadas"],
        ].map(([key, label]) => (
          <label className="check" key={key}>
            <input type="checkbox" checked={Boolean(reminders[key])} onChange={(event) => setPrefs({ reminders: { ...reminders, [key]: event.target.checked } })} />
            {label}
          </label>
        ))}
        <p className="hint">Os avisos aparecem no Início e, se você ativar em Notificações, também no aparelho.</p>
      </fieldset>
      <label>
        Como prefere organizar seus estudos?
        <select value={prefs.organization || ""} onChange={(event) => setPrefs({ organization: event.target.value })}>
          <option value="">Sem preferência</option>
          {organizations.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    </>
  );
}

export const profileDraft = (user) => ({
  name: user.name,
  institution: user.institution || "",
  course: user.course || "",
  semester: user.semester || "",
  shift: user.shift || "",
  termStart: user.termStart || "",
  termEnd: user.termEnd || "",
  preferences: { studyMinutes: 0, studySlots: [], reminders: { classes: true, exams: true, study: true }, organization: "", ...user.preferences },
});

export function validProfile(draft) {
  if (draft.termStart && draft.termEnd && draft.termStart > draft.termEnd) return "O mês de início precisa vir antes do mês de término.";
  if ((draft.preferences.studySlots || []).some((slot) => slot.start >= slot.end)) return "Nos horários de estudo, o fim precisa ser depois do início.";
  return "";
}
