import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, DoorOpen, Hourglass, LogIn, Pause, Play, Plus, Send, UserPlus } from "lucide-react";
import { useApp } from "../context.js";
import { elapsedMs, formatTimer } from "../lib/ritual.js";
import { when } from "../lib/social.js";
import { Avatar, Confirm, Empty, FormError, Modal } from "../ui.jsx";
import { PeoplePicker } from "../components/sala/People.jsx";

// Ritual em grupo: sala de foco com amigos. Cada pessoa usa o próprio Ritual; a sala mostra quem está focando,
// em pausa ou só presente, tem chat ao vivo e um bloco de foco do grupo com a mesma contagem para todos.
// Atualiza a cada 5 segundos só enquanto a página está aberta e visível. Sem áudio e sem vídeo.
const pulseMs = 5000;
const stateLabel = { focando: "Focando", pausa: "Em pausa", presente: "Na sala", fora: "Fora da sala" };

function minutesSince(iso, now) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? "agora" : minutes < 60 ? `há ${minutes} min` : `há ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function Lobby() {
  const { call, go } = useApp();
  const [rooms, setRooms] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    call("/foco/salas").then(setRooms).catch(() => setRooms([]));
  }, [call]);
  const run = async (kind, request) => {
    setBusy(kind);
    setError("");
    try {
      const room = await request();
      go("foco", { id: room.id });
    } catch (failure) {
      setError(failure.message);
      setBusy("");
    }
  };
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Ritual em grupo</h1>
          <p>Estudem juntos em tempo real: cada um com o próprio Ritual, todos vendo quem está focando, com chat e blocos de foco do grupo.</p>
        </div>
      </header>
      <div className="focus-lobby">
        <form className="paper-card form" onSubmit={(event) => { event.preventDefault(); run("create", () => call("/foco/salas", { method: "POST", body: { name } })); }}>
          <p className="paper-label">Criar uma sala</p>
          <label>
            Nome da sala
            <input value={name} maxLength={60} required placeholder="Ex.: Turma da noite" onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="btn primary" disabled={busy || name.trim().length < 2}>
            <Plus size={16} /> {busy === "create" ? "Criando..." : "Criar sala"}
          </button>
        </form>
        <form className="paper-card form" onSubmit={(event) => { event.preventDefault(); run("join", () => call("/foco/salas/entrar", { method: "POST", body: { code } })); }}>
          <p className="paper-label">Entrar com código</p>
          <label>
            Código da sala
            <input value={code} maxLength={8} required autoCapitalize="characters" placeholder="Ex.: K7M2QX" onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </label>
          <button className="btn soft" disabled={busy || code.trim().length < 4}>
            <LogIn size={16} /> {busy === "join" ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
      <FormError>{error}</FormError>
      <section>
        <h2 className="section-title">Minhas salas</h2>
        {rooms === null ? (
          <p className="quiet">Carregando…</p>
        ) : rooms.length ? (
          <ul className="group">
            {rooms.map((room) => (
              <li key={room.id} className="row">
                <button type="button" className="row-main row-link" onClick={() => go("foco", { id: room.id })}>
                  <strong>{room.name}</strong>
                  <small>
                    {room.online ? `${room.online} ${room.online === 1 ? "pessoa" : "pessoas"} na sala agora` : "Ninguém na sala agora"} · {room.total} no grupo
                  </small>
                </button>
                {room.online > 0 && <span className="stamp mint">ao vivo</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Você ainda não está em nenhuma sala. Crie uma e mande o código para os amigos.</p>
        )}
      </section>
    </div>
  );
}

function Room({ roomId }) {
  const { call, go, toast, ritual, data } = useApp();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [text, setText] = useState("");
  const [inviting, setInviting] = useState(false);
  const [invitees, setInvitees] = useState([]);
  const [leaving, setLeaving] = useState(false);
  const messages = useRef([]);
  const last = useRef("");
  const chatEnd = useRef(null);
  const offset = useRef(0); // diferença entre o relógio do servidor e o do aparelho

  const state = ritual.state;
  const subjectName = data.subjects.find((subject) => subject.id === state.subjectId)?.name || "";
  const mine = state.status === "running" ? "focando" : state.status === "paused" ? "pausa" : "presente";
  const since = state.status === "running" || state.status === "paused" ? new Date(state.startedAt).toISOString() : null;

  const merge = useCallback((next) => {
    if (next.messages.length) {
      const known = new Set(messages.current.map((message) => message.id));
      messages.current = [...messages.current, ...next.messages.filter((message) => !known.has(message.id))].slice(-120);
      last.current = messages.current.at(-1)?.createdAt || last.current;
    }
    offset.current = new Date(next.serverTime).getTime() - Date.now();
    setRoom({ ...next, messages: messages.current });
  }, []);

  const pulse = useCallback(async () => {
    try {
      merge(await call(`/foco/salas/${roomId}/pulso`, { method: "POST", body: { state: mine, subject: mine === "presente" ? "" : subjectName, since, after: last.current } }));
      setError("");
    } catch (failure) {
      if (/não encontrada/.test(failure.message)) setError(failure.message);
    }
  }, [call, roomId, mine, subjectName, since, merge]);

  useEffect(() => {
    messages.current = [];
    last.current = "";
  }, [roomId]);
  useEffect(() => {
    pulse();
    const timer = setInterval(() => document.visibilityState === "visible" && pulse(), pulseMs);
    const visible = () => document.visibilityState === "visible" && pulse();
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [pulse]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const count = room?.messages.length || 0;
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  const send = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      merge(await call(`/foco/salas/${roomId}/mensagens`, { method: "POST", body: { body, after: last.current } }));
    } catch (failure) {
      setText(body);
      toast(failure.message);
    }
  };
  const block = async (body) => {
    try {
      merge(await call(`/foco/salas/${roomId}/bloco`, { method: "POST", body: { ...body, after: last.current } }));
    } catch (failure) {
      toast(failure.message);
    }
  };

  if (error && !room) {
    return (
      <div className="page">
        <Empty title="Sala indisponível" action={<button className="btn primary" onClick={() => go("foco")}>Ver minhas salas</button>}>
          {error}
        </Empty>
      </div>
    );
  }
  if (!room) return <div className="page"><p className="quiet">Entrando na sala…</p></div>;

  const serverNow = now + offset.current;
  const blockLeft = room.block ? Math.max(0, new Date(room.block.endsAt).getTime() - serverNow) : 0;
  const online = room.people.filter((person) => person.online);
  const focusing = online.filter((person) => person.state === "focando").length;
  const myMs = elapsedMs(state, now);

  return (
    <div className="page focus-room">
      <header className="page-head">
        <div>
          <button className="link-btn" onClick={() => go("foco")}>
            <ArrowLeft size={14} /> Minhas salas
          </button>
          <h1>{room.name}</h1>
          <p>
            {online.length} na sala · {focusing} focando agora
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn soft"
            onClick={() => {
              navigator.clipboard?.writeText(room.code).then(() => toast(`Código ${room.code} copiado.`), () => toast(`Código da sala: ${room.code}`));
            }}
          >
            <Copy size={16} /> Código {room.code}
          </button>
          <button className="btn soft" onClick={() => setInviting(true)}>
            <UserPlus size={16} /> Convidar
          </button>
        </div>
      </header>

      <div className="focus-layout">
        <div className="focus-main">
          <section className="paper-card focus-block" aria-label="Bloco de foco do grupo">
            <p className="paper-label">Bloco do grupo</p>
            {room.block ? (
              <>
                <strong className="focus-clock" role="timer">{formatTimer(blockLeft)}</strong>
                <p className="hint">
                  Bloco de {room.block.minutes} min começado por {room.block.by}. {blockLeft === 0 ? "Acabou! Hora da pausa." : "Celular de lado até o fim."}
                </p>
                <div className="focus-actions">
                  {state.status === "idle" && (
                    <button className="btn primary" onClick={() => ritual.start(state.subjectId || "", room.block.minutes)}>
                      <Hourglass size={16} /> Focar junto (meu Ritual)
                    </button>
                  )}
                  <button className="btn soft" onClick={() => block({ stop: true })}>
                    Encerrar bloco
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="hint">Comece um bloco e todo mundo vê a mesma contagem. Cada um registra o próprio tempo no Ritual.</p>
                <div className="focus-actions">
                  <button className="btn primary" onClick={() => block({ minutes: 25 })}>
                    <Hourglass size={16} /> Bloco de 25 min
                  </button>
                  <button className="btn soft" onClick={() => block({ minutes: 50 })}>
                    Bloco de 50 min
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="focus-me paper-card" aria-label="Meu Ritual">
            <p className="paper-label">Meu Ritual</p>
            {state.status === "idle" || state.status === "finished" ? (
              <div className="focus-actions">
                <span className="hint">Seu Ritual está parado; na sala você aparece como “na sala”.</span>
                <button className="btn primary" onClick={() => ritual.start(state.subjectId || "")}>
                  <Play size={16} /> Começar meu Ritual
                </button>
              </div>
            ) : (
              <div className="focus-actions">
                <strong className="focus-my-clock">{formatTimer(myMs)}</strong>
                <span className="hint">{subjectName || "Sem disciplina"} · todos veem seu estado</span>
                {state.status === "running" ? (
                  <button className="btn soft" onClick={ritual.pause}>
                    <Pause size={16} /> Pausar
                  </button>
                ) : (
                  <button className="btn primary" onClick={ritual.resume}>
                    <Play size={16} /> Continuar
                  </button>
                )}
                <button className="btn soft" onClick={() => ritual.setView("open")}>
                  Abrir o Ritual
                </button>
              </div>
            )}
          </section>

          <section aria-label="Quem está na sala">
            <ul className="focus-people">
              {room.people.map((person) => (
                <li key={person.id} className={`focus-person is-${person.state}`}>
                  <span className="focus-avatar">
                    <Avatar user={person} size={44} />
                  </span>
                  <button type="button" className="link-btn focus-name" onClick={() => go("perfil", { pessoa: person.id })}>
                    <strong>{person.me ? "Você" : person.name}</strong>
                  </button>
                  <small className="focus-state">{stateLabel[person.state]}</small>
                  {person.subject && <small>{person.subject}</small>}
                  {person.since && person.state !== "presente" && <small className="quiet">{minutesSince(person.since, serverNow)}</small>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="focus-chat paper-card" aria-label="Chat da sala">
          <p className="paper-label">Chat da sala</p>
          <ol className="focus-messages" aria-live="polite">
            {room.messages.length ? (
              room.messages.map((message) =>
                message.system ? (
                  <li key={message.id} className="is-system">
                    {message.body}
                  </li>
                ) : (
                  <li key={message.id}>
                    <Avatar user={message.author} size={26} />
                    <div>
                      <strong>{message.author?.name || "Estudante"}</strong> <small className="quiet">{when(message.createdAt)}</small>
                      <p className="prewrap">{message.body}</p>
                    </div>
                  </li>
                ),
              )
            ) : (
              <li className="is-system">Ninguém falou nada ainda. Dá um oi!</li>
            )}
            <li ref={chatEnd} aria-hidden="true" className="focus-chat-end" />
          </ol>
          <form className="focus-send form" onSubmit={send}>
            <label className="sr-only" htmlFor="focus-message">
              Mensagem
            </label>
            <input id="focus-message" value={text} maxLength={500} placeholder="Mensagem para a sala" onChange={(event) => setText(event.target.value)} />
            <button className="btn primary" aria-label="Enviar mensagem" disabled={!text.trim()}>
              <Send size={16} />
            </button>
          </form>
        </aside>
      </div>
      <footer className="sala-footer">
        <button className="link-btn" onClick={() => setLeaving(true)}>
          <DoorOpen size={14} /> Sair da sala
        </button>
      </footer>

      {inviting && (
        <Modal title="Chamar amigos para a sala" onClose={() => setInviting(false)}>
          <div className="form">
            <PeoplePicker value={invitees} onChange={setInvitees} max={20} label="Buscar colega" />
            <p className="hint">Quem você chamar recebe um aviso e já entra na lista da sala. Também dá para mandar o código {room.code}.</p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setInviting(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!invitees.length}
                onClick={async () => {
                  try {
                    merge(await call(`/foco/salas/${roomId}/convidar`, { method: "POST", body: { userIds: invitees.map((person) => person.id), after: last.current } }));
                    toast(invitees.length === 1 ? "Convite enviado." : "Convites enviados.");
                    setInvitees([]);
                    setInviting(false);
                  } catch (failure) {
                    toast(failure.message);
                  }
                }}
              >
                Convidar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {leaving && (
        <Confirm
          title="Sair da sala?"
          message="Você sai da lista desta sala. Para voltar, use o código ou peça um convite. Seu Ritual continua normalmente."
          onConfirm={async () => {
            await call(`/foco/salas/${roomId}/sair`, { method: "POST" });
            go("foco");
          }}
          onClose={() => setLeaving(false)}
        />
      )}
    </div>
  );
}

export default function FocusRoom() {
  const { params } = useApp();
  return params.id ? <Room key={params.id} roomId={params.id} /> : <Lobby />;
}
