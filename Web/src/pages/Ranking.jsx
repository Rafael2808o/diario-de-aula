import { useEffect, useState } from "react";
import { ArrowLeft, Flame } from "lucide-react";
import { useApp } from "../context.js";
import { Avatar, Empty, FormError, Segmented } from "../ui.jsx";
import { NoxPose } from "../components/Art.jsx";


export default function Ranking() {
  const { call, user, setUser, go } = useApp();
  const [scope, setScope] = useState("geral");
  const [state, setState] = useState({ status: "loading", items: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const optedIn = user.preferences?.rankingPublic === true;

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, status: "loading" }));
    call(`/ranking?escopo=${scope}`)
      .then((result) => alive && setState({ status: "ready", ...result }))
      .catch(() => alive && setState({ status: "error", items: [] }));
    return () => {
      alive = false;
    };
  }, [call, scope, optedIn]);

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      setUser(await call("/me", { method: "PATCH", body: { preferences: { rankingPublic: !optedIn } } }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page ranking">
      <button className="link-btn back" onClick={() => go("perfil")}>
        <ArrowLeft size={15} /> Perfil
      </button>
      <header className="page-head with-nox">
        <div>
          <h1>Ranking dos Bruxinhos</h1>
          <p>Nível e XP de quem escolheu participar. Ninguém aparece aqui sem ligar a opção.</p>
        </div>
        <NoxPose pose="star" size={84} />
      </header>

      <section className={`ranking-optin ${optedIn ? "is-on" : ""}`}>
        <div>
          <strong>{optedIn ? "Você está no ranking" : "Você não aparece no ranking"}</strong>
          <p>Ficam visíveis só o primeiro nome com a inicial do sobrenome, a foto, o nível, o XP, a sequência e o número de relíquias. E-mail, curso e registros nunca aparecem.</p>
        </div>
        <button className={`btn ${optedIn ? "ghost" : "primary"}`} disabled={busy} onClick={toggle}>
          {busy ? "Salvando..." : optedIn ? "Sair do ranking" : "Participar"}
        </button>
      </section>
      <FormError>{error}</FormError>

      <Segmented
        label="Quem aparece"
        value={scope}
        onChange={setScope}
        options={[
          ["geral", "Geral"],
          ["turma", "Minha turma"],
        ]}
      />

      {state.status === "loading" ? (
        <p className="quiet">Consultando as estrelas...</p>
      ) : state.status === "error" ? (
        <p className="quiet">O ranking não abriu agora. Tente de novo em instantes.</p>
      ) : state.needsClass ? (
        <Empty compact title="Informe curso e faculdade para ver sua turma.">
          “Minha turma” reúne quem estuda o mesmo curso na mesma faculdade.
          <button className="btn small" onClick={() => go("configuracoes")}>
            Abrir configurações
          </button>
        </Empty>
      ) : state.items.length ? (
        <ol className="group ranking-list">
          {state.items.map((item) => (
            <li key={item.id} className={`row ranking-row ${item.me ? "is-me" : ""} place-${item.position}`}>
              <span className="ranking-position" aria-label={`${item.position}º lugar`}>
                {item.position}º
              </span>
              <Avatar user={{ id: item.id, name: item.name, avatarVersion: item.avatarVersion }} size={38} />
              <span className="row-main">
                <strong>
                  {item.name}
                  {item.me && <span className="badge">você</span>}
                </strong>
                <small>
                  Nível {item.level} · {item.title}
                </small>
              </span>
              <span className="row-end">
                <strong>{item.xp.toLocaleString("pt-BR")} XP</strong>
                <small>
                  <Flame size={12} aria-hidden="true" /> {item.streak} · {item.relics} {item.relics === 1 ? "relíquia" : "relíquias"}
                </small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty compact mood="sleepy" title={scope === "turma" ? "Ninguém da sua turma entrou no ranking ainda." : "Ninguém entrou no ranking ainda."}>
          {optedIn ? "Quando alguém da sua turma participar, aparece aqui." : "Participe para ser o primeiro nome da lista."}
        </Empty>
      )}
      <p className="footnote">“Amigos” ainda não existe: a Grimiau não tem lista de amigos. Por enquanto, o ranking tem as visões geral e da turma.</p>
    </div>
  );
}
