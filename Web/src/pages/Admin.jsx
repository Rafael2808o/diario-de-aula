import { useCallback, useEffect, useState } from "react";
import { Bug, Check, ClipboardList, Eye, EyeOff, LayoutDashboard, Lock, Search, ShieldCheck, Store, UserCheck, UserX, Users } from "lucide-react";
import { useApp } from "../context.js";
import { readableError } from "../lib/api.js";
import { dust } from "../lib/shop.js";
import { Avatar, Empty, FormError, Modal } from "../ui.jsx";

// Painel de Administração: só para quem tem o papel de admin (conferido também no servidor, em toda rota).
// Tudo o que aparece aqui é dado real do Grimiau.

const tabs = [
  ["geral", "Visão geral", LayoutDashboard],
  ["usuarios", "Usuários", Users],
  ["loja", "Loja da Madrugada", Store],
  ["erros", "Central de erros", Bug],
  ["registro", "Registro de ações", ClipboardList],
];
const severityNames = { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };
const statusNames = { aberto: "Aberto", "em-andamento": "Em andamento", resolvido: "Resolvido", descartado: "Descartado" };
const accountNames = { ativa: "Ativa", inativa: "Inativa", suspensa: "Suspensa" };

const ago = (value) => {
  if (!value) return "nunca";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return `há ${Math.round(minutes / 1440)} d`;
};
const day = (value) => (value ? new Date(value).toLocaleDateString("pt-BR") : "—");

function useLoad(path) {
  const { call } = useApp();
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const load = useCallback(async () => {
    try {
      setState((previous) => ({ ...previous, status: previous.data ? "ready" : "loading" }));
      setState({ status: "ready", data: await call(path), error: "" });
    } catch (error) {
      setState({ status: error.status === 403 ? "denied" : "error", data: null, error: readableError(error) });
    }
  }, [call, path]);
  useEffect(() => {
    load();
  }, [load]);
  return [state, load];
}

function Loading({ state, children }) {
  if (state.status === "loading") return <p className="hint" role="status">Carregando...</p>;
  if (state.status === "error") return <Empty compact title="Não foi possível carregar.">{state.error}</Empty>;
  return children(state.data);
}

