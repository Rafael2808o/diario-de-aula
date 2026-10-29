import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, GraduationCap, Home as HomeIcon, Layers, MessagesSquare, Moon as MoonIcon, NotebookPen, NotebookText, ScrollText, Settings as SettingsIcon, Sparkles, Trophy, UserRound, Users, X } from "lucide-react";
import { AppContext, useApp } from "./context.js";
import { readSession, request, storeSession, useAcademicData } from "./lib/api.js";
import { useLocalNotifications } from "./lib/notify.js";
import { useRitual } from "./lib/ritual.js";
import { activeStatuses, useTranscription } from "./lib/transcription.js";
import { useRecorder } from "./lib/recorder.js";
import { progressOf } from "./lib/domain.js";
import { todayIso } from "./lib/dates.js";
import { Avatar, Logo, Nox, ToastProvider, useToast } from "./ui.jsx";
import SearchBox from "./components/SearchBox.jsx";
import Ritual, { RitualButton } from "./components/Ritual.jsx";
import { stageText } from "./components/ai/Transcribe.jsx";
import RecordingBar from "./components/RecordingBar.jsx";
import NotificationBell, { useNotifications } from "./components/NotificationBell.jsx";
import Sky from "./components/Sky.jsx";
import Celebrations, { useCelebrations } from "./components/Celebrate.jsx";
import Auth from "./pages/Auth.jsx";
import Calendar from "./pages/Calendar.jsx";
import Cards from "./pages/Cards.jsx";
import Community from "./pages/Community.jsx";
import Download from "./pages/Download.jsx";
import Exams from "./pages/Exams.jsx";
import History from "./pages/History.jsx";
import Home from "./pages/Home.jsx";
import Lessons from "./pages/Lessons.jsx";
import Moon from "./pages/Moon.jsx";
import Notebook from "./pages/Notebook.jsx";
import Shared from "./pages/Shared.jsx";
import XpHistory from "./pages/XpHistory.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Profile from "./pages/Profile.jsx";
import Ranking from "./pages/Ranking.jsx";
import Settings from "./pages/Settings.jsx";
import StudyAI from "./pages/StudyAI.jsx";
import Subjects from "./pages/Subjects.jsx";

// Cinco seções fixas em todas as telas. Cada seção reúne as páginas que abre (group), para o menu marcar a certa.
const nav = [
  { id: "inicio", label: "Início", title: "Início", icon: HomeIcon, page: Home, group: ["inicio"] },
  { id: "conteudos", label: "Grimório", title: "Meu Grimório", icon: BookOpen, page: Subjects, group: ["conteudos", "aulas", "provas", "caderno"] },
  { id: "ia", label: "Estudar", title: "Estudar", icon: Sparkles, page: StudyAI, group: ["ia", "cartoes", "comunidade", "ranking", "lua", "compartilhadas"] },
  { id: "calendario", label: "Agenda", title: "Agenda", icon: CalendarDays, page: Calendar, group: ["calendario"] },
  { id: "perfil", label: "Perfil", title: "Perfil", icon: UserRound, page: Profile, group: ["perfil", "configuracoes", "historico", "historico-xp"] },
];
// Páginas abertas a partir das seções. Os endereços antigos (?abrir=aulas, provas, cartoes...) continuam valendo.
const extraPages = [
  { id: "aulas", label: "Registro de aulas", title: "Registro de aulas", icon: NotebookPen, page: Lessons },
  { id: "provas", label: "Provas", title: "Provas", icon: GraduationCap, page: Exams },
  { id: "cartoes", label: "Cartas do Saber", title: "Cartas do Saber", icon: Layers, page: Cards },
  { id: "comunidade", label: "Conselho dos Bruxinhos", title: "Conselho dos Bruxinhos", icon: MessagesSquare, page: Community },
  { id: "ranking", label: "Ranking", title: "Ranking dos Bruxinhos", icon: Trophy, page: Ranking },
  { id: "configuracoes", label: "Configurações", title: "Configurações", icon: SettingsIcon, page: Settings },
  { id: "historico", label: "Histórico de estudos", title: "Histórico de estudos", page: History },
  { id: "lua", label: "Fases da Lua", title: "Fases da Lua — seu mood de estudante", icon: MoonIcon, page: Moon },
  { id: "compartilhadas", label: "Atividades compartilhadas", title: "Atividades compartilhadas", icon: Users, page: Shared },
  { id: "historico-xp", label: "Histórico de XP", title: "Histórico de XP", icon: ScrollText, page: XpHistory },
  { id: "caderno", label: "Caderno da aula", title: "Caderno da aula", icon: NotebookText, page: Notebook },
];
const allPages = [...nav, ...extraPages];
const shortcuts = ["aulas", "provas", "cartoes", "lua", "compartilhadas", "comunidade", "ranking", "configuracoes"];
const sectionOf = (page) => nav.find((item) => item.group.includes(page))?.id;
// Endereços das versões anteriores continuam funcionando.
const legacyPages = { central: "inicio", diario: "aulas", prova: "ia", estudos: "calendario", biblioteca: "conteudos", desempenho: "perfil" };

