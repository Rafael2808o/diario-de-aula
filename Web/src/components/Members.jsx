import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context.js";
import { lastSeenLabel } from "../lib/presence.js";
import { Avatar } from "../ui.jsx";

// Membros online e ativos recentemente, só no início da Comunidade. Atualiza sozinho a cada 45 s com a aba visível.
export default function Members() {
  const { call, go } = useApp();
  const [state, setState] = useState({ status: "loading", items: [], hidden: false });
  const [now, setNow] = useState(Date.now);
  const load = useCallback(async () => {
    try {
      const result = await call("/community/members");
      setState({ status: "ready", items: result.items, hidden: result.hidden });
      setNow(Date.now());
    } catch {
      setState((current) => ({ ...current, status: current.items.length ? "ready" : "error" }));
    }
  }, [call]);
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 45_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (state.status === "error") return null;
  const online = state.items.filter((item) => item.online).length;
  return (
    <section className="members" aria-labelledby="members-title">
      <div className="members-head">
        <h2 id="members-title" className="section-title">
          Bruxinhos por aqui
        </h2>
        <small>{state.status === "loading" ? "Carregando..." : online ? `${online} online agora` : "Ninguém online agora"}</small>
      </div>
      {state.items.length > 0 && (
        <ul className="members-list">
          {state.items.map((member) => (
            <li key={member.id} className={member.online ? "is-online" : ""}>
              <span className="members-avatar">
                <Avatar user={member} size={44} />
                <span className="presence-dot" aria-hidden="true" />
              </span>
              <strong>{member.me ? `${member.name} (você)` : member.name}</strong>
              <small>{lastSeenLabel(member, now)}</small>
            </li>
          ))}
        </ul>
      )}
      {state.hidden && (
        <p className="hint">
          Seu status está escondido: você não aparece nesta lista.{" "}
          <button type="button" className="link-btn" onClick={() => go("configuracoes")}>
            Mudar nas Configurações
          </button>
        </p>
      )}
    </section>
  );
}