function Overview({ open }) {
  const [state] = useLoad("/admin/resumo");
  return (
    <Loading state={state}>
      {(data) => {
        const top = Math.max(1, ...Object.values(data.reports.bySeverity));
        return (
          <>
            <div className="adm-stats">
              <article><span><Users size={15} /> Pessoas cadastradas</span><strong>{data.people}</strong><small>contas no total</small></article>
              <article><span><UserCheck size={15} /> Usuários ativos</span><strong>{data.active}</strong><small>entraram nos últimos 30 dias</small></article>
              <article><span><UserX size={15} /> Inativos</span><strong>{data.inactive}</strong><small>{data.suspended} com conta suspensa</small></article>
              <article><span><Store size={15} /> Itens na loja</span><strong>{data.shop.published}</strong><small>publicados de {data.shop.total} · {data.shop.sold} vendidos</small></article>
              <article className={data.reports.open ? "alert" : ""}><span><Bug size={15} /> Erros em aberto</span><strong>{data.reports.open}</strong><small>na Central de erros</small></article>
            </div>
            <div className="adm-columns">
              <section className="adm-panel">
                <h2>Últimos acessos</h2>
                <p className="hint">Quando cada pessoa usou o Grimiau pela última vez.</p>
                {data.recent.length ? (
                  <ul className="adm-people">
                    {data.recent.map((person) => (
                      <li key={person.id}>
                        <Avatar user={person} size={36} />
                        <div><strong>{person.name}</strong><span>{person.course || "Curso não informado"}</span></div>
                        <small className={Date.now() - new Date(person.lastSeenAt) < 10 * 60000 ? "online" : ""}>{ago(person.lastSeenAt)}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p className="hint">Ninguém acessou ainda.</p>}
                <button className="btn ghost small" onClick={() => open("usuarios")}>Ver todas as contas</button>
              </section>
              <section className="adm-panel">
                <h2>Erros em aberto por gravidade</h2>
                <p className="hint">Só os que ainda não foram resolvidos.</p>
                <ul className="adm-bars">
                  {["critica", "alta", "media", "baixa"].map((level) => (
                    <li key={level} className={`sev-${level}`}>
                      <span>{severityNames[level]}</span>
                      <i><b style={{ width: `${(data.reports.bySeverity[level] / top) * 100}%` }} /></i>
                      <strong>{data.reports.bySeverity[level]}</strong>
                    </li>
                  ))}
                </ul>
                <button className="btn ghost small" onClick={() => open("erros")}>Abrir Central de erros</button>
              </section>
            </div>
          </>
        );
      }}
    </Loading>
  );
}

function Suspend({ person, onClose, onDone }) {
  const { call, toast } = useApp();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suspend = person.status !== "suspensa";
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call(`/admin/usuarios/${person.id}/suspensao`, { method: "POST", body: { suspend, reason } });
      toast(suspend ? `Conta de ${person.name} suspensa.` : `Conta de ${person.name} reativada.`);
      onDone();
      onClose();
    } catch (failure) {
      setError(readableError(failure));
      setBusy(false);
    }
  };
  return (
    <Modal title={suspend ? `Suspender ${person.name}?` : `Reativar ${person.name}?`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="modal-text">
          {suspend
            ? "A pessoa sai na hora de todos os aparelhos e não consegue entrar até ser reativada. Nenhum dado é apagado."
            : "A pessoa volta a entrar normalmente, com todos os dados como estavam."}
        </p>
        {suspend && (
          <label>
            Motivo (fica no registro de ações)
            <input value={reason} required maxLength={200} onChange={(event) => setReason(event.target.value)} />
          </label>
        )}
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className={`btn ${suspend ? "danger" : "primary"}`} disabled={busy}>{busy ? "Salvando..." : suspend ? "Suspender conta" : "Reativar conta"}</button>
        </div>
      </form>
    </Modal>
  );
}

function People() {
  const { user } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [path, setPath] = useState("/admin/usuarios");
  const [state, reload] = useLoad(path);
  const [target, setTarget] = useState(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => setPath(`/admin/usuarios?${new URLSearchParams({ q: query, status })}`), 250);
    return () => window.clearTimeout(timeout);
  }, [query, status]);
  return (
    <>
      <div className="adm-filters">
        <label className="adm-search">
          <Search size={15} aria-hidden="true" />
          <input placeholder="Buscar por nome ou e-mail" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar usuário" />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>
          <option value="ativa">Ativas</option>
          <option value="inativa">Inativas</option>
          <option value="suspensa">Suspensas</option>
        </select>
      </div>
      <Loading state={state}>
        {(list) =>
          list.length ? (
            <div className="adm-table" role="table" aria-label="Contas">
              <div className="adm-row head" role="row">
                <span>Pessoa</span><span>E-mail</span><span>Cadastro</span><span>Visto por último</span><span>Situação</span><span />
              </div>
              {list.map((person) => (
                <div className="adm-row" role="row" key={person.id}>
                  <span className="adm-who"><Avatar user={person} size={32} /><span><strong>{person.name}</strong><small>{person.role ? `Papel: ${person.role}` : person.course || "—"}</small></span></span>
                  <span className="adm-mail">{person.email}</span>
                  <span>{day(person.createdAt)}</span>
                  <span>{ago(person.lastSeenAt)}</span>
                  <span><b className={`adm-status ${person.status}`}>{accountNames[person.status]}</b>{person.suspendedReason && <small className="adm-reason">{person.suspendedReason}</small>}</span>
                  <span>
                    {person.id !== user.id && person.role !== "admin" && (
                      <button className="btn ghost small" onClick={() => setTarget(person)}>{person.status === "suspensa" ? "Reativar" : "Suspender"}</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty compact title="Nenhuma conta encontrada." />
        }
      </Loading>
      {target && <Suspend person={target} onClose={() => setTarget(null)} onDone={reload} />}
    </>
  );
}

function ShopAdmin() {
  const { call, toast } = useApp();
  const [state, reload] = useLoad("/admin/loja");
  const [prices, setPrices] = useState({});
  const [error, setError] = useState("");
  const save = async (item, changes, message) => {
    setError("");
    try {
      await call(`/admin/loja/${item.id}`, { method: "PATCH", body: changes });
      toast(message);
      reload();
    } catch (failure) {
      setError(readableError(failure));
    }
  };
  return (
    <Loading state={state}>
      {(items) => (
        <>
          <p className="hint adm-note">O visual de cada item fica no código do Grimiau. Aqui você ajusta preço e decide o que está à venda; quem já comprou continua com o item.</p>
          <FormError>{error}</FormError>
          <div className="adm-shop">
            {items.map((item) => {
              const draft = prices[item.id] ?? String(item.price);
              return (
                <article key={item.id} className={item.published ? "" : "draft"}>
                  <div className="adm-shop-art">
                    {item.kind === "moldura" ? (
                      <span className={`avatar-frame frame-${item.id.replace(/^moldura-/, "")}`} style={{ width: 54, height: 54, "--s": "54px" }}><span className="avatar-img" style={{ width: 54, height: 54 }} /></span>
                    ) : <span className="adm-pack" />}
                  </div>
                  <div className="adm-shop-info">
                    <span className={`adm-status ${item.published ? "ativa" : "inativa"}`}>{item.published ? "Publicado" : "Rascunho"}</span>
                    <h3>{item.name}</h3>
                    <small>{item.kind === "moldura" ? "Moldura de perfil" : "Pacote de cores"} · {item.sold} {item.sold === 1 ? "venda" : "vendas"}</small>
                  </div>
                  <form
                    className="adm-shop-actions"
                    onSubmit={(event) => {
                      event.preventDefault();
                      save(item, { price: Number(draft) }, `Preço de ${item.name}: ${dust(draft)}.`);
                    }}
                  >
                    <label>
                      <span className="sr-only">Preço de {item.name}</span>
                      <input type="number" min="50" max="20000" step="10" value={draft} onChange={(event) => setPrices({ ...prices, [item.id]: event.target.value })} />
                    </label>
                    <button className="btn ghost small" disabled={Number(draft) === item.price}>Salvar preço</button>
                    <button type="button" className="btn ghost small" onClick={() => save(item, { published: !item.published }, item.published ? `${item.name} saiu da loja.` : `${item.name} voltou para a loja.`)}>
                      {item.published ? <><EyeOff size={14} /> Tirar da loja</> : <><Eye size={14} /> Publicar</>}
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Loading>
  );
}

function Reports() {
  const { call, toast } = useApp();
  const [filter, setFilter] = useState("");
  const [state, reload] = useLoad(`/admin/relatos${filter ? `?status=${filter}` : ""}`);
  const [error, setError] = useState("");
  const update = async (report, changes, message) => {
    setError("");
    try {
      await call(`/admin/relatos/${report.id}`, { method: "PATCH", body: changes });
      if (message) toast(message);
      reload();
    } catch (failure) {
      setError(readableError(failure));
    }
  };
  return (
    <>
      <div className="adm-filters">
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Situação dos relatos">
          <option value="">Todos os relatos</option>
          {Object.entries(statusNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <p className="hint">Os relatos chegam de Configurações › Relatar um problema.</p>
      </div>
      <FormError>{error}</FormError>
      <Loading state={state}>
        {(list) =>
          list.length ? (
            <ul className="adm-reports">
              {list.map((report) => (
                <li key={report.id} className={`sev-${report.severity}`}>
                  <header>
                    <strong>{report.title}</strong>
                    <small>{report.author || "Conta apagada"} · {day(report.createdAt)}{report.page ? ` · tela: ${report.page}` : ""}</small>
                  </header>
                  {report.description && <p>{report.description}</p>}
                  {report.device && <small className="adm-device">{report.device}</small>}
                  <div className="adm-report-actions">
                    <label>
                      Gravidade
                      <select value={report.severity} onChange={(event) => update(report, { severity: event.target.value })}>
                        {Object.entries(severityNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </label>
                    <label>
                      Situação
                      <select value={report.status} onChange={(event) => update(report, { status: event.target.value }, `Relato marcado como ${statusNames[event.target.value].toLowerCase()}.`)}>
                        {Object.entries(statusNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty compact mood="happy" title="Nenhum relato aqui.">Quando alguém relatar um problema, ele aparece nesta lista.</Empty>
        }
      </Loading>
    </>
  );
}

function AuditLog() {
  const [state] = useLoad("/admin/auditoria");
  return (
    <Loading state={state}>
      {(rows) =>
        rows.length ? (
          <ul className="adm-audit">
            {rows.map((row) => (
              <li key={row.id}>
                <Check size={14} aria-hidden="true" />
                <span><strong>{row.admin || "Administração"}</strong> {row.action} <b>{row.target}</b>{row.detail ? ` · ${row.detail}` : ""}</span>
                <small>{new Date(row.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
              </li>
            ))}
          </ul>
        ) : <Empty compact title="Nenhuma ação registrada ainda.">Suspensões, mudanças na loja e triagem de relatos ficam anotadas aqui.</Empty>
      }
    </Loading>
  );
}

export default function Admin() {
  const { params, go } = useApp();
  const tab = tabs.some(([id]) => id === params.aba) ? params.aba : "geral";
  const [gate] = useLoad("/admin/resumo");
  const open = (id) => go("admin", { aba: id });

  if (gate.status === "loading") return <div className="page admin"><p className="hint" role="status">Conferindo acesso...</p></div>;
  if (gate.status === "denied") {
    return (
      <div className="page admin">
        <div className="adm-locked">
          <Lock size={28} aria-hidden="true" />
          <h1>Entrada restrita</h1>
          <p>Somente pessoas autorizadas pela equipe do Grimiau.</p>
          <button className="btn ghost" onClick={() => go("inicio")}>Voltar ao Início</button>
        </div>
      </div>
    );
  }
  const Body = { geral: Overview, usuarios: People, loja: ShopAdmin, erros: Reports, registro: AuditLog }[tab];
  const title = tabs.find(([id]) => id === tab)[1];
  return (
    <div className="page admin">
      <header className="page-head">
        <div>
          <p className="eyebrow"><ShieldCheck size={13} /> Administração</p>
          <h1>{title}</h1>
        </div>
      </header>
      <nav className="adm-tabs" aria-label="Seções da administração">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => open(id)}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>
      <Body open={open} />
    </div>
  );
}
