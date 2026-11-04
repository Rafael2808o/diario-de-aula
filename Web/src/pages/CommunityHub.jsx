import { useEffect, useState } from "react";
import { Camera, ChevronRight, LibraryBig, Megaphone, MessagesSquare, ScrollText } from "lucide-react";
import { useApp } from "../context.js";
import Members from "../components/Members.jsx";

// Comunidade 💜: entrada das cinco áreas sociais, com os bruxinhos online no topo
// e um ponto de novidade quando chegou algo depois da última visita a cada área.
export const communityAreas = [
  { id: "conselho", page: "conselho", icon: ScrollText, title: "Conselho dos Bruxinhos", text: "Tem uma sugestão ou encontrou algum erro? Conte para nós!", tone: "gold" },
  { id: "batepapo", page: "batepapo", icon: MessagesSquare, title: "Bate-papo", text: "Uma cartinha para conversar, compartilhar ideias e conhecer os migles.", tone: "rose" },
  { id: "comunicados", page: "comunicados", icon: Megaphone, title: "Comunicados Gerais", text: "Fique por dentro dos avisos e informações importantes.", tone: "lilac" },
  { id: "resumos", page: "resumos", icon: LibraryBig, title: "Resumos Compartilhados", text: "Compartilhe conhecimento e encontre materiais de outros estudantes.", tone: "sage" },
  { id: "feed", page: "migles", icon: Camera, title: "Feed dos Migles", text: "Fotografias, registros e pequenos momentos da rotina acadêmica.", tone: "sky" },
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

export default function CommunityHub() {
  const { go, params } = useApp();
  const news = useCommunityNews();
  // Avisos antigos apontavam para "comunidade" com o id da publicação do Conselho.
  useEffect(() => {
    if (params.id) go("conselho", { id: params.id });
  }, [params.id, go]);

  return (
    <div className="page community-hub">
      <header className="page-head">
        <div>
          <h1>Comunidade 💜</h1>
          <p>Seu universo de conexões, descobertas e compartilhamentos.</p>
        </div>
      </header>
      <Members />
      <ul className="community-areas">
        {communityAreas.map((area) => {
          const Icon = area.icon;
          return (
            <li key={area.id}>
              <button type="button" className={`community-area tone-${area.tone}`} onClick={() => go(area.page)}>
                <span className="community-area-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <span className="community-area-text">
                  <strong>
                    {area.title}
                    {news[area.id] && <span className="news-dot" aria-label="tem novidades" />}
                  </strong>
                  <small>{area.text}</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="community-area-go" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
