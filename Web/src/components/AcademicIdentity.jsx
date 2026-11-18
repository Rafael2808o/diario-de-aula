import { useCallback, useEffect, useState } from "react";
import { IdCard } from "lucide-react";
import { useApp } from "../context.js";
import { FormError } from "../ui.jsx";

// Identificação acadêmica: nome completo e RA, usados só onde a faculdade pede (lista oficial de integrantes).
// O nome de exibição (apelido) do perfil social continua o mesmo. Fica na tabela academic_profiles (/sala/perfil),
// a mesma da Sala de Estudos; a agência salva lá é preservada a cada gravação.
export function useAcademicIdentity() {
  const { call } = useApp();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ fullName: "", ra: "" });
  useEffect(() => {
    call("/sala/perfil")
      .then((result) => {
        setProfile(result);
        setForm({ fullName: result.fullName || "", ra: result.ra || "" });
      })
      .catch(() => setProfile({ done: false, failed: true }));
  }, [call]);
  // Com nome a confirmar, salvar o mesmo nome também conta: é a confirmação.
  const changed = Boolean(profile) && (Boolean(profile.needsReview) || form.fullName.trim() !== (profile.fullName || "") || form.ra.trim() !== (profile.ra || ""));
  const save = useCallback(async () => {
    const body = { fullName: form.fullName.trim(), ra: form.ra.trim(), hasAgency: Boolean(profile?.hasAgency), agency: (profile?.agency || []).map((person) => person.id) };
    const saved = await call("/sala/perfil", { method: "PUT", body });
    setProfile(saved);
    return saved;
  }, [call, form, profile]);
  return { profile, form, setForm, changed, save };
}

export function AcademicIdentityFields({ identity }) {
  const { user } = useApp();
  const { form, setForm, profile } = identity;
  return (
    <>
      {profile?.needsReview && (
        <p className="notice">
          O nome completo salvo é igual ao seu nome de exibição (“{user.name}”). Se não for o nome que está na sua matrícula, corrija abaixo: é ele que vai para a lista oficial dos trabalhos.
        </p>
      )}
      <div className="form-row">
        <label>
          Nome completo
          <input value={form.fullName} maxLength={120} autoComplete="name" placeholder="Como está na matrícula" onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        </label>
        <label>
          RA (registro acadêmico)
          <input value={form.ra} maxLength={30} inputMode="text" placeholder="Ex.: 2024012345" onChange={(event) => setForm({ ...form, ra: event.target.value })} />
        </label>
      </div>
      <p className="hint">
        <IdCard size={13} aria-hidden="true" /> Usado só na lista oficial de integrantes da Sala de Estudos. Na Comunidade, no Ranking e no Feed continua aparecendo “{user.name}”.
      </p>
    </>
  );
}

// Seção completa, com botão próprio (Configurações).
export default function AcademicIdentity() {
  const { toast } = useApp();
  const identity = useAcademicIdentity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!identity.profile) return <p className="hint">Carregando…</p>;
  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
          await identity.save();
          toast("Nome completo e RA salvos.");
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <AcademicIdentityFields identity={identity} />
      <FormError>{error}</FormError>
      <div className="form-actions">
        <button className="btn primary" disabled={busy || !identity.changed || identity.form.fullName.trim().length < 3}>
          {busy ? "Salvando..." : identity.profile.needsReview ? "Confirmar nome e RA" : "Salvar nome e RA"}
        </button>
      </div>
    </form>
  );
}
