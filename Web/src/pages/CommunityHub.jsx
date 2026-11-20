import { useEffect, useState } from "react";
import { CalendarPlus, Camera, ChevronRight, LibraryBig, Megaphone, MessagesSquare, PenLine, ScrollText, Star } from "lucide-react";
import { useApp } from "../context.js";
import { apiBase } from "../lib/api.js";
import Members from "../components/Members.jsx";
import EventsCard from "../components/Eventos.jsx";
import { Avatar, Nox } from "../ui.jsx";

// Comunidade 💜: bruxinhos online, as cinco áreas sociais com ponto de novidade e, embaixo, o que aconteceu
// de mais recente nelas (cartinhas, fotos, resumos e comunicados reais; cada item abre a própria área).
export const communityAreas = [
  { id: "conselho", page: "conselho", icon: ScrollText, title: "Conselho dos Bruxinhos", text: "Sugestões e erros, com acompanhamento.", tone: "gold" },
  { id: "batepapo", page: "batepapo", icon: MessagesSquare, title: "Bate-papo", text: "Cartinhas que ficam 48 horas.", tone: "rose" },
  { id: "comunicados", page: "comunicados", icon: Megaphone, title: "Comunicados Gerais", text: "Avisos e informações importantes.", tone: "lilac" },
  { id: "resumos", page: "resumos", icon: LibraryBig, title: "Resumos Compartilhados", text: "Materiais de outros estudantes.", tone: "sage" },
  { id: "feed", page: "migles", icon: Camera, title: "Feed dos Migles", text: "Fotos que somem em 24 horas.", tone: "sky" },
];

