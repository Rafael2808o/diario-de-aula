import { useEffect, useState } from "react";
import { Bell, Download, LogOut, Plus, Printer } from "lucide-react";
import { useApp } from "../context.js";
import { applyAppearance, currentTheme, themes } from "../lib/theme.js";
import ProfilePhoto from "../components/ProfilePhoto.jsx";
import { zodiac, useSaveSign } from "../components/Horoscope.jsx";
import { canonicalSpotify } from "../components/Ritual.jsx";
import { AnnouncementHistory } from "../components/Announcements.jsx";
import { disableNotifications, enableNotifications, notificationsEnabled, notificationsSupported } from "../lib/notify.js";
import { lessonStatus, subjectById } from "../lib/domain.js";
import { Empty, FormError, Modal, Segmented, useSubmit } from "../ui.jsx";
import { AcademicFields, RoutineFields, profileDraft, validProfile } from "../components/ProfileFields.jsx";
import { SubjectList, useSubjectEditing } from "./Subjects.jsx";

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// CSV com ponto e vírgula e BOM, que o Excel em português abre com acentos corretos.
function exportCsv(name, rows, columns) {
  const lines = [columns.map(([, label]) => label).join(";"), ...rows.map((row) => columns.map(([key]) => csvCell(typeof key === "function" ? key(row) : row[key])).join(";"))];
  download(`grimiau-${name}.csv`, `﻿${lines.join("\r\n")}`, "text/csv;charset=utf-8");
}

