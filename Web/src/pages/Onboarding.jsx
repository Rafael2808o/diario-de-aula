import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useApp } from "../context.js";
import { accents, applyAppearance, currentAccent, currentTheme, themes } from "../lib/theme.js";
import { FormError, Nox, Segmented, useSubmit } from "../ui.jsx";
import { AcademicFields, RoutineFields, profileDraft, validProfile } from "../components/ProfileFields.jsx";
import { SubjectList, useSubjectEditing } from "./Subjects.jsx";

const steps = ["Conta", "Perfil acadêmico", "Disciplinas", "Rotina"];

export default function Onboarding() {
  const { user, data, call, setUser } = useApp();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(() => profileDraft(user));
  const [theme, setTheme] = useState(currentTheme);
  const [accent, setAccent] = useState(currentAccent);
  const editing = useSubjectEditing();
  const first = user.name.split(" ")[0];
  const { submit, busy, error, setError } = useSubmit((body) => call("/me", { method: "PATCH", body }));

  // Salva o que já foi respondido a cada avanço; nenhuma pergunta é obrigatória.
  const advance = async (next, finished = false) => {
    const problem = validProfile(draft);
    if (problem) return setError(problem);
    const saved = await submit({ ...draft, ...(finished ? { onboardingDone: true } : {}) });
    if (!saved) return;
    setUser(saved);
    if (!finished) setStep(next);
  };

  const progress = Math.min(step, steps.length) / steps.length;

  if (step === 4.5) {
    return (
      <main className="onboarding welcome">
        <Nox size={140} mood="happy" />
        <h1>Tudo pronto, {first}!</h1>
        <p>
          {data.subjects.length
            ? `Suas ${data.subjects.length === 1 ? "aulas de 1 disciplina já estão" : `aulas de ${data.subjects.length} disciplinas já estão`} no calendário. Registre o que acontecer em cada aula e o Lúmina organiza o resto.`
            : "Quando quiser, cadastre suas disciplinas em Conteúdos. Seu calendário se monta a partir delas."}
        </p>
        <FormError>{error}</FormError>
        <button className="btn primary" disabled={busy} onClick={() => advance(null, true)}>
          {busy ? "Abrindo..." : "Ir para o Início"}
        </button>
      </main>
    );
  }

  return (
    <main className="onboarding">
      <header className="onboarding-head">
        <div className="brand-mark">
          <Nox size={36} /> <span>Lúmina</span>
        </div>
        <button className="link-btn" disabled={busy} onClick={() => advance(null, true)}>
          Terminar depois
        </button>
      </header>
      <div className="steps" aria-label={`Etapa ${step + 1} de ${steps.length}`}>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          <span style={{ width: `${(progress + 1 / steps.length) * 100}%` }} />
        </div>
        <ol>
          {steps.map((label, index) => (
            <li key={label} className={index < step ? "done" : index === step ? "current" : ""}>
              {index < step ? <Check size={13} /> : index + 1} {label}
            </li>
          ))}
        </ol>
      </div>

      <section className="onboarding-card">
        <div className="onboarding-intro">
          <Nox size={64} mood={step === 3 ? "happy" : "calm"} />
          <div>
            <h1>
              {step === 1 && `Prazer, ${first}! Onde você estuda?`}
              {step === 2 && "Quais disciplinas você está cursando?"}
              {step === 3 && "Como é a sua rotina de estudos?"}
            </h1>
            <p className="hint">
              {step === 1 && "Essas respostas ajudam a montar seu calendário. Pode pular e completar depois."}
              {step === 2 && "Cadastre nome, cor e horários. Se a mesma matéria tiver mais de uma aula na semana, adicione os dois horários."}
              {step === 3 && "Usamos isso para estimar o tempo até as provas e mostrar avisos úteis."}
            </p>
          </div>
        </div>

        {step === 1 && (
          <div className="form">
            <AcademicFields value={draft} onChange={setDraft} />
          </div>
        )}
        {step === 2 && (
          <div>
            {data.subjects.length > 0 && <SubjectList onEdit={editing.open} />}
            <button className="btn soft" onClick={() => editing.open()}>
              <Plus size={16} /> {data.subjects.length ? "Adicionar outra disciplina" : "Adicionar disciplina"}
            </button>
            {!draft.termStart && <p className="hint">Dica: sem o semestre letivo da etapa anterior, informe as datas de início e fim em cada disciplina.</p>}
          </div>
        )}
        {step === 3 && (
          <div className="form">
            <RoutineFields value={draft} onChange={setDraft} />
            <fieldset>
              <legend>Aparência</legend>
              <Segmented label="Tema" value={theme} options={themes} onChange={(value) => { setTheme(value); applyAppearance(value, accent); }} />
              <div className="swatches">
                {accents.map(([id, label, color]) => (
                  <button key={id} type="button" className={accent === id ? "swatch labeled active" : "swatch labeled"} style={{ "--swatch": color }} aria-pressed={accent === id} onClick={() => { setAccent(id); applyAppearance(theme, id); }}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <FormError>{error}</FormError>
        <div className="form-actions">
          {step > 1 && (
            <button className="btn ghost" disabled={busy} onClick={() => setStep(step - 1)}>
              Voltar
            </button>
          )}
          <span className="spacer" />
          <button className="btn ghost" disabled={busy} onClick={() => (step === 3 ? advance(4.5) : setStep(step + 1))}>
            Pular
          </button>
          <button className="btn primary" disabled={busy} onClick={() => advance(step === 3 ? 4.5 : step + 1)}>
            {busy ? "Salvando..." : step === 3 ? "Concluir" : "Continuar"}
          </button>
        </div>
      </section>
      {editing.modal}
    </main>
  );
}
