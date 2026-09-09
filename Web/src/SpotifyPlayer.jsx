import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Headphones,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";

const tokenKey = "estuda.spotify.token";
const verifierKey = "estuda.spotify.verifier";
const oauthStateKey = "estuda.spotify.state";

const encode = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const randomString = (length = 64) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return encode(bytes).slice(0, length);
};

const readToken = () => {
  try {
    return JSON.parse(localStorage.getItem(tokenKey) || "null");
  } catch {
    return null;
  }
};

const saveToken = (payload, previous = {}) => {
  const token = {
    ...previous,
    ...payload,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  localStorage.setItem(tokenKey, JSON.stringify(token));
  return token;
};

const spotifyUri = (url) => {
  const match = String(url || "").match(
    /open\.spotify\.com\/(?:embed\/)?(playlist|album|episode|show|track)\/([A-Za-z0-9]+)/,
  );
  return match ? `spotify:${match[1]}:${match[2]}` : "";
};

async function requestToken(body) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error);
  return payload;
}

async function freshToken(clientId) {
  const current = readToken();
  if (!current) return null;
  if (current.expiresAt > Date.now() + 60_000) return current.access_token;
  if (!current.refresh_token) return null;
  const refreshed = await requestToken({
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
    client_id: clientId,
  });
  return saveToken(refreshed, current).access_token;
}

