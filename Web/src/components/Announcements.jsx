import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "../context.js";
import { formatFull } from "../lib/dates.js";
import { Modal } from "../ui.jsx";

// Comunicados de versão. A leitura fica na conta (preferences.announcementSeen), então não reaparece
// em outro aparelho nem a cada login. Só o comunicado mais recente vira aviso; os anteriores ficam no histórico.
export const announcements = [
  {
    version: "2.0.0",
    date: "2026-10-28",
    title: "Nosso site divo está atualizado! ✨",
    summary: "O Lúmina agora é a Grimiau, seu grimório acadêmico. Suas contas, aulas, provas e arquivos continuam exatamente onde estavam.",
    items: [
      "Visual novo, escuro, com o Nox de sempre: agora um gatinho preto de olhos lilás.",
      "Ritual de Concentração: cronômetro que continua contando mesmo com o painel fechado, frases para dar ânimo e sua playlist do Spotify.",
      "Os conteúdos das aulas aparecem sozinhos na revisão da prova certa. Você também pode vincular uma aula a uma prova à mão.",
      "“Aulas que precisam de conteúdo”: a lista mostra o que falta registrar.",
      "Transcrição com andamento visível. Dá para trocar de página sem perder nada, e se falhar, é só tentar de novo.",
      "Cartas do Saber: flashcards que viram, embaralham e separam o que você sabe do que ainda gera dúvida.",
      "Quadro de Dúvidas, compartilhado com toda a comunidade.",
      "Horóscopo do dia e foto de perfil.",
    ],
    action: "Opcional: escolha seu signo no card de horóscopo e, se quiser, adicione uma foto em Configurações.",
  },
];
export const latestAnnouncement = announcements[0];

function Details({ announcement, onClose }) {
  return (
    <Modal title={`Versão ${announcement.version}`} onClose={onClose}>
      <div className="announcement-detail">
        <p className="hint">Publicada em {formatFull(announcement.date)}</p>
        <p>{announcement.summary}</p>
        <ul>
          {announcement.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {announcement.action && <p className="notice">{announcement.action}</p>}
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function AnnouncementBanner() {
  const { user, call, setUser, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (user.preferences?.announcementSeen === latestAnnouncement.version) return null;
  const acknowledge = async () => {
    setBusy(true);
    try {
      setUser(await call("/me", { method: "PATCH", body: { preferences: { announcementSeen: latestAnnouncement.version } } }));
    } catch (failure) {
      toast(failure.message);
      setBusy(false);
    }
  };
  return (
    <aside className="announcement" aria-label="Comunicado de atualização">
      <Sparkles size={18} aria-hidden="true" className="announcement-icon" />
      <div>
        <strong>{latestAnnouncement.title}</strong>
        <p>{latestAnnouncement.summary}</p>
      </div>
      <div className="announcement-actions">
        <button type="button" className="btn small ghost" onClick={() => setOpen(true)}>
          Ver novidades
        </button>
        <button type="button" className="btn small primary" disabled={busy} onClick={acknowledge}>
          Entendi
        </button>
      </div>
      {open && <Details announcement={latestAnnouncement} onClose={() => setOpen(false)} />}
    </aside>
  );
}

export function AnnouncementHistory() {
  const [open, setOpen] = useState(null);
  return (
    <>
      <ul className="group">
        {announcements.map((announcement) => (
          <li key={announcement.version}>
            <button type="button" className="row" onClick={() => setOpen(announcement)}>
              <span className="row-main">
                <strong>Versão {announcement.version}</strong>
                <small>
                  {formatFull(announcement.date)}: {announcement.title}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <Details announcement={open} onClose={() => setOpen(null)} />}
    </>
  );
}
