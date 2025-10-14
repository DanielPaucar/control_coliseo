"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type StatsSnapshot = {
  personas: number;
  codigos: number;
  ingresos: number;
  importaciones: number;
  ventas: number;
  cajas: number;
};

type DirectoryReport = {
  path: string;
  exists: boolean;
  files: number;
  bytes: number;
  error?: string;
};

type DirectoryCleanupResult = DirectoryReport & {
  deletedFiles: number;
  deletedBytes: number;
};

type CleanupResponse = {
  success: true;
  timestamp: string;
  database: {
    before: StatsSnapshot;
    removed: StatsSnapshot;
    after: StatsSnapshot;
  };
  directories: {
    before: DirectoryReport[];
    cleaned: DirectoryCleanupResult[];
    after: DirectoryReport[];
  };
};

const NUMBER_FORMAT = new Intl.NumberFormat("es-EC");
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-EC", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value < 10 && exponent > 0 ? 2 : 1)} ${units[exponent]}`;
}

const STAT_LABELS: Array<{ key: keyof StatsSnapshot; label: string }> = [
  { key: "personas", label: "Personas" },
  { key: "codigos", label: "Códigos QR" },
  { key: "ingresos", label: "Ingresos" },
  { key: "importaciones", label: "Importaciones" },
  { key: "ventas", label: "Ventas adicionales" },
  { key: "cajas", label: "Cajas" },
];

const DEFAULT_CONFIRMATION = "LIMPIAR TODO";

