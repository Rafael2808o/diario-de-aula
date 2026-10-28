import { useEffect, useState } from "react";
import { request } from "../lib/api.js";
import { FormError, Logo } from "../ui.jsx";
import { CoverScene } from "../components/Art.jsx";

const resetToken = () => new URLSearchParams(window.location.search).get("redefinir") || "";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState(resetToken() ? "reset" : "welcome");
  useEffect(() => {
    document.title = "Grimiau — seu grimório acadêmico";
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const switchTo = (next) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    setNotice("");
    if ((mode === "register" || mode === "reset") && values.password !== values.confirm) return setError("As senhas não conferem.");
    if ((mode === "register" || mode === "reset") && values.password.length < 8) return setError("Use uma senha com pelo menos 8 caracteres.");
    setBusy(true);
    try {
      if (mode === "register") onAuthenticated(await request("/auth/register", { method: "POST", body: { name: values.name, email: values.email, password: values.password } }));
      else if (mode === "login") onAuthenticated(await request("/auth/login", { method: "POST", body: { email: values.email, password: values.password } }));
      else if (mode === "forgot") setNotice((await request("/auth/forgot-password", { method: "POST", body: { email: values.email } })).message);
      else {
        const result = await request("/auth/reset-password", { method: "POST", body: { token: resetToken(), password: values.password } });
        history.replaceState({}, "", "/");
        setMode("login");
        setNotice(result.message);
      }
    } catch (failure) {
      setError(failure instanceof TypeError ? "Não foi possível conectar ao servidor. Verifique sua internet." : failure.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = {
    welcome: ["", "", ""],
    register: ["Crie sua conta", "Leva menos de um minuto. Depois, montamos seu semestre juntos.", "Criar conta"],
    login: ["Que bom te ver de novo", "Entre para continuar de onde parou. Seus registros estão no lugar.", "Entrar"],
    forgot: ["Recuperar senha", "Enviaremos um link para você criar uma nova senha.", "Enviar link"],
    reset: ["Nova senha", "Escolha uma nova senha para sua conta.", "Salvar nova senha"],
  }[mode];

  if (mode === "welcome") {
    return (
      <main className="welcome-screen">
        <div className="welcome-sky" aria-hidden="true" />
        <section className="welcome-card">
          <CoverScene />
          <h1 className="wordmark">Grimiau</h1>
          <p className="welcome-subtitle">seu grimório acadêmico</p>
          <p className="slogan">Conhecimento é magia.</p>
          <p className="welcome-text">Seu grimório acadêmico: aulas, provas, flashcards e sessões de estudo da faculdade, organizados num lugar só.</p>
          <div className="welcome-actions">
            <button type="button" className="btn primary" onClick={() => switchTo("register")}>
              Criar conta
            </button>
            <button type="button" className="btn ghost" onClick={() => switchTo("login")}>
              Fazer login
            </button>
          </div>
          <p className="hint">Já usava o Lúmina? Sua conta continua valendo: é só fazer login.</p>
          <a className="hint welcome-download" href="/baixar">
            Instalar no Android ou iPhone
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="auth">
      <section className="auth-story">
        <div className="brand-mark">
          <Logo size={48} /> <span>Grimiau</span>
        </div>
        <div>
          <h1>Olá, bruxinha. Vamos desvendar alguns conteúdos?</h1>
          <p>Registre as aulas, acompanhe as provas e estude com o Nox do seu lado. Conhecimento é magia.</p>
        </div>
        <CoverScene />
      </section>
      <section className="auth-panel">
        <form className="form auth-form" onSubmit={submit} noValidate={false}>
          <button type="button" className="link-btn back" onClick={() => switchTo("welcome")}>
            ← Voltar
          </button>
          <h2>{copy[0]}</h2>          <p className="hint">{copy[1]}</p>
          {mode === "register" && (
            <label>
              Nome
              <input name="name" required maxLength={80} autoComplete="name" placeholder="Como quer ser chamado?" />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              E-mail
              <input name="email" type="email" required maxLength={140} autoComplete="email" placeholder="voce@exemplo.com" />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              {mode === "reset" ? "Nova senha" : "Senha"}
              <input name="password" type="password" required minLength={mode === "login" ? undefined : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "" : "Pelo menos 8 caracteres"} />
            </label>
          )}
          {(mode === "register" || mode === "reset") && (
            <label>
              Confirme a senha
              <input name="confirm" type="password" required autoComplete="new-password" />
            </label>
          )}
          <FormError>{error}</FormError>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button className="btn primary block" disabled={busy}>
            {busy ? "Aguarde..." : copy[2]}
          </button>
          <div className="auth-links">
            {mode === "register" && <button type="button" className="link-btn" onClick={() => switchTo("login")}>Já tenho conta</button>}
            {mode === "login" && (
              <>
                <button type="button" className="link-btn" onClick={() => switchTo("register")}>Criar conta</button>
                <button type="button" className="link-btn" onClick={() => switchTo("forgot")}>Esqueci minha senha</button>
              </>
            )}
            {(mode === "forgot" || mode === "reset") && <button type="button" className="link-btn" onClick={() => switchTo("login")}>Voltar para entrar</button>}
          </div>
          <p className="hint auth-download">
            Quer no celular? <a href="/baixar">Instale no Android ou iPhone</a>.
          </p>
        </form>
      </section>
    </main>
  );
}