function DeleteAccount({ onClose }) {
  const { call, signOut } = useApp();
  const { submit, busy, error } = useSubmit(async (password) => {
    await call("/me", { method: "DELETE", body: { password } });
    await signOut({ skipServer: true });
  });
  return (
    <Modal title="Excluir conta" onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget).get("password"));
        }}
      >
        <p className="modal-text">
          Isso apaga sua conta e todos os registros: disciplinas, aulas, provas, materiais, arquivos, cartões e simulados. Não há como desfazer. Se quiser guardar uma cópia, exporte seus dados antes.
        </p>
        <label>
          Digite sua senha para confirmar
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn danger" disabled={busy}>
            {busy ? "Excluindo..." : "Excluir conta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Situação das permissões do navegador. Só consulta; nada é pedido sem a pessoa tocar no recurso.
function PermissionList() {
  const [states, setStates] = useState({});
  useEffect(() => {
    let alive = true;
    for (const name of ["microphone", "notifications"]) {
      navigator.permissions
        ?.query({ name })
        .then((status) => alive && setStates((current) => ({ ...current, [name]: status.state })))
        .catch(() => alive && setStates((current) => ({ ...current, [name]: "unknown" })));
    }
    return () => {
      alive = false;
    };
  }, []);
  const label = { granted: "Permitido", denied: "Bloqueado", prompt: "Pergunta ao usar", unknown: "O navegador não informa" };
  return (
    <dl className="group stat-list">
      <div className="row">
        <dt>Microfone (gravar aulas)</dt>
        <dd>{label[states.microphone] || "Verificando..."}</dd>
      </div>
      <div className="row">
        <dt>Notificações</dt>
        <dd>{label[states.notifications] || "Verificando..."}</dd>
      </div>
    </dl>
  );
}

function RankingPrivacy() {
  const { user, setUser, call, go } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const on = user.preferences?.rankingPublic === true;
  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      setUser(await call("/me", { method: "PATCH", body: { preferences: { rankingPublic: !on } } }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel-body settings-text">
      <label className="check switch-row">
        <input type="checkbox" checked={on} disabled={busy} onChange={toggle} />
        <span>
          Aparecer no Ranking dos Bruxinhos
          <small>Mostra só o primeiro nome com a inicial do sobrenome, a foto, o nível, o XP, a sequência e as relíquias. Desligado por padrão.</small>
        </span>
      </label>
      <FormError>{error}</FormError>
      <p className="hint">
        No Conselho dos Bruxinhos aparecem só o nome público e a foto. Seu e-mail nunca é mostrado.{" "}
        <button type="button" className="link-btn" onClick={() => go("ranking")}>
          Ver ranking
        </button>
      </p>
    </div>
  );
}

export default function Settings() {
  const { user, data, setUser, call, signOut, toast, go } = useApp();
  const [draft, setDraft] = useState(() => profileDraft(user));
  const [theme, setTheme] = useState(currentTheme);
  const saveSign = useSaveSign();
  const [spotifyError, setSpotifyError] = useState("");
  const [notify, setNotify] = useState(notificationsEnabled);
  const [notifyError, setNotifyError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const editing = useSubjectEditing();
  const { submit, busy, error, setError } = useSubmit(
    async () => {
      // Signo, playlist e comunicados são salvos em outros pontos; o formulário só envia o que ele edita.
      const { sign: _sign, spotifyUrl: _spotify, announcementSeen: _seen, rankingPublic: _ranking, ...preferences } = draft.preferences;
      const saved = await call("/me", { method: "PATCH", body: { ...draft, preferences } });
      setUser(saved);
      return saved;
    },
    { success: "Configurações salvas." },
  );
  const subjectName = (row) => subjectById(data.subjects, row.subjectId)?.name || "";
  const usedBytes = data.files.reduce((sum, file) => sum + file.size, 0);

  const save = (event) => {
    event.preventDefault();
    const problem = validProfile(draft);
    if (problem) return setError(problem);
    submit();
  };

  const toggleNotify = async () => {
    setNotifyError("");
    if (notify) {
      disableNotifications();
      setNotify(false);
      return;
    }
    try {
      await enableNotifications();
      setNotify(true);
      toast("Notificações ativadas neste aparelho.");
    } catch (failure) {
      setNotifyError(failure.message);
    }
  };

  const exports = [
    ["disciplinas", "Disciplinas", data.subjects, [["name", "Nome"], ["professor", "Professor"], ["color", "Cor"], [(row) => row.schedule.map((slot) => `${slot.day} ${slot.start}-${slot.end} ${slot.room || ""}`.trim()).join(" | "), "Horários"], ["startDate", "Início"], ["endDate", "Fim"]]],
    ["aulas", "Registros de aula", data.lessons, [[subjectName, "Disciplina"], ["date", "Data"], ["startTime", "Horário"], [(row) => lessonStatus[row.status].label, "Situação"], ["theme", "Tema"], ["expected", "Esperado"], ["taught", "O que foi ensinado"], ["notes", "Observações"], ["examInfo", "Informações da prova"], ["mastery", "Domínio (1 a 5)"], ["missedContent", "Conteúdo perdido"], [(row) => (row.recovered ? "Sim" : "Não"), "Recuperado"]]],
    ["provas", "Provas", data.exams, [[subjectName, "Disciplina"], ["title", "Avaliação"], ["date", "Data"], ["time", "Horário"], ["location", "Local"], ["format", "Formato"], [(row) => row.topics.map((topic) => `${topic.title} (${topic.status})`).join("; "), "Assuntos"], ["instructions", "Instruções"], ["prepStatus", "Preparação"]]],
    ["atividades", "Atividades", data.tasks, [[subjectName, "Disciplina"], ["title", "Atividade"], ["kind", "Tipo"], ["dueDate", "Prazo"], [(row) => (row.done ? "Sim" : "Não"), "Concluída"], ["notes", "Observações"]]],
    ["cofre", "Cofre do professor", data["teacher-notes"], [[subjectName, "Disciplina"], ["informedOn", "Data"], ["category", "Categoria"], ["confirmation", "Origem"], ["content", "Informação"]]],
    ["materiais", "Materiais", data.materials, [[(row) => subjectName(row) || row.subject, "Disciplina"], ["title", "Título"], ["type", "Tipo"], ["url", "Link"], ["notes", "Anotações"]]],
    ["eventos", "Eventos", data.events, [[subjectName, "Disciplina"], ["title", "Evento"], ["kind", "Tipo"], ["date", "Data"], ["startTime", "Início"], ["endTime", "Fim"], ["notes", "Observações"]]],
    ["flashcards", "Flashcards", data.flashcards, [[subjectName, "Disciplina"], ["front", "Pergunta"], ["back", "Resposta"], ["level", "Nível"], ["reviews", "Revisões"]]],
    ["sessoes", "Sessões de estudo", data["study-sessions"], [[subjectName, "Disciplina"], ["date", "Data"], ["startTime", "Início"], [(row) => Math.round(row.durationSeconds / 60), "Minutos"]]],
    ["simulados", "Simulados", data["quiz-results"], [[subjectName, "Disciplina"], ["takenOn", "Data"], ["topic", "Assunto"], ["correct", "Acertos"], ["total", "Questões"]]],
  ];

  return (
    <div className="page settings">
      <header className="page-head">
        <h1>Configurações</h1>
      </header>
      <nav className="chip-row settings-index" aria-label="Seções das configurações">
        {[
          ["conta", "Conta"],
          ["notificacoes", "Notificações"],
          ["aparencia", "Aparência"],
          ["privacidade", "Privacidade"],
          ["permissoes", "Permissões"],
          ["gravacao", "Gravação"],
          ["ia-config", "IA"],
          ["sobre", "Sobre o Grimiau"],
        ].map(([id, label]) => (
          <a key={id} className="chip" href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <section id="conta">
        <h2 className="section-title">Foto de perfil</h2>
        <div className="group form-group">
          <ProfilePhoto />
        </div>
      </section>

      <form className="settings-form" onSubmit={save}>
        <section>
          <h2 className="section-title">Dados pessoais</h2>
          <div className="group form-group form">
            <div className="form-row">
              <label>
                Nome
                <input value={draft.name} required maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label>
                E-mail
                <input value={user.email} disabled />
              </label>
            </div>
          </div>
        </section>
        <section>
          <h2 className="section-title">Faculdade, curso e semestre</h2>
          <div className="group form-group form">
            <AcademicFields value={draft} onChange={setDraft} />
          </div>
        </section>
        <section>
          <h2 className="section-title">Rotina, disponibilidade e avisos</h2>
          <div className="group form-group form">
            <RoutineFields value={draft} onChange={setDraft} />
          </div>
        </section>
        <div className="save-bar">
          <FormError>{error}</FormError>
          <button className="btn primary" disabled={busy}>
            {busy ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </form>

      <section>
        <div className="section-head">
          <h2 className="section-title">Disciplinas, horários e cores</h2>
          <button className="link-btn" onClick={() => editing.open()}>
            <Plus size={14} /> Nova disciplina
          </button>
        </div>
        {data.subjects.length ? <SubjectList onEdit={editing.open} /> : <Empty compact title="Nenhuma disciplina cadastrada." />}
      </section>

      <div className="settings-columns">
        <section id="aparencia">
          <h2 className="section-title">Aparência</h2>
          <div className="group form-group form">
            <fieldset>
              <legend>Tema</legend>
              <Segmented
                label="Tema"
                value={theme}
                options={themes}
                onChange={(value) => {
                  setTheme(value);
                  applyAppearance(value);
                }}
              />
            </fieldset>
            <p className="hint">A aparência vale para este aparelho.</p>
          </div>
        </section>

        <section>
          <h2 className="section-title">Signo do horóscopo</h2>
          <div className="group form-group form">
            <label>
              Signo
              <select
                value={user.preferences?.sign || ""}
                onChange={(event) => saveSign(event.target.value).then(() => toast(event.target.value ? "Signo salvo." : "Horóscopo desligado.")).catch((failure) => toast(failure.message))}
              >
                <option value="">Não mostrar horóscopo</option>
                {zodiac.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">Fica salvo na sua conta e vale em todos os aparelhos.</p>
          </div>
        </section>

        <section>
          <h2 className="section-title">Playlist de estudos</h2>
          <form
            className="group form-group form"
            onSubmit={async (event) => {
              event.preventDefault();
              const raw = String(new FormData(event.currentTarget).get("spotify") || "").trim();
              const url = raw ? canonicalSpotify(raw) : "";
              if (raw && !url) return setSpotifyError("Cole o link de uma playlist, álbum, faixa ou podcast do Spotify.");
              setSpotifyError("");
              try {
                setUser(await call("/me", { method: "PATCH", body: { preferences: { spotifyUrl: url } } }));
                toast(url ? "Playlist salva para o Ritual." : "Playlist removida.");
              } catch (failure) {
                setSpotifyError(failure.message);
              }
            }}
          >
            <label>
              Link do Spotify
              <input name="spotify" key={user.preferences?.spotifyUrl || "vazio"} defaultValue={user.preferences?.spotifyUrl || ""} placeholder="https://open.spotify.com/playlist/…" inputMode="url" />
            </label>
            <FormError>{spotifyError}</FormError>
            <div className="form-actions">
              <button className="btn">Salvar playlist</button>
            </div>
            <p className="hint">Aparece no Ritual de Foco. Deixe vazio para remover.</p>
          </form>
        </section>

        <section id="notificacoes">
          <h2 className="section-title">Notificações</h2>
          <div className="group form-group">
            <label className="check switch-row">
              <input type="checkbox" checked={notify} onChange={toggleNotify} disabled={!notificationsSupported() && !window.LUMINA_APP} />
              <span>
                <strong>Notificar neste aparelho</strong>
                <small>Aulas sem registro, provas chegando, prazos e sessões de estudo, conforme os avisos marcados acima.</small>
              </span>
            </label>
            <FormError>{notifyError}</FormError>
            <p className="hint">
              <Bell size={13} aria-hidden="true" /> As notificações chegam enquanto a Grimiau estiver aberta, inclusive minimizado. Com o app fechado, os avisos aparecem no Início quando você voltar. Notificações por e-mail ainda não estão disponíveis. No iPhone, instale a Grimiau na Tela de Início para liberar as notificações.
            </p>
          </div>
        </section>

        <section id="ia-config">
          <h2 className="section-title">Inteligência artificial</h2>
          <div className="group form-group">
            <p>A IA roda no servidor e recebe só os registros da disciplina escolhida, no momento do pedido. A chave nunca passa pelo navegador. Áudios enviados para transcrição não ficam guardados.</p>
          </div>
        </section>

        <section>
          <h2 className="section-title">Arquivos</h2>
          <div className="group form-group">
            <p>
              {data.files.length} {data.files.length === 1 ? "arquivo" : "arquivos"} usando {(usedBytes / 1024 / 1024).toFixed(1)} MB de 60 MB.
            </p>
            <p className="hint">Para liberar espaço, exclua o material correspondente em Conteúdos.</p>
          </div>
        </section>

        <section id="permissoes">
          <h2 className="section-title">Permissões</h2>
          <PermissionList />
        </section>

        <section id="gravacao">
          <h2 className="section-title">Gravação de aulas</h2>
          <div className="panel-body settings-text">
            <p>Só grave com autorização do professor e da instituição; a Grimiau pede essa confirmação antes de cada gravação.</p>
            <p>Cada áudio pode ter até 3 MB (cerca de 15 minutos). Ele é enviado ao Gemini, apagado do servidor quando a transcrição termina e fica neste aparelho só até você salvar ou descartar o resultado.</p>
            <button className="btn small soft" onClick={() => go("ia", { tool: "gravar" })}>
              Gravar uma aula
            </button>
          </div>
        </section>

        <section id="sobre">
          <h2 className="section-title">Novidades da Grimiau</h2>
          <AnnouncementHistory />
        </section>

        <section id="privacidade">
          <h2 className="section-title">Privacidade</h2>
          <RankingPrivacy />
        </section>

        <section>
          <h2 className="section-title">Exportar meus dados</h2>
          <ul className="group">
            {exports.map(([file, label, rows, columns]) => (
              <li key={file} className="row">
                <span className="row-main">
                  <strong>{label}</strong>
                  <small>
                    {rows.length} {rows.length === 1 ? "registro" : "registros"}
                  </small>
                </span>
                <button className="btn small" disabled={!rows.length} onClick={() => exportCsv(file, rows, columns)}>
                  <Download size={14} /> CSV
                </button>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button className="btn small" onClick={() => download("grimiau-dados.json", JSON.stringify({ exportadoEm: new Date().toISOString(), perfil: user, ...data }, null, 2), "application/json")}>
              <Download size={14} /> Tudo em JSON
            </button>
            <button className="btn small" onClick={() => window.print()}>
              <Printer size={14} /> Imprimir ou salvar em PDF
            </button>
          </div>
        </section>

        <section>
          <h2 className="section-title">Segurança e acesso</h2>
          <div className="group form-group">
            <p>Seus registros são privados: só a sua conta acessa. A senha é guardada com hash e cada sessão expira em 30 dias.</p>
            <p className="hint">Para trocar a senha, saia e use “Esqueci minha senha” na tela de entrada.</p>
            <div className="form-actions">
              <button className="btn" onClick={() => signOut().then(() => toast("Você saiu da conta."))}>
                <LogOut size={15} /> Sair da conta
              </button>
              <button className="btn danger-outline" onClick={() => setDeleting(true)}>
                Excluir conta
              </button>
            </div>
          </div>
        </section>
      </div>
      {editing.modal}
      {deleting && <DeleteAccount onClose={() => setDeleting(false)} />}
    </div>
  );
}
