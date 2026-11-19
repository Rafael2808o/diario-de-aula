import { useCallback, useEffect, useState } from "react";
import { Check, Lock, Sparkles } from "lucide-react";
import { useApp } from "../context.js";
import { readableError } from "../lib/api.js";
import { appColorChoices, applyAppColor, dust, setOwnFrame } from "../lib/shop.js";
import { Avatar, Empty } from "../ui.jsx";

// Loja da Madrugada: molduras e cores, só visual. Pozinho vem do XP ganho depois da abertura da loja;
// o XP em si nunca é gasto (nível e ranking não mudam com compra).

function Coin({ size = 14 }) {
  return <i className="dust-coin" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function useWallet() {
  const { call } = useApp();
  const [state, setState] = useState({ status: "loading", wallet: null, items: [] });
  const load = useCallback(async () => {
    try {
      const result = await call("/loja");
      setState({ status: "ready", ...result });
      return result;
    } catch (error) {
      setState((previous) => ({ ...previous, status: "error", error: readableError(error) }));
      return null;
    }
  }, [call]);
  useEffect(() => {
    load();
  }, [load]);
  return [state, setState, load];
}

function FramePreview({ user, frame, size = 92 }) {
  return (
    <span className={`avatar-frame frame-${frame}`} style={{ width: size, height: size, "--s": `${size}px` }} aria-hidden="true">
      <Avatar user={user} framed={false} size={size} />
    </span>
  );
}

export default function Shop() {
  const { call, user, toast } = useApp();
  const [{ status, wallet, items, error }, setState] = useWallet();
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");

  const act = async (id, path, body, method = "POST", done = "") => {
    setBusy(id);
    setFailure("");
    try {
      const result = await call(path, { method, body });
      setState((previous) => ({ ...previous, wallet: result.wallet }));
      setOwnFrame(user.id, result.wallet.frame);
      applyAppColor(result.wallet.appColor);
      window.dispatchEvent(new CustomEvent("grimiau:pozinho", { detail: result.wallet.balance }));
      if (done) toast(done);
    } catch (problem) {
      setFailure(readableError(problem));
    } finally {
      setBusy("");
    }
  };

  if (status === "loading") return <div className="page shop"><p className="hint" role="status">Abrindo a loja...</p></div>;
  if (status === "error" && !wallet) return <div className="page shop"><Empty title="A loja não abriu agora.">{error}</Empty></div>;

  const frames = items.filter((item) => item.kind === "moldura");
  const pack = items.find((item) => item.kind === "cores");
  const owned = new Set(wallet.owned);
  const equipped = wallet.frame;
  const shownFrame = equipped ? equipped.replace(/^moldura-/, "") : "";

  return (
    <div className="page shop">
      <section className="shop-hero">
        <div>
          <p className="eyebrow">Itens cosméticos</p>
          <h1>Loja da Madrugada</h1>
          <p className="shop-lead">Molduras e cores para deixar o seu grimório com a sua cara. Tudo aqui é visual e não muda nada do que você estuda.</p>
          <div className="shop-balance">
            <Coin size={26} />
            <div>
              <strong>{dust(wallet.balance)}</strong>
              <span>Pozinho Mágico · {owned.size} {owned.size === 1 ? "item" : "itens"} na coleção</span>
            </div>
          </div>
          <details className="shop-rule">
            <summary>Como ganho pozinho?</summary>
            <p>
              Cada ponto de XP que você ganha estudando vira um pozinho: aula registrada, minuto de Ritual, carta revisada, questão certa,
              Perguntados. Comprar não tira XP, então seu nível e o ranking continuam iguais. Se o XP cair (tarefa atrasada ou aula apagada),
              o pozinho cai junto, mas item comprado nunca é tomado de volta.
            </p>
          </details>
        </div>
        <aside className="shop-preview" aria-label="Como você aparece">
          <h2>Como você aparece</h2>
          <div className="shop-preview-main">
            {shownFrame ? <FramePreview user={user} frame={shownFrame} size={104} /> : <Avatar user={user} framed={false} size={104} />}
            <div>
              <strong>{user.name.split(" ")[0]}</strong>
              <span>{shownFrame ? `Moldura ${frames.find((item) => item.id === equipped)?.name || ""} equipada` : "Sem moldura"}</span>
            </div>
          </div>
          <p className="hint">A moldura aparece em toda foto sua: barra de cima, ranking, Feed, salas e perfil.</p>
        </aside>
      </section>

      {failure && <p className="form-error" role="alert">{failure}</p>}

      <section>
        <header className="shop-section-head">
          <h2>Molduras de perfil</h2>
          <p>Cada moldura tem animação própria. Você usa uma por vez.</p>
        </header>
        <div className="shop-grid">
          {frames.map((item) => {
            const has = owned.has(item.id);
            const on = equipped === item.id;
            const missing = item.price - wallet.balance;
            return (
              <article key={item.id} className={`shop-card ${on ? "on" : ""}`}>
                <div className="shop-card-stage">
                  <span className={`shop-tag ${on ? "on" : has ? "have" : ""}`}>{on ? "Equipada" : has ? "Adquirida" : "Disponível"}</span>
                  <FramePreview user={user} frame={item.id.replace(/^moldura-/, "")} />
                </div>
                <div className="shop-card-body">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className="shop-card-foot">
                    <span className="shop-price">
                      <Coin /> {dust(item.price)}
                      {!has && missing > 0 && <small>Faltam {dust(missing)}</small>}
                    </span>
                    {on ? (
                      <button className="btn ghost small" disabled={busy === item.id} onClick={() => act(item.id, "/loja/equipar", { frame: "" }, "PUT", "Moldura guardada.")}>Desequipar</button>
                    ) : has ? (
                      <button className="btn primary small" disabled={busy === item.id} onClick={() => act(item.id, "/loja/equipar", { frame: item.id }, "PUT", "Moldura equipada.")}>Equipar</button>
                    ) : (
                      <button className="btn primary small" disabled={busy === item.id || missing > 0} onClick={() => act(item.id, `/loja/${item.id}/comprar`, undefined, "POST", `${item.name} é sua.`)}>
                        {busy === item.id ? "Comprando..." : "Comprar"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {pack && (
        <section>
          <header className="shop-section-head">
            <h2>Pacote de cores</h2>
            <p>Libera novas cores para o app. Depois de comprar, escolha aqui ou em Configurações › Aparência; vale para todas as telas deste aparelho e dos outros.</p>
          </header>
          <article className="shop-pack">
            <div className="shop-pack-colors">
              {appColorChoices.map(([id, name, hex]) => {
                const usable = !id || owned.has(pack.id);
                const on = (wallet.appColor || "") === id;
                return (
                  <button
                    key={id || "padrao"}
                    className={`shop-swatch ${on ? "on" : ""}`}
                    style={{ "--c": hex }}
                    disabled={!usable || busy === "cor"}
                    aria-pressed={on}
                    onClick={() => act("cor", "/loja/equipar", { appColor: id }, "PUT", `Cor ${name} aplicada.`)}
                  >
                    <i>{on ? <Check size={16} /> : !usable ? <Lock size={14} /> : null}</i>
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="shop-pack-info">
              <h3>{pack.name}</h3>
              <p>{pack.description}</p>
              {owned.has(pack.id) ? (
                <p className="shop-owned"><Check size={15} /> Na sua coleção. Toque numa cor para usar.</p>
              ) : (
                <>
                  <span className="shop-price"><Coin /> {dust(pack.price)}{pack.price > wallet.balance && <small>Faltam {dust(pack.price - wallet.balance)}</small>}</span>
                  <button className="btn primary" disabled={busy === pack.id || pack.price > wallet.balance} onClick={() => act(pack.id, `/loja/${pack.id}/comprar`, undefined, "POST", "Pacote Aurora liberado.")}>
                    {busy === pack.id ? "Comprando..." : "Comprar pacote"}
                  </button>
                </>
              )}
            </div>
          </article>
        </section>
      )}

      <p className="hint shop-foot"><Sparkles size={14} /> Novos itens entram na loja ao longo do semestre.</p>
    </div>
  );
}