async function beginLogin(clientId) {
  const verifier = randomString(96);
  const challenge = encode(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const state = randomString(32);
  const redirectUri = `${window.location.origin}/?spotify=callback`;
  localStorage.setItem(verifierKey, verifier);
  localStorage.setItem(oauthStateKey, state);
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope:
      "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state",
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${query}`);
}

export default function SpotifyPlayer({ playlist, go, apiBase }) {
  const playerRef = useRef(null);
  const tokenRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [activated, setActivated] = useState(false);
  const [clientId, setClientId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [connected, setConnected] = useState(Boolean(readToken()));
  const [paused, setPaused] = useState(true);
  const [track, setTrack] = useState("");
  const [volume, setVolume] = useState(55);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${apiBase}/integrations/spotify/status`)
      .then((response) => response.json())
      .then((status) => setClientId(status.clientId || ""))
      .catch(() => setClientId(""));
  }, [apiBase]);

  useEffect(() => {
    if (!clientId) return;
    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");
    const returnedState = query.get("state");
    if (query.get("spotify") !== "callback" || !code) return;
    const verifier = localStorage.getItem(verifierKey);
    const expectedState = localStorage.getItem(oauthStateKey);
    if (!verifier || returnedState !== expectedState) {
      setMessage("A conexão com o Spotify não pôde ser validada.");
      return;
    }
    requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${window.location.origin}/?spotify=callback`,
      client_id: clientId,
      code_verifier: verifier,
    })
      .then((payload) => {
        saveToken(payload);
        setConnected(true);
        setExpanded(true);
        setActivated(true);
        setMessage("Spotify Premium conectado.");
      })
      .catch(() => setMessage("Não foi possível concluir a conexão com o Spotify."))
      .finally(() => {
        localStorage.removeItem(verifierKey);
        localStorage.removeItem(oauthStateKey);
        history.replaceState({}, "", "/?abrir=perfil");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
  }, [clientId]);

  useEffect(() => {
    if (!connected || !clientId || playerRef.current) return;
    let disposed = false;
    const initialize = async () => {
      try {
        tokenRef.current = await freshToken(clientId);
        if (!tokenRef.current || disposed) return;
        const start = () => {
          if (disposed || playerRef.current) return;
          const player = new window.Spotify.Player({
            name: "estuda. — foco",
            volume: 0.55,
            enableMediaSession: true,
            getOAuthToken: async (callback) => {
              tokenRef.current = await freshToken(clientId);
              callback(tokenRef.current);
            },
          });
          player.addListener("ready", ({ device_id: id }) => setDeviceId(id));
          player.addListener("player_state_changed", (state) => {
            if (!state) return;
            setPaused(state.paused);
            setTrack(state.track_window?.current_track?.name || "");
          });
          player.addListener("account_error", () =>
            setMessage("A reprodução completa exige uma conta Spotify Premium."),
          );
          player.addListener("authentication_error", () => {
            localStorage.removeItem(tokenKey);
            setConnected(false);
            setMessage("A conexão com o Spotify expirou. Conecte novamente.");
          });
          player.connect();
          playerRef.current = player;
        };
        if (window.Spotify) start();
        else {
          window.onSpotifyWebPlaybackSDKReady = start;
          if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
            const script = document.createElement("script");
            script.src = "https://sdk.scdn.co/spotify-player.js";
            script.async = true;
            document.body.appendChild(script);
          }
        }
      } catch {
        setMessage("Não foi possível iniciar o player Premium.");
      }
    };
    initialize();
    return () => {
      disposed = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [clientId, connected]);

  const startPremium = async () => {
    const uri = spotifyUri(playlist);
    if (!uri || !deviceId || !playerRef.current) {
      setMessage("Escolha uma playlist e aguarde a conexão do player.");
      return;
    }
    try {
      await playerRef.current.activateElement?.();
      const token = await freshToken(clientId);
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          uri.startsWith("spotify:track:")
            ? { uris: [uri] }
            : { context_uri: uri },
        ),
      });
      if (!response.ok) throw new Error("Spotify não iniciou a reprodução.");
      setMessage("");
    } catch {
      setMessage("Abra o Spotify uma vez e tente transferir a reprodução novamente.");
    }
  };

  const changeVolume = async (value) => {
    setVolume(value);
    await playerRef.current?.setVolume(Number(value) / 100);
  };

  const disconnect = () => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    localStorage.removeItem(tokenKey);
    setConnected(false);
    setDeviceId("");
    setTrack("");
    setMessage("Spotify desconectado deste navegador.");
  };

  return (
    <aside
      className={`spotify-dock ${expanded ? "expanded" : "collapsed"}`}
      aria-label="Player de foco do Spotify"
    >
      <div className="spotify-dock-head">
        <button
          className="spotify-dock-title"
          onClick={() => {
            if (!expanded) setActivated(true);
            setExpanded((current) => !current);
          }}
          aria-expanded={expanded}
        >
          <Headphones size={17} />
          <span>
            <strong>{track || "Foco com Spotify"}</strong>
            <small>
              {connected ? "Player Premium persistente" : "Continua durante a navegação"}
            </small>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button className="spotify-settings" onClick={() => go("perfil")}>
          Configurar
        </button>
      </div>
      {expanded && (
        <div className="spotify-player-body">
          {connected ? (
            <>
              <div className="spotify-controls">
                <button aria-label="Faixa anterior" onClick={() => playerRef.current?.previousTrack()}>
                  <SkipBack size={17} />
                </button>
                <button
                  className="spotify-play"
                  aria-label={paused ? "Reproduzir" : "Pausar"}
                  onClick={() => (track ? playerRef.current?.togglePlay() : startPremium())}
                >
                  {paused ? <Play size={18} /> : <Pause size={18} />}
                </button>
                <button aria-label="Próxima faixa" onClick={() => playerRef.current?.nextTrack()}>
                  <SkipForward size={17} />
                </button>
                <label className="spotify-volume">
                  <Volume2 size={16} />
                  <input
                    aria-label="Volume do Spotify"
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(event) => changeVolume(event.target.value)}
                  />
                </label>
                <button className="spotify-text-action" onClick={startPremium}>
                  Tocar seleção
                </button>
                <button className="spotify-text-action" onClick={disconnect}>
                  Desconectar
                </button>
              </div>
              <small className="spotify-note">
                No iPhone, o volume é controlado pelos botões físicos do aparelho.
              </small>
            </>
          ) : (
            <>
              {activated && playlist ? (
                <iframe
                  title="Player persistente do Spotify"
                  src={playlist}
                  width="100%"
                  height="152"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="eager"
                />
              ) : (
                <div className="spotify-empty">
                  <strong>Nenhuma música escolhida</strong>
                  <span>Adicione seu próprio link do Spotify no Perfil.</span>
                </div>
              )}
              {clientId && (
                <button className="spotify-connect" onClick={() => beginLogin(clientId)}>
                  Conectar Spotify Premium
                </button>
              )}
            </>
          )}
          {message && <small className="spotify-message">{message}</small>}
        </div>
      )}
    </aside>
  );
}
