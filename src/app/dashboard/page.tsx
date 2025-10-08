"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type AggregatedIngreso = {
  codigo: string;
  tipo: "est" | "fam" | "vis";
  usosActual: number;
  maxUsos: number | null;
  totalIngresos: number;
  ultimaLectura: string;
  persona: string | null;
  esAdicional: boolean;
};

type DashboardData = {
  total: number;
  estudiantes: number;
  familiares: number;
  adicionales: number;
  ingresosAgrupados: AggregatedIngreso[];
  selectedDate: string | null;
  totalHoy: number;
};

const CHART_COLORS = ["#003976", "#29598c", "#00a6f2"];

function LoadingIndicator() {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      <p className="text-lg font-medium">Cargando estadísticas…</p>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : "";

    setIsLoading(true);
    setError(null);

    fetch(`/api/dashboard${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("No se pudieron cargar los datos del dashboard");
        }
        return response.json();
      })
      .then((payload: DashboardData) => {
        setData(payload);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error(err);
        setError("Ocurrió un problema al cargar la información. Inténtalo nuevamente.");
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [selectedDate]);

  const chartData = useMemo(
    () => [
      { name: "Estudiantes", value: data?.estudiantes ?? 0 },
      { name: "Familiares", value: data?.familiares ?? 0 },
      { name: "Entradas adicionales", value: data?.adicionales ?? 0 },
    ],
    [data?.estudiantes, data?.familiares, data?.adicionales]
  );

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long" }),
    []
  );

  const hasData = (data?.total ?? 0) > 0;

  const formatUso = (ingreso: AggregatedIngreso) => {
    const max = ingreso.maxUsos ?? Infinity;
    const limite = Number.isFinite(max) ? String(max) : "∞";
    return `${ingreso.usosActual}/${limite}`;
  };

  const tipoLabel = (ingreso: AggregatedIngreso) => {
    if (ingreso.esAdicional) return "Entrada adicional";
    if (ingreso.tipo === "est") return "Estudiante";
    return "Familiar";
  };

  if (!data && isLoading) {
    return (
      <main className="min-h-screen bg-brand-gradient text-white">
        <div className="flex min-h-screen items-center justify-center">
          <LoadingIndicator />
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="card-surface flex flex-col gap-6 rounded-3xl px-8 py-10 text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-brand-secondary/10">
              <Image src="/iste-logo.png" alt="Eventos ISTE" fill sizes="64px" className="object-contain p-2" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-brand-accent/70">Eventos ISTE</p>
              <h1 className="text-3xl font-semibold text-brand-primary">Dashboard operativo</h1>
              <p className="text-sm text-brand-accent/80">
                Visualiza el flujo de asistentes, los tipos de códigos emitidos y el histórico más reciente de ingresos.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-brand-secondary/10 px-5 py-3 text-sm text-brand-primary md:items-end">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-accent/60">
              <span>Filtro por día</span>
              <span className="h-2 w-2 rounded-full bg-brand-secondary" aria-hidden />
              <span>{selectedDate ? new Date(selectedDate).toLocaleDateString() : "Todo el periodo"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="rounded-xl border border-brand-secondary/30 bg-white/80 px-3 py-2 text-brand-primary shadow-inner focus:border-brand-secondary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSelectedDate("")}
                disabled={!selectedDate}
                className="rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ver todo
              </button>
            </div>
            <p className="font-semibold text-brand-primary">
              {data ? `${data.total} asistentes detectados` : "Sin registros"}
            </p>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white/90">Indicadores generales</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="card-surface rounded-3xl px-6 py-6 text-brand-primary">
              <p className="text-xs uppercase tracking-[0.32em] text-brand-accent/70">Asistentes hoy</p>
              <p className="mt-2 text-3xl font-semibold">{data?.totalHoy ?? 0}</p>
              <p className="text-xs text-brand-accent/70">Registros únicos del {todayLabel}</p>
            </article>
            <article className="card-surface rounded-3xl px-6 py-6 text-brand-primary">
              <p className="text-xs uppercase tracking-[0.32em] text-brand-accent/70">Estudiantes</p>
              <p className="mt-2 text-3xl font-semibold">{data?.estudiantes ?? 0}</p>
              <p className="text-xs text-brand-accent/70">Primer ingreso por cada QR de estudiante</p>
            </article>
            <article className="card-surface rounded-3xl px-6 py-6 text-brand-primary">
              <p className="text-xs uppercase tracking-[0.32em] text-brand-accent/70">Familiares</p>
              <p className="mt-2 text-3xl font-semibold">{data?.familiares ?? 0}</p>
              <p className="text-xs text-brand-accent/70">Ingresos adicionales asociados a estudiantes o QR familiares</p>
            </article>
            <article className="card-surface rounded-3xl px-6 py-6 text-brand-primary">
              <p className="text-xs uppercase tracking-[0.32em] text-brand-accent/70">Entradas adicionales</p>
              <p className="mt-2 text-3xl font-semibold">{data?.adicionales ?? 0}</p>
              <p className="text-xs text-brand-accent/70">Usuarios registrados con QR de venta adicional</p>
            </article>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="card-surface flex flex-col gap-6 rounded-3xl px-8 py-10 text-brand-primary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Distribución de códigos</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-secondary/10 px-3 py-1 text-xs font-medium text-brand-secondary">
                  Última actualización: {new Date().toLocaleDateString()}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={120} label>
                  {chartData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255,255,255,0.95)",
                    borderRadius: 12,
                    border: "1px solid rgba(0,57,118,0.08)",
                    color: "#0b1d33",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {!hasData && !isLoading && (
              <p className="text-center text-sm text-brand-accent/70">
                No existen ingresos registrados para la fecha seleccionada.
              </p>
            )}
            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}
          </div>

          <aside className="card-surface flex flex-col gap-5 rounded-3xl px-6 py-8 text-brand-primary">
            <h2 className="text-xl font-semibold">Ingresos agrupados por QR</h2>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {isLoading && <p className="text-sm text-brand-accent/70">Actualizando información…</p>}
            {!isLoading && (data?.ingresosAgrupados.length ?? 0) === 0 && (
              <p className="text-sm text-brand-accent/70">No hay ingresos que mostrar para este período.</p>
            )}
            <ul className="space-y-3 text-sm text-brand-accent">
              {data?.ingresosAgrupados.map((ingreso) => (
                <li
                  key={ingreso.codigo}
                  className="flex flex-col gap-1 rounded-2xl border border-brand-secondary/20 bg-white/80 px-4 py-3"
                >
                  <div className="flex items-center justify-between text-brand-primary">
                    <span className="font-semibold">{ingreso.codigo}</span>
                    <span className="text-xs font-semibold text-brand-secondary">{formatUso(ingreso)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-accent/70">
                    <span className="rounded-full bg-brand-secondary/10 px-2 py-1 uppercase tracking-wide text-brand-secondary">
                      {tipoLabel(ingreso)}
                    </span>
                    <span>{new Date(ingreso.ultimaLectura).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-brand-accent/60">
                    {ingreso.persona && <span>Asignado a {ingreso.persona}</span>}
                    {ingreso.esAdicional && (
                      <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-brand-primary">Entrada adicional</span>
                    )}
                    <span className="text-brand-primary/70">{ingreso.totalIngresos} ingreso(s) registrados</span>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
