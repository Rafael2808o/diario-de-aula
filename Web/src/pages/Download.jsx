import { useEffect, useState } from "react";
import { Apple, Download as DownloadIcon, Laptop, Smartphone } from "lucide-react";
import { Nox } from "../ui.jsx";

const apkUrl = "https://github.com/Rafael2808o/diario-de-aula/releases/download/v1.4.0/lumina-v1.4.0.apk";
const siteUrl = "https://diario-de-aula-web.vercel.app";

// Página pública com todas as formas de usar o Lúmina. Detecta o aparelho para mostrar primeiro o caminho certo.
export default function Download() {
  const [device, setDevice] = useState("computador");
  const [installEvent, setInstallEvent] = useState(null);
  useEffect(() => {
    document.title = "Baixar o Lúmina";
    const agent = navigator.userAgent;
    setDevice(/iphone|ipad|ipod/i.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iphone" : /android/i.test(agent) ? "android" : "computador");
    const handler = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const sections = {
    iphone: (
      <section className="install-block" key="iphone">
        <h2>
          <Apple size={20} aria-hidden="true" /> iPhone e iPad
        </h2>
        <ol>
          <li>Abra {siteUrl.replace("https://", "")} no <strong>Safari</strong>.</li>
          <li>
            Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).
          </li>
          <li>
            Escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.
          </li>
        </ol>
        <p className="hint">O Lúmina abre em tela cheia, como um app, e recebe atualizações sozinho. É grátis e não precisa da App Store.</p>
      </section>
    ),
    android: (
      <section className="install-block" key="android">
        <h2>
          <Smartphone size={20} aria-hidden="true" /> Android
        </h2>
        <p>
          <a className="btn primary" href={apkUrl}>
            <DownloadIcon size={16} /> Baixar o APK (versão 1.4.0)
          </a>
        </p>
        <ol>
          <li>Abra o arquivo baixado e permita a instalação de apps desta fonte, se o Android pedir.</li>
          <li>Toque em <strong>Instalar</strong>.</li>
        </ol>
        <p className="hint">
          Prefere sem APK? No Chrome, abra o site, toque no menu ⋮ e escolha <strong>Instalar app</strong>.
          {installEvent && (
            <>
              {" "}
              <button className="link-btn" onClick={() => installEvent.prompt()}>
                Instalar agora
              </button>
            </>
          )}
        </p>
      </section>
    ),
    computador: (
      <section className="install-block" key="computador">
        <h2>
          <Laptop size={20} aria-hidden="true" /> Computador
        </h2>
        <p>
          Use direto no navegador em <a href={siteUrl}>{siteUrl.replace("https://", "")}</a>. No Chrome ou Edge, o ícone de instalar na barra de endereço cria um atalho que abre em
          janela própria.
        </p>
        {installEvent && (
          <button className="btn" onClick={() => installEvent.prompt()}>
            Instalar no computador
          </button>
        )}
      </section>
    ),
  };
  const order = [device, ...["iphone", "android", "computador"].filter((item) => item !== device)];

  return (
    <main className="download-page">
      <header>
        <a className="brand-mark" href="/">
          <Nox size={36} /> <span>Lúmina</span>
        </a>
        <a className="btn primary" href="/">
          Abrir no navegador
        </a>
      </header>
      <div className="download-intro">
        <h1>Instale o Lúmina</h1>
        <p>A mesma conta funciona no celular, no tablet e no computador. Seus registros ficam sincronizados.</p>
      </div>
      {order.map((item) => sections[item])}
    </main>
  );
}