export function useCommunityNews() {
  const { call, user } = useApp();
  const [latest, setLatest] = useState({});
  useEffect(() => {
    let alive = true;
    const load = () => call("/community/summary").then((payload) => alive && setLatest(payload.latest || {})).catch(() => {});
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [call]);
  const seen = user.preferences?.communitySeen || {};
  return Object.fromEntries(communityAreas.map((area) => [area.id, Boolean(latest[area.id] && (!seen[area.id] || latest[area.id] > seen[area.id]))]));
}

const kinds = {
  carta: { label: "Cartinha", page: "batepapo", tone: "rose" },
  foto: { label: "Foto", page: "migles", tone: "sky" },
  resumo: { label: "Resumo", page: "resumos", tone: "sage" },
  comunicado: { label: "Comunicado", page: "comunicados", tone: "lilac" },
};

const ago = (iso) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.round(minutes / 60)} h`;
  return minutes < 2880 ? "ontem" : `há ${Math.round(minutes / 1440)} dias`;
};

function useActivity() {
  const { call } = useApp();
  const [state, setState] = useState({ status: "loading", items: [], notices: [] });
  useEffect(() => {
    let alive = true;
    const safe = (path) => call(path).catch(() => []);
    Promise.all([safe("/batepapo"), safe("/feed"), safe("/resumos"), safe("/comunicados")]).then(([letters, photos, summaries, notices]) => {
      if (!alive) return;
      const list = (value) => (Array.isArray(value) ? value : value?.items || []);
      const items = [
        ...list(letters).map((item) => ({ kind: "carta", id: item.id, author: item.author, createdAt: item.createdAt, title: item.title, text: item.body, paper: item.paper })),
        ...list(photos).map((item) => ({ kind: "foto", id: item.id, author: item.author, createdAt: item.createdAt, text: item.caption, photo: `${apiBase}/feed/${item.id}/foto`, ratio: item.width && item.height ? item.width / item.height : 4 / 3 })),
        ...list(summaries).map((item) => ({ kind: "resumo", id: item.id, author: item.author, createdAt: item.createdAt, title: item.title, text: item.description, tag: item.subject })),
        ...list(notices).map((item) => ({ kind: "comunicado", id: item.id, author: item.author, createdAt: item.createdAt, title: item.title, text: item.body, tag: item.category, important: item.important })),
      ]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 10);
      setState({ status: "ready", items, notices: list(notices).slice(0, 3) });
    });
    return () => {
      alive = false;
    };
  }, [call]);
  return state;
}

function ActivityItem({ item }) {
  const { go } = useApp();
  const kind = kinds[item.kind];
  const withId = item.kind === "resumo" || item.kind === "comunicado";
  return (
    <article className={`hub-post tone-${kind.tone}`}>
      <header>
        <Avatar user={item.author} size={38} />
        <div>
          <strong>{item.author?.name || "Bruxinho"}</strong>
          <small>{ago(item.createdAt)}</small>
        </div>
        <span className="hub-kind">{kind.label}</span>
      </header>
      {item.title && <h3>{item.title}</h3>}
      {item.text && <p className={item.kind === "carta" ? "hub-text letter" : "hub-text"}>{item.text}</p>}
      {item.photo && <img className="hub-photo" src={item.photo} alt={item.text ? `Foto: ${item.text}` : "Foto do Feed dos Migles"} loading="lazy" style={{ aspectRatio: item.ratio }} />}
      <footer>
        {item.tag ? (
          <span className={`hub-tag ${item.important ? "important" : ""}`}>
            {item.important && <Star size={12} aria-hidden="true" />} {item.tag}
          </span>
        ) : (
          <span />
        )}
        <button type="button" className="link-btn" onClick={() => go(kind.page, withId ? { id: item.id } : {})}>
          Abrir {kind.label.toLowerCase()} <ChevronRight size={14} aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}

export default function CommunityHub() {
  const { go, params } = useApp();
  const news = useCommunityNews();
  const activity = useActivity();
  const [creatingEvent, setCreatingEvent] = useState(false);
  // Avisos antigos apontavam para "comunidade" com o id da publicação do Conselho.
  useEffect(() => {
    if (params.id) go("conselho", { id: params.id });
  }, [params.id, go]);

  return (
    <div className="page community-hub hub-v4">
      <header className="page-head with-nox">
        <div>
          <h1>Comunidade 💜</h1>
          <p>Seu universo de conexões, descobertas e compartilhamentos.</p>
          <small className="hub-date">{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).replace(/^./, (letter) => letter.toUpperCase())}</small>
        </div>
        <Nox size={64} mood="happy" alive />
      </header>
      <div className="hub-members">
        <Members />
      </div>
      <ul className="hub-areas">
        {communityAreas.map((area) => {
          const Icon = area.icon;
          return (
            <li key={area.id}>
              <button type="button" className={`hub-area tone-${area.tone}`} onClick={() => go(area.page)}>
                <span className="community-area-icon" aria-hidden="true">
                  <Icon size={19} strokeWidth={1.6} />
                </span>
                <span>
                  <strong>
                    {area.title}
                    {news[area.id] && <span className="news-dot" aria-label="tem novidades" />}
                  </strong>
                  <small>{area.text}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="hub-columns">
        <section className="hub-feed" aria-labelledby="hub-feed-title">
          <div className="hub-compose">
            <p>
              <PenLine size={17} aria-hidden="true" /> O que você quer compartilhar, bruxinho?
            </p>
            <div>
              <button type="button" className="btn ghost small" onClick={() => go("batepapo")}>
                <MessagesSquare size={14} /> Cartinha
              </button>
              <button type="button" className="btn ghost small" onClick={() => go("migles")}>
                <Camera size={14} /> Foto
              </button>
              <button type="button" className="btn ghost small" onClick={() => go("resumos")}>
                <LibraryBig size={14} /> Resumo
              </button>
              <button type="button" className="btn ghost small" onClick={() => setCreatingEvent(true)}>
                <CalendarPlus size={14} /> Evento de estudo
              </button>
            </div>
          </div>
          <h2 id="hub-feed-title" className="section-title">Agora na comunidade</h2>
          {activity.status === "loading" ? (
            <p className="hint" role="status">Carregando...</p>
          ) : activity.items.length ? (
            activity.items.map((item) => <ActivityItem key={`${item.kind}-${item.id}`} item={item} />)
          ) : (
            <p className="hint">Nada novo por aqui ainda. Que tal escrever a primeira cartinha?</p>
          )}
        </section>
        <aside className="hub-side">
          <EventsCard creating={creatingEvent} onCreating={setCreatingEvent} />
          <section className="hub-card">
            <header>
              <h2>Comunicados</h2>
              <button type="button" className="link-btn" onClick={() => go("comunicados")}>
                Ver todos
              </button>
            </header>
            {activity.notices.length ? (
              <ul className="hub-notices">
                {activity.notices.map((notice) => (
                  <li key={notice.id}>
                    <button type="button" onClick={() => go("comunicados", { id: notice.id })}>
                      <span className={notice.important ? "important" : ""}>{notice.category}</span>
                      <strong>{notice.title}</strong>
                      <small>{ago(notice.createdAt)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nenhum comunicado no momento.</p>
            )}
          </section>
          <section className="hub-card hub-council">
            <ScrollText size={20} aria-hidden="true" />
            <h2>Conselho dos Bruxinhos</h2>
            <p>Tem uma ideia para o Grimiau ou achou um erro? Conte e acompanhe a resposta da equipe.</p>
            <button type="button" className="btn primary small" onClick={() => go("conselho")}>
              Abrir o Conselho
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
