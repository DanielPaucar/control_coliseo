"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type CodigoSummary = {
  id: number;
  codigo: string;
  tipo: "est" | "fam" | "vis";
  maxUsos: number;
  usosActual: number;
  disponibles: number;
  totalIngresos: number;
  ultimaLectura: string | null;
};

type PersonaData = {
  id: number;
  nombre: string;
  apellido: string | null;
  correo: string | null;
  cedula: string | null;
  tipo: "estudiante" | "familiar" | "visitante";
  codigos: CodigoSummary[];
};

type AlertState = { message: string; type: "success" | "error" | "info" } | null;

const TIPO_QR_LABELS: Record<CodigoSummary["tipo"], string> = {
  est: "Estudiante",
  fam: "Familiar",
  vis: "Visitante",
};

const PERSONA_LABELS: Record<PersonaData["tipo"], string> = {
  estudiante: "Estudiante",
  familiar: "Familiar",
  visitante: "Visitante",
};

const ALERT_STYLES = {
  success: "border-emerald-200 bg-emerald-50/90 text-emerald-800",
  error: "border-red-200 bg-red-50/90 text-red-700",
  info: "border-brand-secondary/30 bg-white/90 text-brand-primary",
} as const;

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "Sin lecturas";

export default function GestionQRPage() {
  const [cedula, setCedula] = useState("");
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [limitDrafts, setLimitDrafts] = useState<Record<number, string>>({});
  const [emailDrafts, setEmailDrafts] = useState<Record<number, string>>({});
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canEditLimits = role === "admin";
  const canResend = role === "admin" || role === "financiero";
  const headerSubtitle = canEditLimits
    ? "Busca asistentes por cédula, ajusta su capacidad de ingreso y reenvía los códigos por correo."
    : "Busca asistentes por cédula y reenvía los códigos por correo.";
  const codigosSubtitle = canEditLimits
    ? "Administra los límites de ingreso y reenvía los QR cuando sea necesario."
    : "Consulta los límites vigentes y reenvía los QR cuando sea necesario.";

  useEffect(() => {
    if (!alert) {
      return;
    }
    const timeout = setTimeout(() => setAlert(null), 5000);
    return () => clearTimeout(timeout);
  }, [alert]);

  const codigosOrdenados = useMemo(() => {
    if (!persona) return [];
    return [...persona.codigos].sort((a, b) => b.id - a.id);
  }, [persona]);

  const handleCedulaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D+/g, "").slice(0, 15);
    setCedula(digits);
  };

  const resetData = () => {
    setPersona(null);
    setLimitDrafts({});
    setEmailDrafts({});
  };

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canResend) {
      setAlert({ type: "error", message: "No tienes permisos para realizar esta acción." });
      return;
    }
    const normalized = cedula.trim();

    if (!normalized) {
      setAlert({ type: "error", message: "Ingresa una cédula para realizar la búsqueda." });
      return;
    }

    setIsSearching(true);
    setBusquedaRealizada(false);
    setAlert(null);

    try {
      const response = await fetch(`/api/gestion-qr?cedula=${encodeURIComponent(normalized)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        resetData();
        setBusquedaRealizada(true);
        setAlert({ type: "error", message: payload?.error || "No se pudo obtener la información del usuario." });
        return;
      }

      const personaData = payload?.persona as PersonaData | undefined;
      if (!personaData) {
        resetData();
        setBusquedaRealizada(true);
        setAlert({ type: "info", message: "No se encontraron códigos QR asociados a esta cédula." });
        return;
      }

      setPersona(personaData);
      setLimitDrafts(
        Object.fromEntries(personaData.codigos.map((codigo) => [codigo.id, String(codigo.maxUsos)]))
      );
      setEmailDrafts(
        Object.fromEntries(personaData.codigos.map((codigo) => [codigo.id, personaData.correo ?? ""]))
      );
      setBusquedaRealizada(true);
      setAlert({ type: "success", message: "Información cargada correctamente." });
    } catch (error) {
      console.error("Error buscando persona", error);
      resetData();
      setBusquedaRealizada(true);
      setAlert({ type: "error", message: "No se pudo consultar la información. Inténtalo nuevamente." });
    } finally {
      setIsSearching(false);
    }
  };

  const handleLimitChange = (codigoId: number, value: string) => {
    if (!canEditLimits) {
      return;
    }
    if (!/^\d*$/.test(value)) {
      return;
    }
    setLimitDrafts((prev) => ({ ...prev, [codigoId]: value }));
  };

  const handleEmailChange = (codigoId: number, value: string) => {
    setEmailDrafts((prev) => ({ ...prev, [codigoId]: value }));
  };

  const handleUpdateLimit = async (codigoId: number) => {
    if (!canEditLimits) {
      setAlert({ type: "error", message: "Solo los administradores pueden actualizar el número de entradas." });
      return;
    }
    const draft = limitDrafts[codigoId] ?? "";
    const numeric = Number(draft);

    if (!Number.isFinite(numeric) || numeric <= 0) {
      setAlert({ type: "error", message: "Ingresa un número válido de entradas." });
      return;
    }

    setUpdatingId(codigoId);
    setAlert(null);

    try {
      const response = await fetch("/api/gestion-qr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoId, maxUsos: numeric }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo actualizar el límite de entradas.");
      }

      const updated = payload?.codigo as CodigoSummary | undefined;
      if (updated) {
        setPersona((prev) =>
          prev
            ? {
                ...prev,
                codigos: prev.codigos.map((codigo) =>
                  codigo.id === updated.id ? { ...codigo, ...updated } : codigo
                ),
              }
            : prev
        );
        setLimitDrafts((prev) => ({ ...prev, [codigoId]: String(updated.maxUsos) }));
      }

      setAlert({ type: "success", message: "Número de entradas actualizado correctamente." });
    } catch (error) {
      console.error("Error actualizando límite", error);
      setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo actualizar el límite de entradas.",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResend = async (codigoId: number) => {
    if (!canResend) {
      setAlert({ type: "error", message: "No tienes permisos para reenviar QRs." });
      return;
    }
    const correo = (emailDrafts[codigoId] ?? "").trim() || (persona?.correo ?? "");

    if (!correo) {
      setAlert({ type: "error", message: "Ingresa un correo electrónico para reenviar el QR." });
      return;
    }

    setResendingId(codigoId);
    setAlert(null);

    try {
      const response = await fetch("/api/gestion-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend", codigoId, correo }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo reenviar el QR.");
      }

      setPersona((prev) => (prev ? { ...prev, correo } : prev));
      setEmailDrafts((prev) => ({
        ...prev,
        [codigoId]: correo,
      }));
      setAlert({ type: "success", message: "QR reenviado correctamente." });
    } catch (error) {
      console.error("Error reenviando QR", error);
      setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo reenviar el QR.",
      });
    } finally {
      setResendingId(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      {alert ? (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <div
            role="status"
            className={`pointer-events-auto inline-flex max-w-xl items-center rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg shadow-black/15 backdrop-blur ${ALERT_STYLES[alert.type]}`}
          >
            {alert.message}
          </div>
        </div>
      ) : null}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="card-surface flex flex-col gap-6 rounded-3xl px-8 py-10 text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-brand-secondary/10">
              <Image src="/iste-logo.png" alt="Eventos ISTE" fill sizes="64px" className="object-contain p-2" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-brand-accent/70">Eventos ISTE</p>
              <h1 className="text-3xl font-semibold text-brand-primary">Gestión de QR</h1>
              <p className="text-sm text-brand-accent/80">
                {headerSubtitle}
              </p>
            </div>
          </div>
        </header>

        <section className="card-surface rounded-3xl px-8 py-8 text-brand-primary shadow-lg shadow-black/10">
          <form onSubmit={handleSearch} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="cedula" className="text-sm font-semibold uppercase tracking-widest text-brand-accent/70">
                Buscar por cédula
              </label>
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  id="cedula"
                  name="cedula"
                  inputMode="numeric"
                  autoComplete="off"
                  value={cedula}
                  onChange={handleCedulaChange}
                  placeholder="Ej. 0102030405"
                  className="flex-1 rounded-2xl border border-brand-secondary/30 bg-white/90 px-4 py-3 text-base text-brand-primary shadow-inner focus:border-brand-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-primary/40 transition hover:bg-brand-secondary disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSearching ? "Buscando…" : "Buscar"}
                </button>
              </div>
              <p className="text-xs text-brand-accent/70">
                El sistema traerá todos los códigos asociados al titular registrado en la importación.
              </p>
            </div>
          </form>
        </section>

        {busquedaRealizada && !persona ? (
          <section className="rounded-3xl border border-white/20 bg-white/10 px-8 py-10 text-white shadow-lg shadow-black/10">
            <p className="text-base font-semibold">No se encontraron registros para la cédula consultada.</p>
            <p className="mt-2 text-sm text-white/80">
              Verifica la información ingresada o intenta con otra variación (sin guiones ni espacios).
            </p>
          </section>
        ) : null}

        {persona ? (
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/10 px-8 py-8 shadow-lg shadow-black/10 backdrop-blur">
              <h2 className="text-xl font-semibold text-white/90">Titular</h2>
              <div className="mt-4 grid gap-4 text-sm text-white/80 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Nombre</p>
                  <p className="text-base font-semibold text-white">
                    {persona.nombre} {persona.apellido ?? ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Cédula</p>
                  <p className="text-base font-semibold text-white">{persona.cedula ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Tipo de persona</p>
                  <p className="text-base font-semibold text-white">{PERSONA_LABELS[persona.tipo]}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Correo registrado</p>
                  <p className="text-base font-semibold text-white">{persona.correo ?? "Sin correo"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 px-8 py-8 shadow-lg shadow-black/10 backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white/90">Códigos asociados</h2>
                  <p className="text-sm text-white/70">{codigosSubtitle}</p>
                </div>
                <div className="rounded-2xl bg-brand-secondary/20 px-4 py-2 text-sm font-semibold text-white/90">
                  {persona.codigos.length} código{persona.codigos.length === 1 ? "" : "s"}
                </div>
              </div>

              {codigosOrdenados.length === 0 ? (
                <p className="mt-6 text-sm text-white/80">
                  No hay códigos asociados a este titular en la base de datos.
                </p>
              ) : (
                <div className="mt-6 space-y-6">
                  {codigosOrdenados.map((codigo) => {
                    const limitDraft = canEditLimits ? limitDrafts[codigo.id] ?? "" : String(codigo.maxUsos);
                    const correoDraft = emailDrafts[codigo.id] ?? persona.correo ?? "";
                    const limitDirty = canEditLimits && Number(limitDraft) !== codigo.maxUsos && limitDraft !== "";
                    return (
                      <article
                        key={codigo.id}
                        className="rounded-3xl border border-white/10 bg-brand-primary/10 px-6 py-6 shadow-inner shadow-black/10"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Código</p>
                            <p className="text-lg font-semibold text-white">{codigo.codigo}</p>
                          </div>
                          <div className="flex flex-wrap gap-4 text-sm text-white/80">
                            <span className="rounded-2xl bg-white/15 px-4 py-2 font-semibold text-white">
                              {TIPO_QR_LABELS[codigo.tipo]}
                            </span>
                            <span className="rounded-2xl bg-white/10 px-4 py-2">
                              Usos: {codigo.usosActual} / {codigo.maxUsos}
                            </span>
                            <span className="rounded-2xl bg-white/10 px-4 py-2">
                              Disponibles: {codigo.disponibles}
                            </span>
                            <span className="rounded-2xl bg-white/10 px-4 py-2">
                              Lecturas: {codigo.totalIngresos}
                            </span>
                          </div>
                        </div>
                        <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/50">
                          Última lectura: {formatDateTime(codigo.ultimaLectura)}
                        </p>

                        <div className="mt-6 grid gap-6 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                              Número de entradas permitidas
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                min={codigo.usosActual}
                                value={limitDraft}
                                onChange={(event) => handleLimitChange(codigo.id, event.target.value)}
                                disabled={!canEditLimits}
                                className={`w-full rounded-2xl border border-white/20 bg-white/90 px-4 py-3 text-sm text-brand-primary shadow-inner focus:border-brand-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary/40 ${
                                  canEditLimits ? "" : "cursor-not-allowed opacity-80"
                                }`}
                              />
                              {canEditLimits ? (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateLimit(codigo.id)}
                                  disabled={updatingId === codigo.id || !limitDraft || !limitDirty}
                                  className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-primary/30 transition hover:bg-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {updatingId === codigo.id ? "Guardando…" : "Actualizar"}
                                </button>
                              ) : null}
                            </div>
                            <p className="text-xs text-white/70">
                              {canEditLimits
                                ? `Debe ser al menos igual a los usos ya registrados (${codigo.usosActual}).`
                                : "Solo lectura. Para ajustes contacta a la Unidad de TEI."}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                              Reenviar QR por correo
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="email"
                                value={correoDraft}
                                onChange={(event) => handleEmailChange(codigo.id, event.target.value)}
                                placeholder="correo@ejemplo.com"
                                disabled={!canResend}
                                className={`w-full rounded-2xl border border-white/20 bg-white/90 px-4 py-3 text-sm text-brand-primary shadow-inner focus:border-brand-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary/40 ${
                                  canResend ? "" : "cursor-not-allowed opacity-80"
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleResend(codigo.id)}
                                disabled={!canResend || resendingId === codigo.id || !correoDraft.trim()}
                                className="inline-flex items-center justify-center rounded-2xl bg-brand-secondary px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-secondary/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {resendingId === codigo.id ? "Enviando…" : "Enviar"}
                              </button>
                            </div>
                            <p className="text-xs text-white/70">
                              {canResend
                                ? "Se enviará el mismo QR en formato PNG con la información registrada."
                                : "No tienes permisos para reenviar correos desde este módulo."}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
