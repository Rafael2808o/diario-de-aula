import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  Library,
  Menu,
  Plus,
  Search,
  Target,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import SpotifyPlayer from "./SpotifyPlayer.jsx";

const nav = [
  { id: "central", label: "Central", icon: Home },
  { id: "estudos", label: "Estudos", icon: BookOpen },
  { id: "diario", label: "Diário de Aula", icon: ClipboardList },
  { id: "prova", label: "Revisão com IA", icon: Target },
  { id: "biblioteca", label: "Biblioteca", icon: Library },
  { id: "desempenho", label: "Desempenho", icon: Trophy },
  { id: "perfil", label: "Perfil", icon: UserRound },
];
const pageTitles = Object.fromEntries(
  nav.map((item) => [item.id, `${item.label} — estuda.`]),
);
const validPages = new Set(nav.map((item) => item.id));
const contactEmail = "rafael.o.silva30@aluno.senai.br";
const subjectColors = [
  "#5e8df7",
  "#aa76eb",
  "#e59675",
  "#df7398",
  "#51aa9a",
  "#728fa3",
];
const subjectsFromRecords = (plans, diaries = []) =>
  [
    ...new Set(
      [...plans, ...diaries].map((record) => record.subject).filter(Boolean),
    ),
  ].map(
    (name, index) => ({
      name,
      color: subjectColors[index % subjectColors.length],
      pending: plans.filter((plan) => plan.subject === name).length,
      entries: diaries.filter((entry) => entry.subject === name).length,
      progress: 0,
    }),
  );
const apiBase =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3333/api/v1" : "/api/v1");
const sessionKey = "estuda.session";
const spotifyKey = "estuda.spotify.playlist";
const readSession = () => {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
};
const initials = (name) =>
  (name || "E")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
const spotifyEmbed = (value) => {
  const match = String(value || "").match(
    /open\.spotify\.com\/(?:embed\/)?(playlist|album|episode|show|track)\/([A-Za-z0-9]+)/,
  );
  return match
    ? `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`
    : null;
};
const readableError = (error, fallback) =>
  error instanceof TypeError || error?.message === "Failed to fetch"
    ? "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
    : error?.message || fallback;
