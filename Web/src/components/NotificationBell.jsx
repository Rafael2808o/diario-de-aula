import { useCallback, useEffect, useRef, useState } from "react";
import { Award, Bell, BellRing, CheckCheck, MessagesSquare, Sparkles, Users } from "lucide-react";
import { useApp } from "../context.js";

const icons = { reliquia: Award, nivel: Sparkles, comunidade: MessagesSquare, compartilhada: Users };
const when = (iso) => {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 24 * 60) return `há ${Math.round(minutes / 60)} h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + ", " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

// Avisos da conta, guardados no servidor. Atualiza ao abrir o app, ao voltar para a aba, a cada 2 minutos
// e logo depois de mudanças nos registros (é quando relíquias e níveis novos aparecem).
export function useNotifications(call, data, onRelic) {
  const [state, setState] = useState({ items: [], unread: 0, ready: false });
  const busy = useRef(false);
  const known = useRef(null);
  const relicRef = useRef(onRelic);
  relicRef.current = onRelic;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await call("/notifications");
      // Relíquia nova desde a última consulta desta aba: comemora uma vez.
      if (known.current) {
        const fresh = result.items.filter((item) => item.kind === "reliquia" && !item.read && !known.current.has(item.id));
        if (fresh.length) relicRef.current?.(fresh[0]);
      }
      known.current = new Set(result.items.map((item) => item.id));
      setState({ ...result, ready: true });
    } catch {
      // Sem conexão, o sino mostra o que já tinha.
    } finally {
      busy.current = false;
    }
  }, [call]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), 120_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // Depois de salvar algo, confere de novo (com folga, para juntar várias mudanças seguidas).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(refresh, 2500);
    return () => clearTimeout(timer);
  }, [data, refresh]);

  const markRead = useCallback(
    async (ids) => {
      setState((current) => {
        const items = current.items.map((item) => (!ids || ids.includes(item.id) ? { ...item, read: true } : item));
        return { ...current, items, unread: items.filter((item) => !item.read).length };
      });
      await call("/notifications/read", { method: "POST", body: ids ? { ids } : {} }).catch(() => refresh());
    },
    [call, refresh],
  );

  const archiveRead = useCallback(async () => {
    await call("/notifications/archive", { method: "POST", body: {} });
    setState((current) => ({ ...current, items: current.items.filter((item) => !item.read) }));
  }, [call]);

  return { ...state, refresh, markRead, archiveRead };
}

export default function NotificationBell() {
  const { notifications, go, page } = useApp();
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const box = useRef(null);
  const previous = useRef(notifications.unread);

  // O sino balança uma vez quando chega aviso novo.
  useEffect(() => {
    if (notifications.unread > previous.current) {
      setRing(true);
      const timer = setTimeout(() => setRing(false), 1200);
      previous.current = notifications.unread;
      return () => clearTimeout(timer);
    }
    previous.current = notifications.unread;
    return undefined;
  }, [notifications.unread]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => !box.current?.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const follow = (item) => {
    if (!item.read) notifications.markRead([item.id]);
    setOpen(false);
    if (item.link?.page) go(item.link.page, item.link.params || {});
  };

  // Fases da Lua é um espaço de pausa: o sino não aparece lá.
  if (page === "lua") return null;
  const Icon = notifications.unread ? BellRing : Bell;
  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className={`icon-btn bell-button ${ring ? "is-ringing" : ""}`}
        aria-label={notifications.unread ? `Avisos: ${notifications.unread} não lidos` : "Avisos"}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) notifications.refresh();
        }}
      >
        <Icon size={19} aria-hidden="true" />
        {notifications.unread > 0 && <span className="bell-count">{notifications.unread > 9 ? "9+" : notifications.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Avisos">
          <header>
            <strong>Avisos</strong>
            {notifications.unread > 0 && (
              <button type="button" className="link-btn" onClick={() => notifications.markRead(null)}>
                <CheckCheck size={14} /> Marcar todos como lidos
              </button>
            )}
          </header>
          {notifications.items.length ? (
            <ul>
              {notifications.items.map((item) => {
                const ItemIcon = icons[item.kind] || Bell;
                return (
                  <li key={item.id} className={item.read ? "is-read" : "is-new"}>
                    <button type="button" onClick={() => follow(item)}>
                      <span className={`bell-icon kind-${item.kind}`} aria-hidden="true">
                        <ItemIcon size={15} />
                      </span>
                      <span className="bell-text">
                        <strong>{item.title}</strong>
                        {item.body && <small>{item.body}</small>}
                        <time dateTime={item.createdAt}>{when(item.createdAt)}</time>
                      </span>
                      {!item.read && <span className="bell-dot" aria-label="Não lido" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bell-empty">{notifications.ready ? "Nenhum aviso por aqui. Relíquias novas, comentários nas suas publicações e atividades compartilhadas aparecem neste sino." : "Carregando avisos…"}</p>
          )}
          {notifications.items.some((item) => item.read) && (
            <footer>
              <button type="button" className="link-btn" onClick={() => notifications.archiveRead()}>
                Limpar avisos lidos
              </button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}
