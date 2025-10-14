"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type CajaState = {
  id: number;
  abierto: boolean;
  abiertoPor: string | null;
  abiertoAt: string;
  totalTickets: number;
  totalRecaudado: number;
};

type HistorialVenta = {
  id: number;
  codigo: string;
  precio: number;
  cantidad: number;
  total: number;
  correo: string | null;
  enviadoPorCorreo: boolean;
  createdAt: string;
  cajaId: number;
};

type ClosureSummary = {
  id: number;
  abiertoPor: string | null;
  cerradoPor: string | null;
  abiertoAt: string;
  cerradoAt: string | null;
  totalTickets: number;
  totalRecaudado: number;
};

type ClosureDetail = {
  summary: {
    id: number;
    abiertoPor: string | null;
    cerradoPor: string | null;
    abiertoAt: string;
    cerradoAt: string | null;
    totalBoletos: number;
    totalRecaudado: number;
  };
  ventas: {
    id: number;
    codigo: string;
    cantidad: number;
    precio: number;
    total: number;
    correo: string | null;
    enviadoPorCorreo: boolean;
    createdAt: string;
  }[];
};

const currency = (value: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value ?? 0);

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "-";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return fallback;
};

const TOAST_VARIANTS = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-brand-secondary/30 bg-white/90 text-brand-primary",
} satisfies Record<"ok" | "error" | "info", string>;