function readLocation() {
  const query = new URLSearchParams(window.location.search);
  const requested = query.get("abrir") || "inicio";
  const page = legacyPages[requested] || (allPages.some((item) => item.id === requested) ? requested : "inicio");
  query.delete("abrir");
  return { page, params: Object.fromEntries(query) };
}

function PwaPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [iosTip, setIosTip] = useState(false);
  // O convite só aparece a partir da segunda visita, para não interromper quem acabou de chegar.
  const [hidden, setHidden] = useState(() => {
    try {
      const visits = Number(localStorage.getItem("lumina.visits") || 0) + 1;
      localStorage.setItem("lumina.visits", String(visits));
      return visits < 2 || localStorage.getItem("lumina.install.hidden") === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    setIosTip(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (hidden || (!installEvent && !iosTip)) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem("lumina.install.hidden", "1");
    } catch {
      // Sem armazenamento, o aviso volta na próxima visita.
    }
  };
  return (
    <aside className="install-card">
      <Nox size={36} />
      <div>
        <strong>Instalar a Grimiau</strong>
        <p>{iosTip && !installEvent ? "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”." : "Use como aplicativo, com acesso rápido e tela cheia."}</p>
        {installEvent && (
          <button className="btn primary small" onClick={async () => { await installEvent.prompt(); setInstallEvent(null); }}>
            Instalar agora
          </button>
        )}
      </div>
      <button className="icon-btn" aria-label="Fechar aviso de instalação" onClick={hide}>
        <X size={15} />
      </button>
    </aside>
  );
}

function NotFound() {
  return (
    <main className="onboarding welcome">
      <Nox size={120} mood="sleepy" />
      <p className="eyebrow">Erro 404</p>
      <h1>Esta página saiu para estudar.</h1>
      <p>O endereço não existe, mas seus registros continuam no lugar certo.</p>
      <a className="btn primary" href="/">Voltar para o Início</a>
    </main>
  );
}

// Aviso discreto no topo enquanto uma transcrição anda em outra página.
function TranscriptionChip() {
  const { transcription, page, params, go } = useApp();
  const job = transcription.job;
  if (!job || (page === "ia" && params.tool === "gravar")) return null;
  if (!activeStatuses.includes(job.status) && job.status !== "pronto" && job.status !== "erro") return null;
  const label = job.status === "pronto" ? "Transcrição pronta: revisar" : job.status === "erro" ? "A transcrição falhou: ver opções" : `${stageText[job.status][0]}…`;
  return (
    <button type="button" className={`transcription-chip status-${job.status}`} onClick={() => go("ia", { tool: "gravar" })}>
      {activeStatuses.includes(job.status) && <span className="pulse" aria-hidden="true" />}
      {label}
    </button>
  );
}

function Shell({ session, setSession }) {
  const toast = useToast();
  const [location, setLocation] = useState(readLocation);
  const expire = useCallback(() => {
    history.replaceState({}, "", "/");
    storeSession(null);
    setSession(null);
  }, [setSession]);
  const academic = useAcademicData(session, expire);
  const ritual = useRitual();
  const transcription = useTranscription(session);
  const recorder = useRecorder();
  const celebrations = useCelebrations();
  const notifications = useNotifications(academic.call, academic.data, celebrations.celebrateRelic);

  // "+N XP" só depois que a API confirmou a mudança (os dados locais mudam só com a resposta).
  const xp = useMemo(() => (academic.status === "ready" ? progressOf(academic.data, todayIso()).xp : null), [academic.status, academic.data]);
  const lastXp = useRef(null);
  useEffect(() => {
    if (xp === null) return;
    if (lastXp.current !== null && xp > lastXp.current) celebrations.celebrateXp(xp - lastXp.current);
    lastXp.current = xp;
  }, [xp, celebrations]);

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const current = allPages.find((item) => item.id === location.page);
  useLocalNotifications(academic.data, session.user);
  useEffect(() => {
    document.title = `${current.title} — Grimiau`;
  }, [current]);

  const go = useCallback((page, params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)]));
    const query = new URLSearchParams(page === "inicio" ? clean : { abrir: page, ...clean }).toString();
    history.pushState({}, "", query ? `/?${query}` : "/");
    setLocation({ page, params: clean });
    window.scrollTo(0, 0);
  }, []);

  const setUser = useCallback(
    (user) =>
      setSession((previous) => {
        const next = { ...previous, user };
        storeSession(next);
        return next;
      }),
    [setSession],
  );

  const signOut = useCallback(async ({ skipServer = false } = {}) => {
    // Com gravação em andamento, confirma antes: o áudio já gravado fica no aparelho, mas a captura para.
    if (recorder.active && !window.confirm("Há uma gravação em andamento. Sair agora para a gravação (o que já foi gravado fica salvo neste aparelho). Sair mesmo assim?")) return;
    if (recorder.active) await recorder.stop();
    // Invalida o token no servidor; a saída local acontece mesmo sem conexão.
    if (!skipServer) await request("/auth/logout", { method: "POST", token: session.token }).catch(() => {});
    history.replaceState({}, "", "/");
    storeSession(null);
    setSession(null);
  }, [session.token, setSession, recorder]);

  const context = useMemo(
    () => ({ ...academic, session, user: session.user, setUser, signOut, go, params: location.params, page: location.page, toast, ritual, transcription, recorder, notifications, celebrations }),
    [academic, session, setUser, signOut, go, location, toast, ritual, transcription, recorder, notifications, celebrations],
  );

  if (!session.user.onboardingDone) {
    return (
      <AppContext.Provider value={context}>
        <Onboarding />
      </AppContext.Provider>
    );
  }

  const Page = current.page;
  const section = sectionOf(location.page);
  const ready = !(academic.status === "loading" && academic.data.subjects.length === 0) && academic.status !== "error";
  return (
    <AppContext.Provider value={context}>
      <div className="shell">
        <Sky />
        <aside className="sidebar" aria-label="Menu principal">
          <button className="brand-mark" onClick={() => go("inicio")} aria-label="Grimiau, ir para o Início">
            <Logo size={40} /> <span>Grimiau</span>
          </button>
          <nav>
            {nav.map(({ id, label, icon: Icon }) => (
              <button key={id} className={section === id ? "active" : ""} aria-current={location.page === id ? "page" : undefined} onClick={() => go(id)}>
                <Icon size={18} aria-hidden="true" /> {label}
              </button>
            ))}
          </nav>
          <nav className="sidebar-shortcuts" aria-label="Atalhos">
            <p>Atalhos</p>
            {shortcuts.map((id) => {
              const { label, icon: Icon } = extraPages.find((item) => item.id === id);
              return (
                <button key={id} className={location.page === id ? "current" : ""} aria-current={location.page === id ? "page" : undefined} onClick={() => go(id)}>
                  <Icon size={16} aria-hidden="true" /> {label}
                </button>
              );
            })}
          </nav>
          <p className="sidebar-note">Conhecimento é magia.</p>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <button className="brand-mark compact" onClick={() => go("inicio")} aria-label="Ir para o Início">
              <Logo size={34} />
            </button>
            <SearchBox />
            <RecordingBar />
            <TranscriptionChip />
            {ready && <RitualButton />}
            <NotificationBell />
            <button className="avatar" onClick={() => go("perfil")} aria-label="Abrir seu perfil">
              <Avatar user={session.user} size={34} />
            </button>
          </header>
          {!ready && academic.status !== "error" ? (
            <div className="page loading" role="status">
              <Nox size={72} mood="sleepy" alive />
              <p>Abrindo seu grimório...</p>
            </div>
          ) : academic.status === "error" ? (
            <div className="page loading" role="alert">
              <Nox size={72} />
              <p>Não foi possível carregar seus dados. Verifique a conexão.</p>
              <button className="btn primary" onClick={academic.load}>Tentar de novo</button>
            </div>
          ) : (
            <main id="conteudo" key={location.page} className="page-enter">
              <Page key={`${location.page}-${location.params.id || ""}-${location.params.lesson || ""}`} />
            </main>
          )}
        </div>
        <nav className="bottom-nav" aria-label="Navegação principal">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={section === id ? "active" : ""} aria-current={location.page === id ? "page" : undefined} onClick={() => go(id)}>
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {ready && <Ritual />}
        <Celebrations state={celebrations} />
        <PwaPrompt />
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);
  if (["/baixar", "/baixar/"].includes(window.location.pathname)) return <Download />;
  if (window.location.pathname !== "/") return <NotFound />;
  return (
    <ToastProvider>
      {session ? (
        <Shell session={session} setSession={setSession} />
      ) : (
        <Auth
          onAuthenticated={(next) => {
            storeSession(next);
            setSession(next);
          }}
        />
      )}
    </ToastProvider>
  );
}
