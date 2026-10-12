import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, GraduationCap, Home as HomeIcon, Library, MoreHorizontal, Settings as SettingsIcon, Sparkles, X } from "lucide-react";
import { AppContext } from "./context.js";
import { readSession, request, storeSession, useAcademicData } from "./lib/api.js";
import { useLocalNotifications } from "./lib/notify.js";
import { Nox, ToastProvider, useToast } from "./ui.jsx";
import SearchBox from "./components/SearchBox.jsx";
import Auth from "./pages/Auth.jsx";
import Calendar from "./pages/Calendar.jsx";
import Exams from "./pages/Exams.jsx";
import History from "./pages/History.jsx";
import Home from "./pages/Home.jsx";
import Lessons from "./pages/Lessons.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Settings from "./pages/Settings.jsx";
import StudyAI from "./pages/StudyAI.jsx";
import Subjects from "./pages/Subjects.jsx";

const nav = [
  { id: "inicio", label: "Início", icon: HomeIcon, page: Home },
  { id: "calendario", label: "Calendário", icon: CalendarDays, page: Calendar },
  { id: "provas", label: "Provas", icon: GraduationCap, page: Exams },
  { id: "conteudos", label: "Conteúdos", icon: Library, page: Subjects },
  { id: "aulas", label: "Dias de aula", icon: BookOpen, page: Lessons },
  { id: "ia", label: "Estudar com IA", icon: Sparkles, page: StudyAI },
  { id: "configuracoes", label: "Configurações", icon: SettingsIcon, page: Settings },
];
// Páginas acessíveis por links, fora do menu principal.
const extraPages = [{ id: "historico", label: "Histórico de aprendizagem", page: History }];
const allPages = [...nav, ...extraPages];
const mobileNav = ["inicio", "calendario", "aulas", "provas"];
// Endereços da versão anterior continuam funcionando.
const legacyPages = { central: "inicio", diario: "aulas", prova: "ia", estudos: "calendario", biblioteca: "conteudos", desempenho: "inicio", perfil: "configuracoes" };

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
        <strong>Instalar o Lúmina</strong>
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

function Shell({ session, setSession }) {
  const toast = useToast();
  const [location, setLocation] = useState(readLocation);
  const [more, setMore] = useState(false);
  const expire = useCallback(() => {
    history.replaceState({}, "", "/");
    storeSession(null);
    setSession(null);
  }, [setSession]);
  const academic = useAcademicData(session, expire);

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const current = allPages.find((item) => item.id === location.page);
  useLocalNotifications(academic.data, session.user);
  useEffect(() => {
    document.title = `${current.label} — Lúmina`;
  }, [current]);

  const go = useCallback((page, params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)]));
    const query = new URLSearchParams(page === "inicio" ? clean : { abrir: page, ...clean }).toString();
    history.pushState({}, "", query ? `/?${query}` : "/");
    setLocation({ page, params: clean });
    setMore(false);
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
    // Invalida o token no servidor; a saída local acontece mesmo sem conexão.
    if (!skipServer) await request("/auth/logout", { method: "POST", token: session.token }).catch(() => {});
    history.replaceState({}, "", "/");
    storeSession(null);
    setSession(null);
  }, [session.token, setSession]);

  const context = useMemo(
    () => ({ ...academic, session, user: session.user, setUser, signOut, go, params: location.params, page: location.page, toast }),
    [academic, session, setUser, signOut, go, location, toast],
  );

  if (!session.user.onboardingDone) {
    return (
      <AppContext.Provider value={context}>
        <Onboarding />
      </AppContext.Provider>
    );
  }

  const Page = current.page;
  return (
    <AppContext.Provider value={context}>
      <div className="shell">
        <aside className="sidebar" aria-label="Menu principal">
          <button className="brand-mark" onClick={() => go("inicio")} aria-label="Lúmina, ir para o Início">
            <Nox size={34} /> <span>Lúmina</span>
          </button>
          <nav>
            {nav.map(({ id, label, icon: Icon }) => (
              <button key={id} className={location.page === id ? "active" : ""} aria-current={location.page === id ? "page" : undefined} onClick={() => go(id)}>
                <Icon size={18} aria-hidden="true" /> {label}
              </button>
            ))}
          </nav>
          <p className="sidebar-note">Você registra o semestre. O Lúmina organiza seus estudos.</p>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <button className="brand-mark compact" onClick={() => go("inicio")} aria-label="Ir para o Início">
              <Nox size={30} />
            </button>
            <SearchBox />
            <button className="avatar" onClick={() => go("configuracoes")} aria-label="Abrir configurações da conta">
              {session.user.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </button>
          </header>
          {academic.status === "loading" && academic.data.subjects.length === 0 ? (
            <div className="page loading" role="status">
              <Nox size={72} mood="sleepy" />
              <p>Carregando seus registros...</p>
            </div>
          ) : academic.status === "error" ? (
            <div className="page loading" role="alert">
              <Nox size={72} />
              <p>Não foi possível carregar seus dados. Verifique a conexão.</p>
              <button className="btn primary" onClick={academic.load}>Tentar de novo</button>
            </div>
          ) : (
            <main id="conteudo">
              <Page key={`${location.page}-${location.params.id || ""}`} />
            </main>
          )}
        </div>
        <nav className="bottom-nav" aria-label="Navegação principal">
          {mobileNav.map((id) => {
            const { label, icon: Icon } = nav.find((item) => item.id === id);
            return (
              <button key={id} className={location.page === id ? "active" : ""} aria-current={location.page === id ? "page" : undefined} onClick={() => go(id)}>
                <Icon size={20} aria-hidden="true" />
                <span>{label === "Dias de aula" ? "Aulas" : label}</span>
              </button>
            );
          })}
          <button className={!mobileNav.includes(location.page) ? "active" : ""} aria-expanded={more} onClick={() => setMore(!more)}>
            <MoreHorizontal size={20} aria-hidden="true" />
            <span>Mais</span>
          </button>
        </nav>
        {more && (
          <div className="more-sheet" role="dialog" aria-label="Mais seções">
            <button className="more-backdrop" aria-label="Fechar" onClick={() => setMore(false)} />
            <div className="more-panel">
              {nav
                .filter((item) => !mobileNav.includes(item.id))
                .map(({ id, label, icon: Icon }) => (
                  <button key={id} className={location.page === id ? "active" : ""} onClick={() => go(id)}>
                    <Icon size={19} aria-hidden="true" /> {label}
                  </button>
                ))}
            </div>
          </div>
        )}
        <PwaPrompt />
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);
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
