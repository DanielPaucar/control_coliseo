"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { BrowserQRCodeReader } from "@zxing/browser";

export default function EscanerPage() {
  const [message, setMessage] = useState("Escanea un código QR para registrar el acceso");
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [checkingPermission, setCheckingPermission] = useState(true);
  const processingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const requestCameraAccess = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermissionError("Tu navegador no soporta acceso a la cámara");
      setCheckingPermission(false);
      return;
    }

    setCheckingPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      stream.getTracks().forEach((track) => track.stop());
      setHasPermission(true);
      setPermissionError("");
    } catch (error) {
      console.error("Permiso de cámara denegado", error);
      setPermissionError("Necesitamos permiso para usar tu cámara");
      setHasPermission(false);
    } finally {
      setCheckingPermission(false);
    }
  }, []);

  useEffect(() => {
    (BrowserQRCodeReader as any).WORKER_PATH = "/wasm/zxing_reader.wasm";
    requestCameraAccess();
  }, [requestCameraAccess]);

  const playTone = useCallback(async (frequency: number, durationMs = 160) => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      let ctx = audioContextRef.current;
      if (!ctx) {
        ctx = new AudioContextClass();
        audioContextRef.current = ctx;
      }
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + durationMs / 1000);
    } catch (error) {
      console.warn("No se pudo reproducir el tono", error);
    }
  }, []);

  const handleScan = useCallback(
    async (result: string) => {
      if (!result || processingRef.current) {
        return;
      }

      processingRef.current = true;
      setMessage("🔄 Verificando código…");

      try {
        const response = await fetch("/api/ingreso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: result }),
        });

        const payload = await response.json();

        if (response.ok && payload.success) {
          setMessage(`✅ ${payload.message}`);
          playTone(880, 180).catch(() => undefined);
        } else {
          setMessage(`❌ ${payload.error || "No se pudo registrar el ingreso"}`);
          playTone(260, 260).catch(() => undefined);
        }
      } catch (error) {
        console.error(error);
        setMessage("⚠️ Error al conectar con el servidor");
        playTone(180, 260).catch(() => undefined);
      } finally {
        window.setTimeout(() => {
          processingRef.current = false;
        }, 600);
      }
    },
    [playTone]
  );

  const messageClass = message.startsWith("✅")
    ? "bg-emerald-100/90 text-emerald-800"
    : message.startsWith("❌")
    ? "bg-red-100/90 text-red-700"
    : message.startsWith("⚠️")
    ? "bg-amber-100/90 text-amber-700"
    : "bg-white/10 text-white";

  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="card-surface flex flex-col gap-6 rounded-3xl px-8 py-10 text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-brand-secondary/10">
              <Image src="/iste-logo.png" alt="Eventos ISTE" fill sizes="64px" className="object-contain p-2" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-brand-accent/70">Eventos ISTE</p>
              <h1 className="text-3xl font-semibold text-brand-primary">Escáner de códigos QR</h1>
              <p className="text-sm text-brand-accent/80">
                Habilita la cámara para validar el acceso de estudiantes, familiares y visitantes.
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-brand-secondary/10 px-5 py-3 text-sm text-brand-primary">
            <p className="font-semibold text-brand-primary">Consejos rápidos</p>
            <p>Ubica el QR a 15 cm de distancia y evita reflejos de luz para una lectura más rápida.</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="card-surface flex flex-col gap-6 rounded-3xl px-8 py-10 text-brand-primary">
            <h2 className="text-lg font-semibold">Lector en vivo</h2>
            <div className="relative aspect-square overflow-hidden rounded-3xl border border-brand-secondary/30 bg-brand-secondary/5">
              {!hasPermission && !checkingPermission ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-brand-primary">
                  <p>{permissionError}</p>
                  <button
                    type="button"
                    onClick={requestCameraAccess}
                    className="rounded-xl bg-brand-secondary px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-secondary/30 transition hover:bg-sky-400"
                  >
                    Conceder permiso a la cámara
                  </button>
                </div>
              ) : hasPermission ? (
                <Scanner
                  allowMultiple
                  scanDelay={200}
                  onScan={(results) => {
                    const value = results[0]?.rawValue || "";
                    void handleScan(value);
                  }}
                  onError={(error) => console.error(error)}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-brand-primary">
                  <span className="animate-pulse text-2xl">📷</span>
                  <p>Solicitando acceso a la cámara…</p>
                </div>
              )}
            </div>
          </div>

          <aside className="card-surface flex flex-col gap-6 rounded-3xl px-6 py-8 text-brand-primary">
            <h2 className="text-lg font-semibold">Estado del último escaneo</h2>
            <p className={`rounded-2xl px-4 py-4 text-sm font-medium ${messageClass}`}>{message}</p>

            <div className="space-y-3 text-xs text-brand-accent/80">
              <p className="font-semibold text-brand-primary">Recomendaciones</p>
              <ul className="space-y-2">
                <li>• Mantén limpia la cámara del dispositivo.</li>
                <li>• Asegúrate de contar con conexión estable a internet.</li>
                <li>• Repite el escaneo si el código fue rechazado por usos excedidos.</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