export default function LimpiezaPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [directories, setDirectories] = useState<DirectoryReport[]>([]);
  const [confirmationToken, setConfirmationToken] = useState<string>(DEFAULT_CONFIRMATION);
  const [confirmation, setConfirmation] = useState("");
  const [lastCleanupAt, setLastCleanupAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CleanupResponse | null>(null);

  const canManage = role === "admin";
  const confirmationValid = confirmation.trim() === confirmationToken;

  const totalRecords = useMemo(() => {
    if (!stats) return 0;
    return STAT_LABELS.reduce((acc, item) => acc + (stats[item.key] ?? 0), 0);
  }, [stats]);

  const totalFreed = useMemo(() => {
    if (!result) return { records: 0, bytes: 0, files: 0 };
    const records = STAT_LABELS.reduce(
      (acc, item) => acc + (result.database.removed[item.key] ?? 0),
      0
    );
    const files = result.directories.cleaned.reduce((acc, dir) => acc + dir.deletedFiles, 0);
    const bytes = result.directories.cleaned.reduce((acc, dir) => acc + dir.deletedBytes, 0);
    return { records, files, bytes };
  }, [result]);

  const lastCleanupLabel = lastCleanupAt
    ? DATE_TIME_FORMAT.format(new Date(lastCleanupAt))
    : "Sin registros previos";

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/limpieza", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo obtener el estado actual.");
      }
      setStats(data.stats ?? null);
      setDirectories(Array.isArray(data.directories) ? data.directories : []);
      setLastCleanupAt(data.lastCleanupAt ?? null);
      setConfirmationToken(data.confirmationToken ?? DEFAULT_CONFIRMATION);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && canManage) {
      void loadStatus();
    }
  }, [status, canManage, loadStatus]);

  const handleCleanup = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/limpieza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo completar la limpieza.");
      }

      const payload = data as CleanupResponse;
      setResult(payload);
      setStats(payload.database.after);
      setDirectories(payload.directories.after);
      setLastCleanupAt(payload.timestamp);
      setConfirmation("");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo completar la limpieza.");
    } finally {
      setRunning(false);
    }
  }, [confirmation]);

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-brand-gradient text-white">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-lg font-medium">Cargando acceso…</p>
        </div>
      </main>
    );
  }

  if (!session || !canManage) {
    return (
      <main className="min-h-screen bg-brand-gradient text-white">
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <p className="text-2xl font-semibold">Acceso restringido</p>
          <p className="mt-2 max-w-md text-sm text-white/80">
            Este módulo solo está disponible para cuentas con rol administrador. Solicita permisos al
            equipo de TI si necesitas ejecutar una limpieza general.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="card-surface flex flex-col gap-4 rounded-3xl px-8 py-10 text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-brand-accent/60">Mantenimiento</p>
            <h1 className="text-3xl font-semibold text-brand-primary">Limpieza de datos</h1>
            <p className="text-sm text-brand-accent/80">
              Elimina registros históricos (personas, códigos, ingresos, importaciones y ventas adicionales)
              y limpia carpetas de archivos temporales asociados al evento.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl bg-brand-secondary/10 px-5 py-4 text-sm text-brand-primary">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-accent/60">Última ejecución</p>
            <p className="text-base font-semibold text-brand-primary">{lastCleanupLabel}</p>
            <p className="text-xs text-brand-accent/70">
              Registros actuales: {NUMBER_FORMAT.format(totalRecords)} • Directorios monitoreados:{" "}
              {directories.length}
            </p>
          </div>
        </header>

        {error ? (
          <div className="card-surface rounded-3xl border border-red-200 bg-red-50/70 px-6 py-5 text-sm font-medium text-red-800 shadow-lg shadow-red-500/10">
            {error}
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white/90">Estado actual</h2>
            <button
              type="button"
              onClick={() => loadStatus()}
              disabled={loading || running}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow shadow-black/20 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Actualizar
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {STAT_LABELS.map((item) => (
              <article
                key={item.key}
                className="card-surface rounded-3xl px-6 py-5 text-brand-primary shadow-lg shadow-black/10"
              >
                <p className="text-xs uppercase tracking-[0.28em] text-brand-accent/60">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold">
                  {NUMBER_FORMAT.format(stats?.[item.key] ?? 0)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white/90">Carpetas monitoreadas</h2>
          <div className="card-surface overflow-hidden rounded-3xl text-brand-primary shadow-lg shadow-black/10">
            <div className="hidden grid-cols-[2fr_1fr_1fr] bg-brand-secondary/10 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent/60 md:grid">
              <span>Ruta</span>
              <span>Archivos</span>
              <span>Tamaño</span>
            </div>
            <div className="divide-y divide-brand-secondary/15">
              {directories.length === 0 ? (
                <p className="px-6 py-5 text-sm text-brand-accent/70">Sin carpetas configuradas.</p>
              ) : (
                directories.map((dir) => (
                  <div
                    key={dir.path}
                    className="grid grid-cols-1 gap-2 px-6 py-5 text-sm md:grid-cols-[2fr_1fr_1fr]"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-brand-primary">{dir.path}</p>
                      <p className="text-xs text-brand-accent/70">
                        {dir.exists ? "Monitoreo activo" : "No encontrado"}
                        {dir.error ? ` · ${dir.error}` : ""}
                      </p>
                    </div>
                    <p className="text-brand-primary/80 md:text-center">
                      {dir.exists ? NUMBER_FORMAT.format(dir.files) : "-"}
                    </p>
                    <p className="text-brand-primary/80 md:text-center">
                      {dir.exists ? formatBytes(dir.bytes) : "-"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-white/90">Confirmación de limpieza</h2>
            <p className="max-w-3xl text-sm text-white/80">
              Esta acción eliminará definitivamente los registros del evento y vaciará las carpetas indicadas.
              Escriba <span className="font-semibold">{confirmationToken}</span> para confirmar y luego presiona
              ejecutar.
            </p>
          </div>
          <div className="card-surface flex flex-col gap-4 rounded-3xl px-6 py-6 text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-center md:justify-between">
            <input
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={confirmationToken}
              className="w-full rounded-2xl border border-brand-secondary/30 bg-white/80 px-4 py-3 text-sm text-brand-primary shadow-inner focus:border-brand-secondary focus:outline-none md:max-w-sm"
            />
            <button
              type="button"
              onClick={handleCleanup}
              disabled={!confirmationValid || running}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-primary/30 transition hover:bg-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? "Ejecutando limpieza…" : "Ejecutar limpieza total"}
            </button>
          </div>
        </section>

        {result ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white/90">Resumen de la última ejecución</h2>
            <div className="card-surface space-y-4 rounded-3xl px-6 py-6 text-brand-primary shadow-lg shadow-black/10">
              <p className="text-sm text-brand-accent/80">
                Limpieza completada el {DATE_TIME_FORMAT.format(new Date(result.timestamp))}.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-brand-secondary/10 px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-brand-accent/60">Registros eliminados</p>
                  <p className="mt-2 text-2xl font-semibold text-brand-primary">
                    {NUMBER_FORMAT.format(totalFreed.records)}
                  </p>
                  <p className="text-xs text-brand-accent/70">
                    Personas: {result.database.removed.personas} · Códigos: {result.database.removed.codigos} ·
                    Ingresos: {result.database.removed.ingresos}
                  </p>
                </div>
                <div className="rounded-2xl bg-brand-secondary/10 px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-brand-accent/60">Archivos depurados</p>
                  <p className="mt-2 text-2xl font-semibold text-brand-primary">
                    {NUMBER_FORMAT.format(totalFreed.files)} ({formatBytes(totalFreed.bytes)})
                  </p>
                  <p className="text-xs text-brand-accent/70">
                    Incluye PDFs, XML y temporales en las rutas configuradas.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-brand-primary">Detalle por carpeta</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {result.directories.cleaned.map((dir) => (
                    <div key={dir.path} className="rounded-2xl border border-brand-secondary/20 px-4 py-3 text-sm">
                      <p className="font-semibold text-brand-primary">{dir.path}</p>
                      <p className="text-xs text-brand-accent/70">
                        Archivos eliminados: {NUMBER_FORMAT.format(dir.deletedFiles)} · Espacio liberado:{" "}
                        {formatBytes(dir.deletedBytes)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