function ToastNotification({
  message,
  type,
}: {
  message: string;
  type: "ok" | "error" | "info";
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto inline-flex max-w-xs items-center justify-between rounded-2xl border px-5 py-3 text-sm font-semibold shadow-lg shadow-black/20 backdrop-blur transition ${TOAST_VARIANTS[type]}`}
    >
      {message}
    </div>
  );
}

export default function GenerarVisitantesPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  const [loading, setLoading] = useState(true);
  const [precioUnitario, setPrecioUnitario] = useState(5);
  const [precioDraft, setPrecioDraft] = useState("5");
  const [precioSaving, setPrecioSaving] = useState(false);

  const [caja, setCaja] = useState<CajaState | null>(null);
  const [cajaOperation, setCajaOperation] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closuresOpen, setClosuresOpen] = useState(false);
  const [closuresLoading, setClosuresLoading] = useState(false);

  const [cantidad, setCantidad] = useState(1);
  const [correo, setCorreo] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeTipo, setMensajeTipo] = useState<"ok" | "error" | "info">("info");
  const [generando, setGenerando] = useState(false);
  const [historial, setHistorial] = useState<HistorialVenta[]>([]);
  const [closures, setClosures] = useState<ClosureSummary[]>([]);
  const [detailsModal, setDetailsModal] = useState<ClosureDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClosureSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [limiteBoletos, setLimiteBoletos] = useState<number>(0);
  const [limiteDraft, setLimiteDraft] = useState("0");
  const [limiteSaving, setLimiteSaving] = useState(false);
  const [totalVendidos, setTotalVendidos] = useState(0);
  const [openCajasModal, setOpenCajasModal] = useState(false);
  const [openCajas, setOpenCajas] = useState<CajaState[]>([]);
  const [openCajasLoading, setOpenCajasLoading] = useState(false);
  const [forceClosingId, setForceClosingId] = useState<number | null>(null);

  const puedeEditarPrecio = role === "admin";
  const puedeEditarLimite = role === "admin";
  const cajaAbierta = caja?.abierto ?? false;
  const correoValido = correo.trim().length > 0;
  const canManageClosures = role === "admin";
  const canViewClosures = canManageClosures || role === "finance" || role === "financiero";
  const limiteDisponible = useMemo(() => {
    if (!limiteBoletos || limiteBoletos <= 0) {
      return null;
    }
    return Math.max(limiteBoletos - totalVendidos, 0);
  }, [limiteBoletos, totalVendidos]);

  useEffect(() => {
    if (!mensaje) {
      return;
    }

    const timeout = setTimeout(() => {
      setMensaje(null);
    }, 4500);

    return () => {
      clearTimeout(timeout);
    };
  }, [mensaje]);

  const cargarEstado = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/generar-visitantes", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo obtener el estado");
      }
      setPrecioUnitario(data.precioUnitario ?? 5);
      setPrecioDraft(String(data.precioUnitario ?? 5));
      setCaja(data.caja ?? null);
      setHistorial(data.historial ?? []);
      setClosures(data.closures ?? []);
      setLimiteBoletos(data.limiteBoletos ?? 0);
      setLimiteDraft(String(data.limiteBoletos ?? 0));
      setTotalVendidos(data.totalVendidos ?? 0);
      if (data.warning) {
        setMensaje((prev) => prev ?? data.warning);
        setMensajeTipo((prev) => (prev === "error" ? prev : "info"));
      }
    } catch (error: unknown) {
      console.error(error);
      setMensaje(getErrorMessage(error, "No se pudo cargar el estado inicial"));
      setMensajeTipo("error");
    } finally {
      setLoading(false);
    }
  };

  const refreshClosures = async () => {
    if (!canViewClosures) {
      return;
    }
    setClosuresLoading(true);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "closures" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron cargar los cierres");
      }
      if (data && Array.isArray(data.closures)) {
        setClosures(data.closures);
      }
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "No se pudieron cargar los cierres"));
      setMensajeTipo("error");
    } finally {
      setClosuresLoading(false);
    }
  };

  const handleOpenClosures = () => {
    if (!canViewClosures) {
      return;
    }
    setClosuresOpen(true);
    void refreshClosures();
  };

  const handleOpenPendingCajas = () => {
    if (!canManageClosures) {
      return;
    }
    setOpenCajasModal(true);
    setOpenCajasLoading(true);
    setOpenCajas([]);
    void (async () => {
      try {
        const response = await fetch("/api/generar-visitantes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "openSessions" }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "No se pudieron obtener las cajas abiertas");
        }
        if (data && Array.isArray(data.abiertas)) {
          setOpenCajas(data.abiertas);
        } else {
          setOpenCajas([]);
        }
      } catch (error: unknown) {
        setMensaje(getErrorMessage(error, "No se pudieron obtener las cajas abiertas"));
        setMensajeTipo("error");
      } finally {
        setOpenCajasLoading(false);
      }
    })();
  };

  useEffect(() => {
    cargarEstado();
  }, []);

  const handleAbrirCaja = async () => {
    setCajaOperation(true);
    setMensaje(null);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo abrir la caja");
      }
      setCaja(data.caja ?? null);
      setMensaje("Caja abierta correctamente");
      setMensajeTipo("ok");
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "No se pudo abrir la caja"));
      setMensajeTipo("error");
    } finally {
      setCajaOperation(false);
    }
  };

  const confirmarCerrarCaja = async () => {
    setConfirmingClose(true);
    setMensaje(null);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo cerrar la caja");
      }
      setConfirmCloseOpen(false);
      setMensaje("Caja cerrada y reporte enviado");
      setMensajeTipo("ok");
      await cargarEstado();
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "No se pudo cerrar la caja"));
      setMensajeTipo("error");
    } finally {
      setConfirmingClose(false);
    }
  };

  const handleCerrarCaja = () => {
    if (!cajaAbierta) return;
    setMensaje(null);
    setConfirmCloseOpen(true);
  };

  const handleGuardarPrecio = async () => {
    if (!puedeEditarPrecio) return;
    const valor = Number(precioDraft);
    if (!Number.isFinite(valor) || valor < 0) {
      setMensaje("Ingresa un precio válido");
      setMensajeTipo("error");
      return;
    }

    setPrecioSaving(true);
    setMensaje(null);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updatePrice", precio: valor }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el precio");
      }
      setPrecioUnitario(data.precioUnitario ?? valor);
      setPrecioDraft(String(data.precioUnitario ?? valor));
      setMensaje("Precio actualizado");
      setMensajeTipo("ok");
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "Error actualizando el precio"));
      setMensajeTipo("error");
    } finally {
      setPrecioSaving(false);
    }
  };

  const handleGuardarLimite = async () => {
    if (!puedeEditarLimite) return;
    const valor = Number(limiteDraft);
    if (!Number.isFinite(valor) || valor < 0) {
      setMensaje("Ingresa un límite válido (0 o mayor). Usa 0 para sin límite.");
      setMensajeTipo("error");
      return;
    }

    setLimiteSaving(true);
    setMensaje(null);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateLimit", limite: valor }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el límite");
      }
      const limite = data.limiteBoletos ?? Math.floor(valor);
      setLimiteBoletos(limite);
      setLimiteDraft(String(limite));
      setMensaje("Límite de boletos actualizado");
      setMensajeTipo("ok");
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "Error actualizando el límite"));
      setMensajeTipo("error");
    } finally {
      setLimiteSaving(false);
    }
  };

  const generarCodigos = async (modo: "pdf" | "correo") => {
    if (!cajaAbierta) {
      setMensaje("Debes abrir la caja antes de generar QR");
      setMensajeTipo("error");
      return;
    }

    if (!cantidad || cantidad <= 0) {
      setMensaje("La cantidad debe ser mayor a 0");
      setMensajeTipo("error");
      return;
    }

    if (modo === "correo" && !correoValido) {
      setMensaje("Ingresa un correo para enviar los QR");
      setMensajeTipo("error");
      return;
    }

    setGenerando(true);
    setMensaje(null);

    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          cantidad,
          correo: correoValido ? correo.trim() : undefined,
          sendEmail: modo === "correo",
        }),
      });

      if (!response.ok) {
        const maybeJson = await response.json().catch(() => null);
        throw new Error(maybeJson?.error || "No se pudo generar el QR");
      }

      if (modo === "correo") {
        await response.json();
        setMensaje(`Se envió el boleto para ${cantidad} persona(s) a ${correo.trim()}`);
        setMensajeTipo("ok");
        setCorreo("");
      } else {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `qr-adicional-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setMensaje(`Se generó el PDF con ${cantidad} persona(s) autorizadas.`);
        setMensajeTipo("ok");
      }

      await cargarEstado();
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "Error al generar los QR"));
      setMensajeTipo("error");
    } finally {
      setGenerando(false);
    }
  };

  const fetchClosureDetails = async (closure: ClosureSummary) => {
    if (!canViewClosures) {
      return;
    }
    setDetailsLoading(true);
    setDetailsModal(null);
    setMensaje(null);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "details", cajaId: closure.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo obtener el detalle");
      }
      setDetailsModal(data);
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "No se pudo obtener el detalle del cierre"));
      setMensajeTipo("error");
    } finally {
      setDetailsLoading(false);
    }
  };

  const deleteClosure = async () => {
    if (!canManageClosures || !deleteTarget) return;
    setDeleteLoading(true);
    setMensaje(null);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteClosure", cajaId: deleteTarget.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar el cierre");
      }
      setMensaje("Cierre eliminado correctamente");
      setMensajeTipo("ok");
      setClosures((prev) => prev.filter((closure) => closure.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "No se pudo eliminar el cierre"));
      setMensajeTipo("error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const forceCloseCaja = async (cajaId: number) => {
    if (!canManageClosures) {
      return;
    }
    setForceClosingId(cajaId);
    setMensaje(null);
    try {
      const response = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forceClose", cajaId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cerrar la caja seleccionada");
      }
      await cargarEstado();
      setOpenCajas((prev) => prev.filter((caja) => caja.id !== cajaId));
      setMensaje("Caja cerrada manualmente y reporte enviado.");
      setMensajeTipo("ok");
    } catch (error: unknown) {
      setMensaje(getErrorMessage(error, "No se pudo cerrar la caja seleccionada"));
      setMensajeTipo("error");
    } finally {
      setForceClosingId(null);
    }
  };

  const resumenCaja = useMemo(() => {
    if (!caja) {
      return {
        estado: "Caja cerrada",
        detalle: "Abre la caja para comenzar a emitir boletos",
      };
    }
    return {
      estado: caja.abierto ? "Caja abierta" : "Caja cerrada",
      detalle: caja.abierto
        ? `Boletos emitidos: ${caja.totalTickets} · Recaudado: ${currency(caja.totalRecaudado)}`
        : `Última sesión: ${currency(caja.totalRecaudado)} recaudados en ${caja.totalTickets} boletos`,
    };
  }, [caja]);

  const totalActual = useMemo(() => currency(precioUnitario * cantidad), [precioUnitario, cantidad]);

  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
        <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-6">
          <div className="card-surface rounded-3xl px-6 py-6 text-brand-primary">
            <p className="text-sm font-medium">Cargando módulo de caja…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {mensaje && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[1200] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-3 px-4">
          <ToastNotification message={mensaje} type={mensajeTipo} />
        </div>
      )}
      <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
        <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-6">
        {confirmCloseOpen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
            <div className="card-surface w-full max-w-lg rounded-3xl px-6 py-6 text-brand-primary">
              <h2 className="text-2xl font-semibold">Confirmar cierre de caja</h2>
              <p className="mt-3 text-sm text-brand-accent/80">
                Se emitieron <strong>{caja?.totalTickets ?? 0}</strong> boletos por un total de
                <strong> {currency(caja?.totalRecaudado ?? 0)}</strong>.
              </p>
              <p className="mt-2 text-sm text-brand-accent/80">
                Al confirmar, se enviará un reporte PDF a
                <strong> alexis.veloz@iste.edu.ec</strong> y <strong>soporte.ti@iste.edu.ec</strong>.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-4">
                <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3 text-sm text-brand-accent/80">
                  <p>Total boletos: <span className="font-semibold text-brand-primary">{caja?.totalTickets ?? 0}</span></p>
                </div>
                <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3 text-sm text-brand-accent/80">
                  <p>Total recaudado: <span className="font-semibold text-brand-primary">{currency(caja?.totalRecaudado ?? 0)}</span></p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-secondary/20 px-4 py-2 text-sm font-medium text-brand-primary transition hover:bg-brand-secondary/10"
                  onClick={() => setConfirmCloseOpen(false)}
                  disabled={confirmingClose}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={confirmarCerrarCaja}
                  disabled={confirmingClose}
                >
                  {confirmingClose ? "Cerrando caja…" : "Confirmar cierre"}
                </button>
              </div>
            </div>
          </div>
        )}

        {openCajasModal && (
          <div className="fixed inset-0 z-35 flex items-center justify-center bg-black/45 px-4">
            <div className="card-surface w-full max-w-3xl rounded-3xl px-6 py-6 text-brand-primary">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Cajas abiertas pendientes</h2>
                  <p className="mt-1 text-sm text-brand-accent/80">
                    Cierra las cajas que quedaron abiertas para garantizar la consistencia de los reportes.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-brand-secondary/20 p-2 text-brand-accent/70 transition hover:bg-brand-secondary/10 hover:text-brand-primary"
                  onClick={() => setOpenCajasModal(false)}
                >
                  <span className="sr-only">Cerrar</span>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" strokeWidth={1.8} fill="none">
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              </div>
              <div className="mt-5 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {openCajasLoading ? (
                  <p className="text-sm text-brand-accent/80">Cargando cajas abiertas…</p>
                ) : openCajas.length === 0 ? (
                  <p className="text-sm text-brand-accent/80">No hay cajas abiertas en este momento.</p>
                ) : (
                  openCajas.map((cajaAbierta) => {
                    const fecha = formatDateTime(cajaAbierta.abiertoAt);
                    return (
                      <article
                        key={cajaAbierta.id}
                        className="rounded-2xl border border-brand-secondary/20 bg-white/80 px-5 py-5 shadow-inner"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-brand-primary">Caja #{cajaAbierta.id}</p>
                            <p className="text-xs uppercase tracking-[0.3em] text-brand-accent/70">
                              Abierta por {cajaAbierta.abiertoPor ?? "—"} · {fecha}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => forceCloseCaja(cajaAbierta.id)}
                            disabled={forceClosingId === cajaAbierta.id}
                          >
                            {forceClosingId === cajaAbierta.id ? "Cerrando…" : "Cerrar caja"}
                          </button>
                        </div>
                        <div className="mt-3 grid gap-3 text-sm text-brand-accent/80 sm:grid-cols-2">
                          <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-brand-accent/70">Boletos emitidos</p>
                            <p className="text-lg font-semibold text-brand-primary">{cajaAbierta.totalTickets}</p>
                          </div>
                          <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-brand-accent/70">Total recaudado</p>
                            <p className="text-lg font-semibold text-brand-primary">
                              {currency(cajaAbierta.totalRecaudado)}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {closuresOpen && (
          <div className="fixed inset-0 z-35 flex items-center justify-center bg-black/45 px-4">
            <div className="card-surface w-full max-w-5xl rounded-3xl px-6 py-6 text-brand-primary">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Cierres anteriores</h2>
                  <p className="text-sm text-brand-accent/80">
                    Consulta los cierres previos para revisar detalles o limpiar registros erróneos.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-secondary/20 px-4 py-2 text-sm font-medium text-brand-primary transition hover:bg-brand-secondary/10"
                  onClick={() => setClosuresOpen(false)}
                >
                  Cerrar
                </button>
              </div>
              <div className="mt-6 max-h-[65vh] overflow-y-auto pr-2">
                {closuresLoading ? (
                  <p className="text-sm text-brand-accent/70">Cargando cierres…</p>
                ) : closures.length === 0 ? (
                  <p className="text-sm text-brand-accent/70">Aún no existen cierres registrados.</p>
                ) : (
                  <ul className="space-y-4">
                    {closures.map((closure) => (
                      <li
                        key={closure.id}
                        className="flex flex-col gap-3 rounded-2xl border border-brand-secondary/20 bg-white/80 px-5 py-4 text-sm text-brand-accent/80 shadow-sm lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-brand-primary">Cierre #{closure.id}</p>
                          <p>
                            Abierto por <strong className="text-brand-primary">{closure.abiertoPor ?? "-"}</strong> el
                            <strong> {formatDateTime(closure.abiertoAt)}</strong>
                          </p>
                          <p>
                            Cerrado por <strong className="text-brand-primary">{closure.cerradoPor ?? "-"}</strong> el
                            <strong> {formatDateTime(closure.cerradoAt)}</strong>
                          </p>
                          <p>
                            Total boletos: <strong className="text-brand-primary">{closure.totalTickets}</strong> · Total
                            recaudado: <strong className="text-brand-primary">{currency(closure.totalRecaudado)}</strong>
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-2xl border border-brand-secondary/20 px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => {
                              fetchClosureDetails(closure);
                            }}
                            disabled={detailsLoading}
                          >
                            {detailsLoading ? "Abriendo…" : "Ver detalle"}
                          </button>
                          {canManageClosures && (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-2xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => setDeleteTarget(closure)}
                              disabled={deleteLoading}
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {(detailsModal || detailsLoading) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
            <div className="card-surface w-full max-w-3xl rounded-3xl px-6 py-6 text-brand-primary">
              {detailsLoading ? (
                <p className="text-sm font-medium text-brand-accent/80">Obteniendo detalle del cierre…</p>
              ) : (
                detailsModal && (
                  <>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold">Detalle del cierre #{detailsModal.summary.id}</h2>
                        <p className="text-sm text-brand-accent/80">
                          Apertura: <strong>{formatDateTime(detailsModal.summary.abiertoAt)}</strong> · Cierre:
                          <strong> {formatDateTime(detailsModal.summary.cerradoAt)}</strong>
                        </p>
                      </div>
                      <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3 text-sm text-brand-accent/80">
                        <p>
                          Total boletos: <span className="font-semibold text-brand-primary">{detailsModal.summary.totalBoletos}</span>
                        </p>
                        <p>
                          Total recaudado: <span className="font-semibold text-brand-primary">{currency(detailsModal.summary.totalRecaudado)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-brand-accent/80 sm:grid-cols-2">
                      <p>
                        Abierto por: <strong className="text-brand-primary">{detailsModal.summary.abiertoPor ?? "-"}</strong>
                      </p>
                      <p>
                        Cerrado por: <strong className="text-brand-primary">{detailsModal.summary.cerradoPor ?? "-"}</strong>
                      </p>
                    </div>

                    <div className="mt-6 max-h-72 overflow-auto rounded-2xl border border-brand-secondary/20">
                      <table className="min-w-full text-left text-sm text-brand-accent/90">
                        <thead className="bg-brand-secondary/10 text-xs uppercase tracking-wide text-brand-secondary">
                          <tr>
                            <th className="px-4 py-3 font-medium">Código</th>
                            <th className="px-4 py-3 font-medium">Cantidad</th>
                            <th className="px-4 py-3 font-medium">Precio</th>
                            <th className="px-4 py-3 font-medium">Total</th>
                            <th className="px-4 py-3 font-medium">Correo</th>
                            <th className="px-4 py-3 font-medium">Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailsModal.ventas.length === 0 ? (
                            <tr>
                              <td className="px-4 py-6 text-center text-brand-accent/70" colSpan={6}>
                                No se registraron ventas durante este cierre.
                              </td>
                            </tr>
                          ) : (
                            detailsModal.ventas.map((venta) => (
                              <tr key={venta.id} className="border-t border-brand-secondary/10">
                                <td className="px-4 py-3 font-semibold text-brand-primary">{venta.codigo}</td>
                                <td className="px-4 py-3">{venta.cantidad}</td>
                                <td className="px-4 py-3">{currency(venta.precio)}</td>
                                <td className="px-4 py-3 font-semibold text-brand-primary">{currency(venta.total)}</td>
                                <td className="px-4 py-3">{venta.correo ?? "-"}</td>
                                <td className="px-4 py-3 text-xs">{formatDateTime(venta.createdAt)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 flex justify-end">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90"
                        onClick={() => setDetailsModal(null)}
                      >
                        Cerrar
                      </button>
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
            <div className="card-surface w-full max-w-lg rounded-3xl px-6 py-6 text-brand-primary">
              <h2 className="text-2xl font-semibold">Eliminar cierre</h2>
              <p className="mt-3 text-sm text-brand-accent/80">
                ¿Estás seguro de eliminar el cierre generado el {formatDateTime(deleteTarget.cerradoAt)}? Esta acción no
                se puede deshacer.
              </p>
              <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3 text-sm text-brand-accent/80 mt-4">
                <p>
                  Total boletos: <span className="font-semibold text-brand-primary">{deleteTarget.totalTickets}</span>
                </p>
                <p>
                  Total recaudado: <span className="font-semibold text-brand-primary">{currency(deleteTarget.totalRecaudado)}</span>
                </p>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-secondary/20 px-4 py-2 text-sm font-medium text-brand-primary transition hover:bg-brand-secondary/10"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={deleteClosure}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="card-surface flex flex-col gap-6 rounded-3xl px-6 py-6 text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-brand-secondary/10">
              <Image src="/iste-logo.png" alt="ISTE" fill sizes="64px" className="object-contain p-2" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-brand-accent/70">Control de visitantes</p>
              <h1 className="text-3xl font-semibold text-brand-primary">Emisión de boletos adicionales</h1>
              <p className="text-sm text-brand-accent/80">
                Administra la caja, define precios y genera pases temporales para visitantes.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="rounded-2xl bg-brand-secondary/10 px-5 py-3 text-sm text-brand-primary">
              <p className="font-semibold text-brand-primary">{resumenCaja.estado}</p>
              <p className="text-brand-accent/80">{resumenCaja.detalle}</p>
              {puedeEditarLimite ? (
                <p className="mt-1 text-xs text-brand-accent/70">
                  Vendidos: <span className="font-semibold text-brand-primary">{totalVendidos}</span>
                  {limiteBoletos > 0
                    ? ` · Disponible(s): ${Math.max(limiteBoletos - totalVendidos, 0)}`
                    : " · Sin límite establecido"}
                </p>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              {canManageClosures ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-secondary/20 px-5 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-secondary/10"
                  onClick={handleOpenPendingCajas}
                >
                  Cajas abiertas
                </button>
              ) : null}
              {canViewClosures && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-secondary/20 px-5 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-secondary/10"
                  onClick={handleOpenClosures}
                >
                  Ver cierres
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={cajaAbierta ? handleCerrarCaja : handleAbrirCaja}
                disabled={cajaOperation && !cajaAbierta}
              >
                {cajaAbierta ? "Cerrar caja" : cajaOperation ? "Abriendo…" : "Abrir caja"}
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="flex flex-col gap-5 lg:h-full">
            {puedeEditarLimite ? (
              <div className="card-surface w-full rounded-3xl px-5 py-6 text-brand-primary">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-brand-primary">Control rápido de boletos</h2>
                  </div>
                  <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3 text-sm text-brand-accent/80">
                    <p>
                      Vendidos: <span className="font-semibold text-brand-primary">{totalVendidos}</span>
                    </p>
                    <p>
                      Disponibles:{" "}
                      <span className="font-semibold text-brand-primary">
                        {limiteDisponible === null ? "Sin límite" : limiteDisponible}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-6 space-y-6">
                  <section className="flex flex-col gap-4 rounded-3xl border border-brand-secondary/20 bg-white/90 px-5 py-5 shadow-inner">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-brand-primary">Límite de boletos</h3>
                        <p className="text-sm text-brand-accent/80">
                          Usa <strong>0</strong> para dejar la venta sin límite.
                        </p>
                      </div>
                      <span className="rounded-2xl bg-brand-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-brand-accent/70">
                        {limiteBoletos > 0 ? `${limiteBoletos} máx.` : "Sin límite"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="flex flex-1 flex-col gap-2 text-sm text-brand-accent/80">
                        <input
                          className="rounded-2xl border border-brand-secondary/30 bg-white px-4 py-3 text-base font-semibold text-brand-primary outline-none transition focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                          type="number"
                          min={0}
                          value={limiteDraft}
                          onChange={(event) => setLimiteDraft(event.target.value)}
                          disabled={limiteSaving}
                        />
                      </label>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleGuardarLimite}
                        disabled={limiteSaving}
                      >
                        {limiteSaving ? "Guardando…" : "Guardar límite"}
                      </button>
                    </div>
                  </section>
                  <section className="flex flex-col gap-4 rounded-3xl border border-brand-secondary/20 bg-white/90 px-5 py-5 shadow-inner">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-brand-primary">Precio por boleto</h3>
                        <p className="text-sm text-brand-accent/80">
                          Define el valor a cobrar por cada acceso adicional emitido.
                        </p>
                      </div>
                      <span className="rounded-2xl bg-brand-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-brand-accent/70">
                        {currency(precioUnitario)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="flex flex-1 flex-col gap-2 text-sm text-brand-accent/80">
                        <input
                          className="rounded-2xl border border-brand-secondary/30 bg-white px-4 py-3 text-base font-semibold text-brand-primary outline-none transition focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                          type="number"
                          min={0}
                          step={0.01}
                          value={precioDraft}
                          onChange={(event) => setPrecioDraft(event.target.value)}
                          disabled={!puedeEditarPrecio || precioSaving}
                        />
                      </label>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleGuardarPrecio}
                        disabled={!puedeEditarPrecio || precioSaving}
                      >
                        {precioSaving ? "Guardando…" : "Guardar precio"}
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="card-surface w-full rounded-3xl px-5 py-6 text-brand-primary">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Precio por boleto</h2>
                    <p className="text-sm text-brand-accent/80">
                      Define el valor que se cobrará por cada acceso emitido para visitantes.
                    </p>
                  </div>
                  <div className="text-right text-sm text-brand-accent/80">
                    <p className="font-semibold text-brand-primary">{currency(precioUnitario)}</p>
                    <p>Precio actual</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="flex flex-1 flex-col gap-2 text-sm text-brand-accent/80">
                    Nuevo precio
                    <input
                      className="rounded-2xl border border-brand-secondary/20 bg-white/90 px-4 py-3 text-base font-semibold text-brand-primary outline-none transition focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                      type="number"
                      min={0}
                      step={0.01}
                      value={precioDraft}
                      onChange={(event) => setPrecioDraft(event.target.value)}
                      disabled={!puedeEditarPrecio || precioSaving}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleGuardarPrecio}
                    disabled={!puedeEditarPrecio || precioSaving}
                  >
                    {precioSaving ? "Guardando…" : "Guardar precio"}
                  </button>
                </div>
                {!puedeEditarPrecio && (
                  <p className="mt-3 text-xs text-brand-accent/70">
                    Solo los usuarios administradores pueden actualizar el precio unitario.
                  </p>
                )}
              </div>
            )}

            <div className="card-surface rounded-3xl px-5 py-7 text-brand-primary">
              <h2 className="text-xl font-semibold">Generar pases para visitantes</h2>
              <p className="mt-2 text-sm text-brand-accent/80">
                Selecciona la cantidad de accesos y genera un PDF o envía los QR directamente por correo electrónico.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-brand-accent/80">
                  Cantidad de pases
                  <input
                    type="number"
                    min={1}
                    value={cantidad}
                    onChange={(event) => setCantidad(Number(event.target.value))}
                    className="rounded-2xl border border-brand-secondary/20 bg-white/90 px-4 py-3 text-base font-semibold text-brand-primary outline-none transition focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20"
                  />
                </label>
                <div className="rounded-2xl border border-brand-secondary/20 bg-white/60 px-4 py-3 text-sm text-brand-accent/80">
                  <p className="font-semibold text-brand-primary">{totalActual}</p>
                  <p>Total a cobrar</p>
                </div>
              </div>

              <label className="mt-4 flex flex-col gap-2 text-sm text-brand-accent/80">
                Correo (opcional)
                <input
                  type="email"
                  value={correo}
                  onChange={(event) => setCorreo(event.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="rounded-2xl border border-brand-secondary/20 bg-white/90 px-4 py-3 text-base text-brand-primary outline-none transition focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/20"
                />
                <span className="text-xs text-brand-accent/70">
                  Requerido únicamente si deseas enviar el PDF con los códigos por correo.
                </span>
              </label>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-secondary/20 px-5 py-3 text-sm font-semibold text-brand-primary transition hover:bg-brand-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => generarCodigos("pdf")}
                  disabled={generando}
                >
                  {generando ? "Generando…" : "Descargar PDF"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => generarCodigos("correo")}
                  disabled={generando || !correoValido}
                >
                  {generando ? "Enviando…" : "Enviar por correo"}
                </button>
              </div>
            </div>
          </div>

          <aside className="card-surface flex h-full flex-col gap-4 rounded-3xl px-5 py-6 text-brand-primary lg:h-full">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Historial de ventas</h2>
              <span className="rounded-full bg-brand-secondary/10 px-3 py-1 text-xs font-medium text-brand-secondary">
                {historial.length} registro(s)
              </span>
            </div>
            <div className="flex-1 overflow-y-auto rounded-2xl bg-white/70 px-4 py-4">
              {historial.length === 0 ? (
                <p className="text-sm text-brand-accent/70">Aún no se han generado boletos adicionales.</p>
              ) : (
                <ul className="space-y-3 text-sm text-brand-accent/80">
                  {historial.slice(0, 5).map((venta) => (
                    <li key={venta.id} className="rounded-2xl border border-brand-secondary/20 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold text-brand-primary">{venta.codigo}</span>
                        <span className="text-xs text-brand-accent/70">{formatDateTime(venta.createdAt)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-brand-accent/70">
                        <span>
                          Cantidad: <strong className="text-brand-primary">{venta.cantidad}</strong>
                        </span>
                        <span>
                          Total: <strong className="text-brand-primary">{currency(venta.total)}</strong>
                        </span>
                        <span>Precio: {currency(venta.precio)}</span>
                        <span>Correo: {venta.correo ?? "-"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </section>

        </div>
      </main>
    </>
  );
}
