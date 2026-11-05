import { useEffect, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useApp } from "../context.js";
import { Avatar } from "../ui.jsx";
import { authorUser, when } from "../lib/social.js";

// Mural de XP: o que a comunidade conquistou (XP, relíquias, níveis), com reações.
// Quem não aparece no Ranking surge como "Um bruxinho". Atualiza sozinho enquanto a tela está aberta.
export default function XpMural() {
  const { call, toast } = useApp();
  const [state, setState] = useState({ status: "loading", items: [], rules: [] });
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      call("/mural")
        .then((payload) => alive && setState({ status: "ready", items: payload.items || [], rules: payload.rules || [] }))
        .catch(() => alive && setState((current) => ({ ...current, status: current.items.length ? "ready" : "error" })));
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 45_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [call]);
  const react = async (item, emoji) => {
    try {
      const next = await call(`/mural/${item.id}/reactions`, { method: "POST", body: { emoji } });
      if (next) setState((current) => ({ ...current, items: current.items.map((other) => (other.id === next.id ? next : other)) }));
    } catch (failure) {
      toast(failure.message);
    }
  };
  const visible = all ? state.items : state.items.slice(0, 6);
  return (
    <section className="xp-mural" aria-labelledby="xp-mural-title">
      <h2 id="xp-mural-title">
        <Sparkles size={16} aria-hidden="true" /> Mural de XP
      </h2>
      {state.status === "loading" ? (
        <p className="quiet">Abrindo o mural...</p>
      ) : state.status === "error" ? (
        <p className="quiet">O mural não abriu agora. Ele tenta de novo sozinho.</p>
      ) : visible.length ? (
        <ul>
          {visible.map((item) => (
            <li key={item.id} className="xp-mural-item">
              <Avatar user={authorUser(item.author)} size={28} />
              <div className="xp-mural-body">
                <p>
                  <strong>{item.mine ? "Você" : item.author?.name || "Um bruxinho"}</strong> {item.text}
                </p>
                <small>{when(item.createdAt)}</small>
                <div className="xp-mural-reactions" role="group" aria-label="Reagir">
                  {item.reactions.map((reaction) => (
                    <button key={reaction.emoji} type="button" className={`reaction ${reaction.reacted ? "active" : ""}`} aria-pressed={reaction.reacted} aria-label={`${reaction.emoji} ${reaction.count}`} onClick={() => react(item, reaction.emoji)}>
                      <span aria-hidden="true">{reaction.emoji}</span> {reaction.count > 0 && <small>{reaction.count}</small>}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet">Ainda não há conquistas no mural. A próxima pode ser sua!</p>
      )}
      {state.items.length > 6 && (
        <button type="button" className="link-btn" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Ver todas (${state.items.length})`}
        </button>
      )}
      {state.rules.length > 0 && (
        <details className="xp-rules">
          <summary>
            Como ganhar XP <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <ul>
            {state.rules.map(([label, xp]) => (
              <li key={label}>
                <span>{label}</span>
                <strong className={xp < 0 ? "is-negative" : ""}>{xp > 0 ? `+${xp}` : xp} XP</strong>
              </li>
            ))}
          </ul>
          <p className="hint">Cada recompensa conta uma vez só: repetir a mesma ação não dá XP de novo.</p>
        </details>
      )}
    </section>
  );
}
