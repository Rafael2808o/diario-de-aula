import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useApp } from "../../context.js";
import { Avatar } from "../../ui.jsx";

// Chamada em grupo de verdade (WebRTC): áudio e vídeo vão direto entre os aparelhos.
// O servidor do Grimiau só repassa as mensagens de conexão (oferta, resposta e caminhos de rede).
// Servidor TURN opcional (VITE_TURN_URL, VITE_TURN_USER, VITE_TURN_PASS) para redes muito fechadas.
const iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
if (import.meta.env.VITE_TURN_URL) iceServers.push({ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USER, credential: import.meta.env.VITE_TURN_PASS });

function RemoteTile({ person, stream }) {
  const video = useRef(null);
  useEffect(() => {
    if (video.current && stream && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);
  const showVideo = stream && person.cam;
  return (
    <li className="call-tile">
      <video ref={video} autoPlay playsInline className={showVideo ? "" : "is-hidden"} />
      {!showVideo && <Avatar user={person} size={64} />}
      <span className="call-name">
        {person.name} {!person.mic && <MicOff size={13} aria-label="microfone desligado" />}
        {!stream && <small> · conectando...</small>}
      </span>
    </li>
  );
}

export default function GroupCall({ activity }) {
  const { call, toast, user } = useApp();
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(false);
  const [people, setPeople] = useState([]);
  const [streams, setStreams] = useState({});
  const local = useRef(null);
  const localVideo = useRef(null);
  const peers = useRef(new Map());
  const pending = useRef(new Map());
  const base = `/shared/${activity.id}/chamada`;

  const signal = useCallback((to, type, data) => call(`${base}/sinal`, { method: "POST", body: { to, type, data } }).catch(() => {}), [call, base]);

  const closePeer = (id) => {
    peers.current.get(id)?.close();
    peers.current.delete(id);
    pending.current.delete(id);
    setStreams((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const peerFor = useCallback(
    (id) => {
      let pc = peers.current.get(id);
      if (pc) return pc;
      pc = new RTCPeerConnection({ iceServers });
      local.current?.getTracks().forEach((track) => pc.addTrack(track, local.current));
      pc.onicecandidate = (event) => event.candidate && signal(id, "candidate", event.candidate.toJSON());
      pc.ontrack = (event) => setStreams((current) => ({ ...current, [id]: event.streams[0] }));
      pc.onconnectionstatechange = () => pc.connectionState === "failed" && toast("Não foi possível conectar com uma pessoa da chamada. A rede dela pode estar bloqueando.");
      peers.current.set(id, pc);
      return pc;
    },
    [signal, toast],
  );

  const handle = useCallback(
    async (message) => {
      const { from, type, data } = message;
      if (type === "leave") return closePeer(from);
      if (type === "join") {
        // Quem já estava na chamada inicia a conexão com quem chegou.
        const pc = peerFor(from);
        await pc.setLocalDescription(await pc.createOffer());
        return signal(from, "offer", pc.localDescription.toJSON());
      }
      const pc = peerFor(from);
      if (type === "offer") {
        await pc.setRemoteDescription(data);
        await pc.setLocalDescription(await pc.createAnswer());
        signal(from, "answer", pc.localDescription.toJSON());
      } else if (type === "answer") {
        await pc.setRemoteDescription(data);
      } else if (type === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(data).catch(() => {});
        else pending.current.set(from, [...(pending.current.get(from) || []), data]);
        return;
      }
      for (const candidate of pending.current.get(from) || []) await pc.addIceCandidate(candidate).catch(() => {});
      pending.current.delete(from);
    },
    [peerFor, signal],
  );

  // Enquanto está na chamada: busca mensagens a cada segundo (e mantém a presença).
  useEffect(() => {
    if (!joined) return undefined;
    let alive = true;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const state = await call(base);
        if (!alive) return;
        if (!state.joined) {
          toast("A chamada foi encerrada.");
          leave(false);
          return;
        }
        setPeople(state.participants.filter((person) => !person.me));
        for (const message of state.signals) await handle(message).catch((error) => console.error("chamada", error));
      } catch {
        // Falha de rede passageira: tenta de novo no próximo segundo.
      } finally {
        running = false;
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, call, base, handle]);

  // Fora da chamada: mostra quem está nela a cada 10 segundos.
  useEffect(() => {
    if (joined) return undefined;
    let alive = true;
    const peek = () => call(base).then((state) => alive && setPeople(state.participants)).catch(() => {});
    peek();
    const timer = setInterval(() => document.visibilityState === "visible" && peek(), 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [joined, call, base]);

  const join = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast("Este navegador não faz chamadas. Tente o Chrome atualizado.");
    setBusy(true);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        toast("Sem câmera disponível: você entra só com áudio.");
      }
      stream.getVideoTracks().forEach((track) => (track.enabled = false));
      local.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
      setMic(true);
      setCam(false);
      const state = await call(`${base}/entrar`, { method: "POST", body: { mic: true, cam: false } });
      setPeople(state.participants.filter((person) => !person.me));
      setJoined(true);
    } catch (failure) {
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
      toast(failure?.name === "NotAllowedError" ? "Permita o uso do microfone para entrar na chamada." : failure.message || "Não foi possível entrar na chamada.");
    } finally {
      setBusy(false);
    }
  };

  function leave(tellServer = true, endAll = false) {
    if (tellServer) call(`${base}/sair`, { method: "POST", body: { encerrar: endAll } }).catch(() => {});
    for (const id of [...peers.current.keys()]) closePeer(id);
    local.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    setJoined(false);
    setStreams({});
  }

  // Sair da página também sai da chamada.
  useEffect(() => () => joinedRef.current && leaveRef.current(), []);
  const joinedRef = useRef(joined);
  const leaveRef = useRef(leave);
  joinedRef.current = joined;
  leaveRef.current = leave;

  const toggle = (kind) => {
    const next = kind === "mic" ? !mic : !cam;
    const tracks = kind === "mic" ? local.current?.getAudioTracks() : local.current?.getVideoTracks();
    if (!tracks?.length) return toast(kind === "cam" ? "Nenhuma câmera disponível neste aparelho." : "Nenhum microfone disponível.");
    tracks.forEach((track) => (track.enabled = next));
    const state = { mic: kind === "mic" ? next : mic, cam: kind === "cam" ? next : cam };
    setMic(state.mic);
    setCam(state.cam);
    call(`${base}/sinal`, { method: "POST", body: { type: "state", data: state } }).catch(() => {});
  };

  useEffect(() => {
    if (joined && localVideo.current && local.current) localVideo.current.srcObject = local.current;
  }, [joined]);

  return (
    <section className="sala-call" aria-labelledby="chamada-title">
      <div className="section-head">
        <h2 id="chamada-title" className="section-title">
          Chamada em grupo
        </h2>
        {!joined && people.length > 0 && <small className="call-live">{people.length === 1 ? "1 pessoa na chamada" : `${people.length} pessoas na chamada`}</small>}
      </div>
      {!joined ? (
        <div className="call-idle">
          <p className="hint">Áudio e vídeo com os integrantes do trabalho, direto pelo Grimiau. Até 8 pessoas.</p>
          <button type="button" className="btn primary" disabled={busy || activity.closed} onClick={join}>
            <Phone size={16} /> {busy ? "Entrando..." : people.length ? "Entrar na chamada" : "Começar chamada"}
          </button>
        </div>
      ) : (
        <>
          <ul className="call-grid">
            <li className="call-tile is-me">
              <video ref={localVideo} autoPlay playsInline muted className={cam ? "" : "is-hidden"} />
              {!cam && <Avatar user={user} size={64} />}
              <span className="call-name">
                Você {!mic && <MicOff size={13} aria-label="microfone desligado" />}
              </span>
            </li>
            {people.map((person) => (
              <RemoteTile key={person.id} person={person} stream={streams[person.id]} />
            ))}
          </ul>
          {people.length === 0 && <p className="quiet">Esperando os colegas entrarem. Eles receberam um aviso.</p>}
          <div className="call-controls">
            <button type="button" className={`btn ${mic ? "" : "soft"}`} aria-pressed={!mic} onClick={() => toggle("mic")}>
              {mic ? <Mic size={16} /> : <MicOff size={16} />} {mic ? "Microfone ligado" : "Microfone desligado"}
            </button>
            <button type="button" className={`btn ${cam ? "" : "soft"}`} aria-pressed={cam} onClick={() => toggle("cam")}>
              {cam ? <Video size={16} /> : <VideoOff size={16} />} {cam ? "Câmera ligada" : "Câmera desligada"}
            </button>
            <button type="button" className="btn danger-outline" onClick={() => leave(true)}>
              <PhoneOff size={16} /> Sair
            </button>
            {activity.owner && (
              <button type="button" className="btn danger-outline" onClick={() => leave(true, true)}>
                Encerrar para todos
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