function Progress({ value, color = "#377cf6" }) {
  return (
    <div className="progress">
      <span style={{ width: `${value}%`, background: color }} />
    </div>
  );
}
function SubjectCard({ s, onClick }) {
  return (
    <button className="subject-card" onClick={onClick}>
      <div
        className="subject-art"
        style={{ background: `linear-gradient(135deg, ${s.color}, #e8e3df)` }}
      />
      <div className="subject-copy">
        <strong>{s.name}</strong>
        <small>
          {s.pending}{" "}
          {s.pending === 1 ? "sessão planejada" : "sessões planejadas"}
          {s.entries > 0 && ` · ${s.entries} ${s.entries === 1 ? "aula" : "aulas"}`}
        </small>
        {s.progress > 0 && <Progress value={s.progress} color={s.color} />}
      </div>
      <ChevronRight size={16} />
    </button>
  );
}
function Card({ title, action, onAction, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action &&
            (onAction ? (
              <button className="text-btn" onClick={onAction}>
                {action} <ChevronRight size={14} />
              </button>
            ) : (
              <span className="text-btn">{action}</span>
            ))}
        </div>
      )}
      {children}
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);
  const requestedPage = new URLSearchParams(window.location.search).get(
    "abrir",
  );
  const [page, setPage] = useState(
    validPages.has(requestedPage) ? requestedPage : "central",
  );
  const [menu, setMenu] = useState(false);
  const [plans, setPlans] = useState([]);
  const [diaries, setDiaries] = useState([]);
  const [library, setLibrary] = useState([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [playlist, setPlaylist] = useState(
    () => localStorage.getItem(spotifyKey) || "",
  );
  const unknownPath = window.location.pathname !== "/";
  useEffect(() => {
    document.title = unknownPath
      ? "Página não encontrada — estuda."
      : session
        ? pageTitles[page]
        : "Entrar — estuda.";
  }, [page, session, unknownPath]);
  useEffect(() => {
    const syncPage = () => {
      const next = new URLSearchParams(window.location.search).get("abrir");
      setPage(validPages.has(next) ? next : "central");
    };
    window.addEventListener("popstate", syncPage);
    return () => window.removeEventListener("popstate", syncPage);
  }, []);
  useEffect(() => {
    if (!session?.token) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    Promise.all([
      fetch(`${apiBase}/study-plans`, { headers }),
      fetch(`${apiBase}/materials`, { headers }),
      fetch(`${apiBase}/diaries`, { headers }),
    ])
      .then(async ([plansResponse, materialsResponse, diariesResponse]) => {
        if (
          plansResponse.status === 401 ||
          materialsResponse.status === 401 ||
          diariesResponse.status === 401
        ) {
          throw new Error("SESSION_EXPIRED");
        }
        if (
          !plansResponse.ok ||
          !materialsResponse.ok ||
          !diariesResponse.ok
        )
          throw new Error();
        return Promise.all([
          plansResponse.json(),
          materialsResponse.json(),
          diariesResponse.json(),
        ]);
      })
      .then(([nextPlans, nextMaterials, nextDiaries]) => {
        setPlans(nextPlans);
        setLibrary(nextMaterials);
        setDiaries(nextDiaries);
      })
      .catch((error) => {
        if (error.message === "SESSION_EXPIRED") {
          localStorage.removeItem(sessionKey);
          setSession(null);
          return;
        }
        setFeedback(
          "Não foi possível sincronizar seus dados agora. Verifique a conexão e tente novamente.",
        );
      });
  }, [session?.token]);
  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  const go = (id) => {
    if (!validPages.has(id)) return;
    setPage(id);
    setMenu(false);
    history.pushState({}, "", id === "central" ? "/" : `/?abrir=${id}`);
    window.scrollTo(0, 0);
  };
  const authenticatedFetch = (path, options = {}) =>
    fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        ...options.headers,
      },
    });
  const addPlan = async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const response = await authenticatedFetch("/study-plans", {
        method: "POST",
        body: JSON.stringify({
          subject: form.get("subject"),
          topic: form.get("topic"),
          date: form.get("date"),
          time: form.get("time"),
          priority: form.get("priority"),
        }),
      });
      if (!response.ok) throw new Error();
      const created = await response.json();
      setPlans((current) => [created, ...current]);
      setFeedback("Estudo adicionado ao planejamento.");
      setPlanOpen(false);
    } catch {
      setFeedback("Não foi possível adicionar o estudo. Tente novamente.");
    }
  };
  const completePlan = async (id) => {
    try {
      const response = await authenticatedFetch(`/study-plans/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setPlans((current) => current.filter((plan) => plan.id !== id));
      setFeedback("Estudo concluído. Progresso atualizado.");
    } catch {
      setFeedback("Não foi possível concluir este estudo.");
    }
  };
  const authenticated = (next) => {
    localStorage.setItem(sessionKey, JSON.stringify(next));
    setSession(next);
  };
  const signOut = () => {
    localStorage.removeItem(sessionKey);
    setSession(null);
    setPage("central");
  };
  const filtered = useMemo(
    () =>
      library.filter(
        (m) =>
          m.title.toLowerCase().includes(query.toLowerCase()) ||
          m.type.toLowerCase().includes(query.toLowerCase()) ||
          (m.subject || "").toLowerCase().includes(query.toLowerCase()) ||
          (m.notes || "").toLowerCase().includes(query.toLowerCase()),
      ),
    [library, query],
  );
  if (unknownPath) return <NotFound />;
  if (!session) return <AuthScreen onAuthenticated={authenticated} />;
  const pageProps = {
    go,
    plans,
    diaries,
    setDiaries,
    setPlans,
    completePlan,
    setPlanOpen,
    query,
    setQuery,
    filtered,
    library,
    setLibrary,
    setPlaylist,
    session,
    authenticatedFetch,
  };
  return (
    <div className="shell">
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        className={menu ? "sidebar open" : "sidebar"}
        aria-label="Menu lateral"
      >
        <button
          className="brand"
          aria-label="Ir para a Central"
          onClick={() => go("central")}
        >
          <img src="/icons/favicon-32.png" alt="" /> estuda.
        </button>
        <nav aria-label="Navegação lateral">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <p className="side-note">
          Grandes conquistas também são feitas de pequenos registros.
        </p>
      </aside>
      <main>
        <header className="topbar">
          <button
            aria-label={menu ? "Fechar menu" : "Abrir menu"}
            className="mobile-menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={21} />
          </button>
          <div className="search">
            <Search size={16} />
            <input
              aria-label="Buscar na biblioteca"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => go("biblioteca")}
              placeholder="Buscar na biblioteca..."
            />
          </div>
          <button
            aria-label="Abrir perfil"
            className="avatar"
            onClick={() => go("perfil")}
          >
            {initials(session.user.name)}
          </button>
        </header>
        {feedback && (
          <div className="global-feedback" role="status">
            {feedback}
            <button
              aria-label="Fechar mensagem"
              onClick={() => setFeedback("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {page === "central" && <Central {...pageProps} />}
        {page === "estudos" && <Studies {...pageProps} />}
        {page === "diario" && <Diary {...pageProps} />}
        {page === "prova" && <Exam {...pageProps} />}
        {page === "biblioteca" && <LibraryPage {...pageProps} />}
        {page === "desempenho" && <Performance {...pageProps} />}
        {page === "perfil" && (
          <Profile {...pageProps} onSession={authenticated} signOut={signOut} />
        )}
        <Footer go={go} />
      </main>
      <SpotifyPlayer playlist={playlist} go={go} apiBase={apiBase} />
      <nav className="bottom-nav" aria-label="Navegação principal">
        {nav.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => go(id)}
          >
            <Icon size={19} />
            <span>
              {label
                .replace("Diário de Aula", "Diário")
                .replace("Revisão com IA", "Revisão")}
            </span>
          </button>
        ))}
      </nav>
      <PwaPrompt />
      {planOpen && (
        <Modal title="Planejar estudo" close={() => setPlanOpen(false)}>
          <form className="form" onSubmit={addPlan}>
            <label>
              Disciplina
              <input
                name="subject"
                required
                placeholder="Digite o nome da disciplina"
              />
            </label>
            <label>
              Conteúdo
              <input
                name="topic"
                required
                placeholder="Digite o assunto ou conteúdo"
              />
            </label>
            <div className="form-row">
              <label>
                Data
                <input name="date" type="date" />
              </label>
              <label>
                Horário
                <input name="time" type="time" />
              </label>
            </div>
            <label>
              Prioridade
              <select name="priority" defaultValue="" required>
                <option value="" disabled>
                  Escolha a prioridade
                </option>
                <option>Alta</option>
                <option>Média</option>
                <option>Baixa</option>
              </select>
            </label>
            <button className="primary">Adicionar ao planejamento</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Central({ go, session, plans, diaries }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const personalSubjects = subjectsFromRecords(plans, diaries);
  const next = plans[0];
  const lastDiary = diaries[0];
  const today = new Date();
  const calendarTitle = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(today);
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  const firstWeekday = new Date(
    today.getFullYear(),
    today.getMonth(),
    1,
  ).getDay();
  return (
    <div className="page">
      <div className="hero">
        <span className="hero-kicker">SEU ESPAÇO DE APRENDIZADO</span>
        <p>
          {greeting}, {session.user.name.split(" ")[0]}.
        </p>
        <h1>Transforme cada aula em progresso real.</h1>
        <button onClick={() => go("diario")}>
          Registrar no diário <ChevronRight size={16} />
        </button>
      </div>
      <div className="central-grid">
        <Card
          title="Seu próximo passo"
          action="Abrir estudos"
          onAction={() => go("estudos")}
        >
          <div className="timeline">
            {plans.length ? (
              plans
                .slice(0, 4)
                .map((plan, index) => (
                  <Item
                    key={plan.id}
                    dot={subjectColors[index % subjectColors.length]}
                    text={plan.topic}
                    sub={`${plan.subject} · ${plan.date || "Sem data"}`}
                  />
                ))
            ) : (
              <div className="empty">
                <strong>Planeje sua primeira sessão</strong>
                <p>Escolha uma disciplina e transforme intenção em rotina.</p>
                <button className="secondary" onClick={() => go("estudos")}>
                  Começar agora
                </button>
              </div>
            )}
          </div>
        </Card>
        <Card title="Revisão inteligente">
          <button className="exam-small" onClick={() => go("prova")}>
            ▧{" "}
            <span>
              Gerar questões com IA
              <small>A partir do conteúdo que você informar</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button className="exam-small lavender" onClick={() => go("diario")}>
            ♙{" "}
            <span>
              Registrar uma dúvida<small>Use seu diário como contexto</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </Card>
        <Card
          title={calendarTitle[0].toUpperCase() + calendarTitle.slice(1)}
          className="calendar"
        >
          <div className="week" role="group" aria-label="Dias da semana">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="dates">
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span aria-hidden="true" key={`empty-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              return (
                <span
                  className={day === today.getDate() ? "today" : ""}
                  key={day}
                >
                  {day}
                </span>
              );
            })}
          </div>
        </Card>
        <Card
          title="Continue de onde parou"
          action="Revisão com IA"
          onAction={() => go("prova")}
          className="continue"
        >
          <div className="lesson-thumb" />
          <div>
            <strong>
              {next ? next.topic : "Crie sua primeira revisão ativa"}
            </strong>
            <small>
              {next ? next.subject : "Questões personalizadas com IA"}
            </small>
            <span className="plan-status">
              {next ? "Pronto para começar" : "Crie seu próprio conteúdo"}
            </span>
          </div>
          <em>{next ? "Em foco" : "Novo"}</em>
        </Card>
        <Card
          title="Próxima revisão"
          action={lastDiary ? "Revisar com IA" : "Registrar aula"}
          onAction={() => go(lastDiary ? "prova" : "diario")}
        >
          {lastDiary ? (
            <div className="recommendation">
              <span>BASEADO NO SEU DIÁRIO</span>
              <strong>Retome {lastDiary.subject}.</strong>
              <p>
                {lastDiary.doubts ||
                  lastDiary.understood ||
                  lastDiary.actual ||
                  "Use o registro mais recente como ponto de partida."}
              </p>
            </div>
          ) : (
            <div className="empty">
              <strong>Nenhuma recomendação ainda</strong>
              <p>Registre uma aula para receber um próximo passo contextual.</p>
            </div>
          )}
        </Card>
        <Card
          title="Minhas disciplinas"
          action="Ver todas"
          onAction={() => go("estudos")}
          className="subject-grid"
        >
          {personalSubjects.length ? (
            personalSubjects.map((s) => (
              <SubjectCard key={s.name} s={s} onClick={() => go("estudos")} />
            ))
          ) : (
            <div className="empty subject-empty">
              <strong>Seu espaço ainda está limpo</strong>
              <p>Adicione uma disciplina ao planejar seu primeiro estudo.</p>
              <button className="secondary" onClick={() => go("estudos")}>
                Adicionar disciplina
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
function Item({ dot, text, sub }) {
  return (
    <div className="item">
      <i style={{ background: dot }} />
      <div>
        <strong>{text}</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}
function Studies({ go, plans, diaries, completePlan, setPlanOpen }) {
  const personalSubjects = subjectsFromRecords(plans, diaries);
  return (
    <div className="page narrow">
      <div className="page-title">
        <div>
          <p>Seu caminho de aprendizado</p>
          <h1>Estudos</h1>
        </div>
        <button className="primary" onClick={() => setPlanOpen(true)}>
          <Plus size={17} /> Planejar estudo
        </button>
      </div>
      <div className="study-layout">
        <div>
          {personalSubjects.length ? (
            personalSubjects.map((s) => (
              <SubjectCard key={s.name} s={s} onClick={() => go("prova")} />
            ))
          ) : (
            <div className="empty">
              <strong>Nenhuma disciplina adicionada</strong>
              <p>
                Crie um planejamento com o nome da sua disciplina. Ela aparecerá
                aqui automaticamente.
              </p>
            </div>
          )}
          <button className="add-subject" onClick={() => setPlanOpen(true)}>
            <Plus size={17} /> Adicionar disciplina ao plano
          </button>
        </div>
        <div>
          <Card title="Planejamento desta semana">
            {plans.length ? (
              plans.map((p) => (
                <div className="plan" key={p.id}>
                  <span>{p.date || "Sem data"}</span>
                  <div>
                    <strong>{p.topic}</strong>
                    <small>
                      {p.subject} · Prioridade {p.priority || p.status}
                    </small>
                  </div>
                  <button
                    aria-label={`Concluir ${p.topic}`}
                    onClick={() => completePlan(p.id)}
                  >
                    ✓
                  </button>
                </div>
              ))
            ) : (
              <div className="empty">
                <strong>Nenhum estudo planejado</strong>
                <p>
                  Adicione sua próxima sessão para vê-la em todos os
                  dispositivos.
                </p>
              </div>
            )}
          </Card>
          <Card title="Como organizar">
            <div className="recommendation">
              <span>PASSO A PASSO</span>
              <strong>Uma disciplina, um conteúdo e um horário.</strong>
              <p>
                Ao concluir uma sessão, marque o item. Use o Diário para
                registrar dúvidas e a Revisão com IA para transformar o tema em
                questões.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
function Diary({ go, authenticatedFetch, setDiaries }) {
  const emptyEntry = {
    subject: "",
    date: "",
    planned: "",
    actual: "",
    reached: "",
    understood: "",
    doubts: "",
    notes: "",
    references: "",
  };
  const [entry, setEntry] = useState(emptyEntry);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = (field, value) =>
    setEntry((current) => ({ ...current, [field]: value }));
  const save = async (continueToReview) => {
    if (!entry.subject.trim()) {
      setError("Informe a disciplina antes de salvar o diário.");
      return;
    }
    if (!entry.date) {
      setError("Escolha a data da aula antes de salvar o diário.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await authenticatedFetch("/diaries", {
        method: "PUT",
        body: JSON.stringify(entry),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Não foi possível salvar.");
      }
      const savedEntry = await response.json();
      setEntry(savedEntry);
      setDiaries((current) => [
        savedEntry,
        ...current.filter(
          (item) =>
            !(item.subject === savedEntry.subject && item.date === savedEntry.date),
        ),
      ]);
      setSaved(true);
      if (continueToReview) setTimeout(() => go("prova"), 450);
    } catch (failure) {
      setError(readableError(failure, "Não foi possível salvar."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page diary">
      <div className="page-title">
        <div>
          <p>Registro conectado à sua conta</p>
          <h1>Como foi a aula de hoje?</h1>
          <small>O que você escrever aqui alimenta suas revisões.</small>
        </div>
        <button
          className="primary"
          disabled={saving}
          onClick={() => save(true)}
        >
          {saving ? "Salvando..." : "Salvar e revisar"}
        </button>
      </div>
      {saved && (
        <div className="toast">
          Diário salvo. Ele estará disponível em seus outros dispositivos.
        </div>
      )}
      {error && <div className="ai-error">{error}</div>}
      <div className="diary-meta">
        <label>
          Disciplina
          <input
            value={entry.subject}
            onChange={(event) => change("subject", event.target.value)}
            placeholder="Digite o nome da disciplina"
          />
        </label>
        <label>
          Data
          <input
            type="date"
            value={entry.date}
            onChange={(event) => change("date", event.target.value)}
            required
          />
        </label>
      </div>
      <div className="diary-line">
        <span>Aula</span>
        <div className="line-dot" />
        <section>
          <h2>{entry.subject}</h2>
          <small>Registro pessoal · salvo com segurança</small>
          <DiaryBlock
            title="O que estava previsto"
            value={entry.planned}
            onChange={(value) => change("planned", value)}
            placeholder="Conteúdos previstos para a aula..."
          />
          <DiaryBlock
            title="O que realmente foi dado"
            value={entry.actual}
            onChange={(value) => change("actual", value)}
            placeholder="Conte o que aconteceu durante a aula..."
          />
          <DiaryBlock
            title="Até onde o professor chegou?"
            value={entry.reached}
            onChange={(value) => change("reached", value)}
            placeholder="Registre até onde o conteúdo avançou."
          />
          <DiaryBlock
            title="O que você entendeu"
            value={entry.understood}
            onChange={(value) => change("understood", value)}
            placeholder="Registre suas percepções e aprendizados."
          />
          <DiaryBlock
            title="O que você não entendeu"
            value={entry.doubts}
            onChange={(value) => change("doubts", value)}
            placeholder="Dúvidas que devem virar revisão."
            danger
          />
          <DiaryBlock
            title="Informações importantes"
            value={entry.notes}
            onChange={(value) => change("notes", value)}
            placeholder="Prazos, provas, pesos e avisos."
          />
          <DiaryBlock
            title="Referências"
            value={entry.references}
            onChange={(value) => change("references", value)}
            placeholder="Livros, vídeos, sites e campanhas."
          />
          <button
            className="secondary"
            disabled={saving}
            onClick={() => save(false)}
          >
            Salvar diário
          </button>
        </section>
      </div>
    </div>
  );
}
function DiaryBlock({ title, value, onChange, placeholder, danger }) {
  return (
    <label className={`diary-block ${danger ? "danger" : ""}`}>
      <h3>{title}</h3>
      <textarea
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Exam({ go, session, plans, library }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState({
    subject: "",
    topic: "",
    context: "",
  });
  const generate = async () => {
    if (!review.subject.trim() || !review.topic.trim()) {
      setError("Informe a disciplina e o conteúdo que deseja revisar.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    setQuestions([]);
    try {
      let context = review.context.trim();
      if (!context) {
        const diariesResponse = await fetch(`${apiBase}/diaries`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const diaries = diariesResponse.ok ? await diariesResponse.json() : [];
        const diaryContext = diaries
          .filter((entry) => entry.subject === review.subject)
          .flatMap((entry) => [
            entry.actual,
            entry.reached,
            entry.understood,
            entry.doubts,
            entry.notes,
            entry.references,
          ]);
        const libraryContext = library
          .filter((material) => material.subject === review.subject)
          .flatMap((material) => [material.title, material.notes]);
        context = [...diaryContext, ...libraryContext]
          .filter(Boolean)
          .join("\n")
          .slice(0, 3000);
      }
      const response = await fetch(`${apiBase}/ai/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          subject: review.subject,
          topic: review.topic,
          context,
          quantity: 4,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível criar as questões.");
      setQuestions(data.questions || []);
      setNotice(data.notice || "");
    } catch (err) {
      setError(readableError(err, "Não foi possível criar as questões."));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="page narrow">
      <button className="back" onClick={() => go("central")}>
        ‹ Voltar
      </button>
      <div className="exam-head">
        <p>ESPAÇO DE REVISÃO PERSONALIZADA</p>
        <h1>{review.subject || "O que você quer revisar?"}</h1>
        <span>Use sua própria matéria para criar questões relevantes.</span>
      </div>
      <div className="exam-layout">
        <Card title="Conteúdo da revisão">
          <div className="form review-form">
            <label>
              Disciplina
              <input
                value={review.subject}
                onChange={(event) =>
                  setReview((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
                placeholder="Digite o nome da disciplina"
              />
            </label>
            <label>
              Assunto ou matéria
              <input
                value={review.topic}
                onChange={(event) =>
                  setReview((current) => ({
                    ...current,
                    topic: event.target.value,
                  }))
                }
                placeholder="Digite o assunto ou conteúdo"
              />
            </label>
            <label>
              Anotações para dar contexto à IA
              <textarea
                value={review.context}
                onChange={(event) =>
                  setReview((current) => ({
                    ...current,
                    context: event.target.value,
                  }))
                }
                placeholder="Cole um resumo, tópicos da aula ou suas dúvidas."
              />
              <small className="field-help">
                Se ficar em branco, usamos automaticamente seus registros do
                Diário e materiais da Biblioteca desta disciplina.
              </small>
            </label>
          </div>
        </Card>
        <Card title="Seus conteúdos planejados">
          {plans.length ? (
            plans.slice(0, 5).map((plan, index) => (
              <button
                className="material-row"
                key={plan.id}
                onClick={() =>
                  setReview((current) => ({
                    ...current,
                    subject: plan.subject,
                    topic: plan.topic,
                  }))
                }
              >
                <FileText size={16} />
                <span>
                  {plan.topic}
                  <small>{plan.subject}</small>
                </span>
                <ChevronRight />
              </button>
            ))
          ) : (
            <div className="empty">
              <strong>Nenhum conteúdo planejado</strong>
              <p>
                Você pode preencher a revisão livremente ou criar um plano de
                estudo.
              </p>
              <button className="secondary" onClick={() => go("estudos")}>
                Planejar agora
              </button>
            </div>
          )}
        </Card>
      </div>
      <section className="ai-lab">
        <div>
          <span className="ai-kicker">ESTUDA IA</span>
          <h2>Transforme suas anotações em uma revisão ativa.</h2>
          <p>
            Questões inéditas, feitas a partir do tema que você está estudando —
            com explicação para cada resposta.
          </p>
        </div>
        <button
          className="primary ai-button"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "Criando revisão..." : "Gerar questões com IA"}{" "}
          <CircleHelp size={16} />
        </button>
      </section>
      {notice && <div className="ai-notice">{notice}</div>}
      {error && <div className="ai-error">{error}</div>}
      {questions.length > 0 && (
        <section className="question-set">
          <div className="question-set-head">
            <div>
              <span className="ai-kicker">REVISÃO GERADA</span>
              <h2>Teste sua compreensão</h2>
            </div>
            <span>{questions.length} questões</span>
          </div>
          {questions.map((item, index) => (
            <article className="question" key={`${item.question}-${index}`}>
              <div className="question-number">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div>
                <span className="difficulty">{item.difficulty}</span>
                <h3>{item.question}</h3>
                <div className="options">
                  {item.options.map((option, optionIndex) => {
                    const selected = answers[index] === optionIndex;
                    const checked = answers[index] !== undefined;
                    const right = optionIndex === item.correctIndex;
                    return (
                      <button
                        key={option}
                        onClick={() =>
                          setAnswers((current) => ({
                            ...current,
                            [index]: optionIndex,
                          }))
                        }
                        className={`${selected ? "selected" : ""} ${checked && right ? "right" : ""} ${checked && selected && !right ? "wrong" : ""}`}
                      >
                        <b>{String.fromCharCode(65 + optionIndex)}</b>
                        {option}
                      </button>
                    );
                  })}
                </div>
                {answers[index] !== undefined && (
                  <p className="explanation">
                    <strong>
                      {answers[index] === item.correctIndex
                        ? "Boa!"
                        : "Revise este ponto:"}
                    </strong>{" "}
                    {item.explanation}
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
function LibraryPage({
  query,
  setQuery,
  filtered,
  setLibrary,
  authenticatedFetch,
}) {
  const [filter, setFilter] = useState("Todos");
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const list =
    filter === "Todos" ? filtered : filtered.filter((m) => m.type === filter);
  const addMaterialToLibrary = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const response = await authenticatedFetch("/materials", {
        method: "POST",
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível adicionar o material.");
      setLibrary((current) => [data, ...current]);
      setCreating(false);
      setFeedback("Material adicionado à sua biblioteca.");
    } catch (failure) {
      setError(readableError(failure, "Não foi possível adicionar o material."));
    }
  };
  const deleteMaterial = async () => {
    setError("");
    try {
      const response = await authenticatedFetch(`/materials/${selected.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setLibrary((current) =>
        current.filter((material) => material.id !== selected.id),
      );
      setSelected(null);
      setFeedback("Material removido da biblioteca.");
    } catch {
      setError("Não foi possível remover o material. Tente novamente.");
    }
  };
  return (
    <div className="page narrow">
      <div className="page-title">
        <div>
          <p>Seu acervo de estudo, organizado e pesquisável.</p>
          <h1>Biblioteca</h1>
        </div>
        <button
          className="primary"
          onClick={() => {
            setError("");
            setFeedback("");
            setCreating(true);
          }}
        >
          <Plus size={17} /> Adicionar material
        </button>
      </div>
      {feedback && (
        <div className="toast" role="status">
          {feedback}
        </div>
      )}
      {error && (
        <div className="ai-error" role="alert">
          {error}
        </div>
      )}
      <div className="library-search">
        <Search size={17} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título ou formato..."
        />
      </div>
      <div className="filter-tabs">
        {["Todos", "Slides", "PDF", "Artigo", "Livro", "Link", "Anotação"].map(
          (x) => (
            <button
              onClick={() => setFilter(x)}
              className={filter === x ? "selected" : ""}
              key={x}
            >
              {x}
            </button>
          ),
        )}
      </div>
      <div className="materials">
        {list.map((m) => (
          <button
            className="material"
            key={m.id}
            onClick={() => setSelected(m)}
          >
            <span>
              {m.type === "Link" ? "↗" : m.type === "PDF" ? "▣" : "▤"}
            </span>
            <strong>{m.title}</strong>
            <small>{m.subject || "Sem disciplina"}</small>
            <em>{m.type}</em>
          </button>
        ))}
      </div>
      {!list.length && (
        <div className="empty library-empty">
          <strong>Nenhum material encontrado</strong>
          <p>
            {query || filter !== "Todos"
              ? "Tente outro termo ou filtro."
              : "Adicione um link, PDF, livro ou anotação para começar sua biblioteca."}
          </p>
        </div>
      )}
      {selected && (
        <Modal title={selected.title} close={() => setSelected(null)}>
          <div className="material-detail">
            <span className="material-icon">
              {selected.type === "Link" ? "↗" : "▣"}
            </span>
            <p className="eyebrow">{selected.type}</p>
            <h3>{selected.subject || "Material geral"}</h3>
            <p>{selected.notes || "Sem anotações adicionais."}</p>
            <div className="material-actions">
              {selected.url && (
                <a
                  className="primary"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir material
                </a>
              )}
              <button className="danger-button" onClick={deleteMaterial}>
                Remover
              </button>
            </div>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal title="Adicionar material" close={() => setCreating(false)}>
          <form className="form" onSubmit={addMaterialToLibrary}>
            <label>
              Título
              <input name="title" required placeholder="Nome do material" />
            </label>
            <label>
              Tipo
              <select name="type" defaultValue="" required>
                <option value="" disabled>
                  Escolha o tipo de material
                </option>
                <option>Link</option>
                <option>PDF</option>
                <option>Slides</option>
                <option>Artigo</option>
                <option>Livro</option>
                <option>Anotação</option>
              </select>
            </label>
            <label>
              Disciplina
              <input name="subject" placeholder="Opcional" />
            </label>
            <label>
              Link
              <input name="url" type="url" placeholder="https://..." />
            </label>
            <label>
              Anotações
              <textarea
                name="notes"
                placeholder="Por que este material é importante?"
              />
            </label>
            {error && (
              <div className="ai-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary">Salvar material</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Performance({ plans, diaries }) {
  const personalSubjects = subjectsFromRecords(plans, diaries);
  return (
    <div className="page narrow">
      <div className="page-title">
        <div>
          <p>Acompanhe sua evolução ao longo do semestre.</p>
          <h1>Desempenho</h1>
        </div>
        <span className="performance-period">Dados registrados</span>
      </div>
      <div className="performance-top">
        <Card title="Visão geral">
          <div className="score">
            <b>{plans.length}</b>
            <span>Em foco</span>
          </div>
          <div className="metrics">
            <p>◉ {personalSubjects.length} disciplinas</p>
            <p>✓ {diaries.length} registros no diário</p>
            <p>◷ {plans.length} sessões planejadas</p>
          </div>
        </Card>
        <Card title="Leitura honesta">
          <div className="recommendation">
            <span>HISTÓRICO REAL</span>
            <strong>Seu painel cresce com seus registros.</strong>
            <p>
              Adicione sessões e conclua seu planejamento para construir um
              histórico acadêmico útil.
            </p>
          </div>
        </Card>
      </div>
      <div className="performance-grid">
        <Card title="Desempenho por disciplina">
          {personalSubjects.length ? (
            personalSubjects.map((subject) => (
              <div className="score-row" key={subject.name}>
                <span>{subject.name}</span>
                <i
                  className="subject-score-dot"
                  style={{ background: subject.color }}
                  aria-hidden="true"
                />
                <b>
                  {subject.pending} planejada{subject.pending === 1 ? "" : "s"}
                  {" · "}
                  {subject.entries} aula{subject.entries === 1 ? "" : "s"}
                </b>
              </div>
            ))
          ) : (
            <div className="empty">
              <strong>Nada para medir ainda</strong>
              <p>
                Seu desempenho será formado somente pelos dados que você
                registrar.
              </p>
            </div>
          )}
        </Card>
        <Card title="Próximos passos">
          <div className="recommendation">
            <span>RECOMENDAÇÃO</span>
            <strong>
              {plans[0]?.topic || "Planeje seu primeiro conteúdo"}
            </strong>
            <p>
              {plans[0]
                ? `${plans[0].subject} · ${plans[0].date || "Sem data definida"}`
                : "Defina uma disciplina, conteúdo e horário para começar."}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
function Profile({
  session,
  authenticatedFetch,
  onSession,
  signOut,
  plans,
  setPlaylist,
}) {
  const personalSubjects = subjectsFromRecords(plans);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const saveProfile = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await authenticatedFetch("/me", {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      if (!response.ok) throw new Error("Não foi possível atualizar o perfil.");
      const user = await response.json();
      onSession({ ...session, user });
      setEditing(false);
      setFeedback("Perfil atualizado com sucesso.");
    } catch (failure) {
      setError(readableError(failure, "Não foi possível atualizar o perfil."));
    }
  };
  const savePlaylist = (event) => {
    event.preventDefault();
    setError("");
    const url = spotifyEmbed(new FormData(event.currentTarget).get("playlist"));
    if (!url) {
      setError("Cole um link público válido do Spotify.");
      return;
    }
    localStorage.setItem(spotifyKey, url);
    setPlaylist(url);
    event.currentTarget.reset();
    setFeedback("Playlist atualizada com sucesso.");
  };
  return (
    <div className="page narrow">
      <div className="page-title">
        <div>
          <p>Seu espaço acadêmico</p>
          <h1>Perfil</h1>
        </div>
      </div>
      {feedback && (
        <div className="toast" role="status">
          {feedback}
        </div>
      )}
      {error && (
        <div className="ai-error" role="alert">
          {error}
        </div>
      )}
      <div className="profile-grid">
        <Card title="">
          <div className="profile-person">
            <div className="avatar large">{initials(session.user.name)}</div>
            <div>
              <h2>{session.user.name}</h2>
              <p>
                {session.user.course ||
                  "Defina seu curso para personalizar a experiência"}
              </p>
              <button className="secondary" onClick={() => setEditing(true)}>
                Editar perfil
              </button>
            </div>
          </div>
          <hr />
          <p className="eyebrow">INFORMAÇÕES</p>
          <dl>
            <dt>Instituição</dt>
            <dd>{session.user.institution || "Não informada"}</dd>
            <dt>Semestre</dt>
            <dd>{session.user.semester || "Não informado"}</dd>
            <dt>E-mail</dt>
            <dd>
              <a href={`mailto:${session.user.email}`}>{session.user.email}</a>
            </dd>
          </dl>
        </Card>
        <Card title="Meu curso">
          <h2>{session.user.course || "Seu curso"}</h2>
          <p className="muted">
            {plans.length}{" "}
            {plans.length === 1 ? "sessão planejada" : "sessões planejadas"}
          </p>
          <p className="eyebrow">DISCIPLINAS</p>
          {personalSubjects.slice(0, 5).map((s) => (
            <p className="profile-sub" key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </p>
          ))}
          {!personalSubjects.length && (
            <p className="muted">Adicione uma disciplina em Estudos.</p>
          )}
        </Card>
        <Card title="Configurações">
          <label className="setting">
            Instalável <span>PWA</span>
          </label>
          <label className="setting">
            Dados sincronizados <span>Conta</span>
          </label>
          <button className="signout" onClick={signOut}>
            Sair da conta
          </button>
        </Card>
        <Card title="Foco com Spotify" className="spotify-card">
          <p className="muted">
            O player permanece aberto enquanto você navega pela plataforma. Cole
            um link público de playlist, álbum, faixa, podcast ou episódio para
            personalizar seu foco.
          </p>
          <form className="spotify-form" onSubmit={savePlaylist}>
            <input
              name="playlist"
              required
              placeholder="Cole o link de uma playlist do Spotify"
            />
            <button className="secondary">Usar playlist</button>
          </form>
        </Card>
      </div>
      {editing && (
        <Modal title="Editar perfil" close={() => setEditing(false)}>
          <form className="form" onSubmit={saveProfile}>
            <label>
              Nome
              <input name="name" defaultValue={session.user.name} required />
            </label>
            <label>
              Curso
              <input
                name="course"
                defaultValue={session.user.course}
                placeholder="Digite o nome do seu curso"
              />
            </label>
            <label>
              Instituição
              <input
                name="institution"
                defaultValue={session.user.institution}
              />
            </label>
            <label>
              Semestre
              <input
                name="semester"
                defaultValue={session.user.semester}
                placeholder="Digite seu semestre ou período"
              />
            </label>
            {error && (
              <div className="ai-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary">Salvar perfil</button>
          </form>
        </Modal>
      )}
    </div>
  );
}


function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(
        `${apiBase}/auth/${mode === "register" ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onAuthenticated(payload);
    } catch (failure) {
      setError(readableError(failure, "Não foi possível entrar."));
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="auth-brand" href="/" aria-label="Página inicial estuda.">
          <img src="/icons/icon-192.png" alt="" />
          <span>estuda.</span>
        </a>
        <div>
          <span className="auth-kicker">DO REGISTRO À REVISÃO</span>
          <h1>
            Seu semestre,
            <br />
            com clareza.
          </h1>
          <p>
            Organize aulas, transforme dúvidas em questões e construa uma rotina
            de estudo que realmente acompanha você.
          </p>
          <div className="auth-points">
            <span>
              01 <b>Registre a aula</b>
            </span>
            <span>
              02 <b>Encontre o próximo foco</b>
            </span>
            <span>
              03 <b>Revise com inteligência</b>
            </span>
          </div>
        </div>
        <small>
          © {new Date().getFullYear()} estuda. · Instalável no iPhone, Android e
          computador.
        </small>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <span className="auth-kicker">
            {mode === "register" ? "CRIE SEU ESPAÇO" : "BEM-VINDO DE VOLTA"}
          </span>
          <h2>
            {mode === "register"
              ? "Comece pelo que importa."
              : "Continue de onde parou."}
          </h2>
          <p>
            {mode === "register"
              ? "Sua conta sincroniza seus registros entre todos os dispositivos."
              : "Entre com seus dados para acessar seu semestre."}
          </p>
          <form className="form auth-form" onSubmit={submit}>
            {mode === "register" && (
              <>
                <label>
                  Seu nome
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    placeholder="Como podemos chamar você?"
                  />
                </label>
                <label>
                  Curso
                  <input
                    name="course"
                    placeholder="Digite o nome do seu curso"
                  />
                </label>
              </>
            )}
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="voce@exemplo.com"
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength="8"
                required
                placeholder="Mínimo de 8 caracteres"
              />
            </label>
            {error && (
              <div className="ai-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary auth-submit" disabled={loading}>
              {loading
                ? "Aguarde..."
                : mode === "register"
                  ? "Criar meu espaço"
                  : "Entrar"}
            </button>
          </form>
          <button
            className="auth-switch"
            onClick={() => {
              setError("");
              setMode(mode === "register" ? "login" : "register");
            }}
          >
            {mode === "register"
              ? "Já possui uma conta? Entrar"
              : "Ainda não possui conta? Criar agora"}
          </button>
        </div>
      </section>
    </main>
  );
}

function Footer({ go }) {
  return (
    <footer className="site-footer">
      <button className="footer-brand" onClick={() => go("central")}>
        <img src="/icons/favicon-32.png" alt="" />
        estuda.
      </button>
      <span>© {new Date().getFullYear()} · Seu semestre com clareza.</span>
      <div>
        <a href={`mailto:${contactEmail}`}>Contato</a>
        <a
          href="https://github.com/Rafael2808o/diario-de-aula"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}

function NotFound() {
  return (
    <main className="not-found">
      <a className="not-found-brand" href="/">
        <img src="/icons/icon-192.png" alt="" />
        estuda.
      </a>
      <span>ERRO 404</span>
      <h1>Esta página saiu para estudar.</h1>
      <p>
        O endereço não existe, mas seu espaço acadêmico continua no lugar certo.
      </p>
      <a className="primary" href="/">
        Voltar para o início
      </a>
      <small>© {new Date().getFullYear()} estuda.</small>
    </main>
  );
}

function PwaPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [iosTip, setIosTip] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone;
    setIosTip(isIos && !standalone);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (hidden || (!installEvent && !iosTip)) return null;
  const install = async () => {
    if (installEvent) {
      await installEvent.prompt();
      setInstallEvent(null);
    } else setIosTip(true);
  };
  return (
    <aside className="install-card">
      <button aria-label="Fechar" onClick={() => setHidden(true)}>
        <X size={15} />
      </button>
      <img src="/icons/favicon-32.png" alt="" />
      <div>
        <strong>Instalar estuda.</strong>
        <p>
          {iosTip
            ? "No Safari, toque em Compartilhar e depois “Adicionar à Tela de Início”."
            : "Use como aplicativo, com acesso rápido e tela cheia."}
        </p>
        <button className="install-action" onClick={install}>
          {iosTip ? "Ver instrução" : "Instalar agora"}
        </button>
      </div>
    </aside>
  );
}
function Modal({ title, close, children }) {
  return (
    <div
      className="modal-back"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Fechar janela" onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
