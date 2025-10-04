"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";

type ImportSummary = {
  total: number;
  exitosos: number;
  fallidos: number;
  emailsIntentados: number;
  emailsProcesados: number;
  emailsEnviados: number;
  emailsFallidos: number;
  studentRows: number;
  studentsToEmail: number;
};

type PreviewInfo = {
  totalRows: number;
  studentRows: number;
  studentsWithEmail: number;
};

type FailedEmail = {
  fila: number;
  email: string | null;
  reason: string;
};

type StreamEvent =
  | { type: "start"; totalRows: number; studentRows: number; studentsToEmail: number }
  | { type: "progress"; processed: number; total: number }
  | { type: "cooldown"; processed: number; remaining: number; delayMs: number }
  | { type: "email-failed"; data: FailedEmail }
  | { type: "done"; summary: ImportSummary; failedEmails: FailedEmail[] }
  | { type: "error"; message: string };

const EMAIL_FIELD_KEYS = [
  "Correo",
  "correo",
  "Correo Institucional",
  "correo institucional",
  "Correo institucional",
  "Email",
  "email",
  "Correo electronico",
  "Correo electrónico",
  "correoElectronico",
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const extractFirstCell = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return null;
};

const normalizeEmailValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const email = String(value).trim();
  return email.length ? email : null;
};

const resolvePersonaType = (tipo: unknown): "estudiante" | "familiar" | "visitante" => {
  const normalized = (typeof tipo === "string" ? tipo : String(tipo ?? "")).toLowerCase();
  if (normalized === "fam" || normalized === "familiar") return "familiar";
  if (normalized === "vis" || normalized === "visitante") return "visitante";
  return "estudiante";
};

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [maxUsosFamiliares, setMaxUsosFamiliares] = useState(0);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [failedEmails, setFailedEmails] = useState<FailedEmail[]>([]);
  const [progress, setProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });
  const [cooldownInfo, setCooldownInfo] = useState<{ remaining: number; delayMs: number } | null>(null);

  const progressPercent = useMemo(() => {
    if (progress.total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((progress.processed / progress.total) * 100));
  }, [progress]);

  const handleFileChange = useCallback(async (selectedFile: File | null) => {
    setFile(selectedFile);
    setSummary(null);
    setStatus(null);
    setPreview(null);
    setPreviewStatus(null);
    setFailedEmails([]);
    setProgress({ processed: 0, total: 0 });
    setCooldownInfo(null);

    if (!selectedFile) {
      return;
    }

    setPreviewStatus("Analizando archivo…");
    try {
      const XLSX = await import("xlsx");
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        setPreviewStatus("El archivo no contiene una hoja válida.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet ?? {});

      const studentRows = rows.reduce((acc, row) => {
        const tipoRaw = extractFirstCell(row, ["Tipo", "tipo"]);
        return resolvePersonaType(tipoRaw ?? "est") === "estudiante" ? acc + 1 : acc;
      }, 0);

      const studentsWithEmail = rows.reduce((acc, row) => {
        const tipoRaw = extractFirstCell(row, ["Tipo", "tipo"]);
        const correoRaw = extractFirstCell(row, EMAIL_FIELD_KEYS);
        const correo = normalizeEmailValue(correoRaw);
        if (resolvePersonaType(tipoRaw ?? "est") === "estudiante" && correo && EMAIL_REGEX.test(correo)) {
          return acc + 1;
        }
        return acc;
      }, 0);

      setPreview({
        totalRows: rows.length,
        studentRows,
        studentsWithEmail,
      });
      setPreviewStatus(null);
    } catch (error) {
      console.error("No se pudo analizar el archivo", error);
      setPreview(null);
      setPreviewStatus("No se pudo leer el archivo. Verifica el formato y vuelve a intentarlo.");
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setStatus("⚠️ Selecciona un archivo .xlsx o .xls para comenzar");
      return;
    }

    setLoading(true);
    setStatus("Preparando importación…");
    setSummary(null);
    setFailedEmails([]);
    setProgress({ processed: 0, total: preview?.studentsWithEmail ?? 0 });
    setCooldownInfo(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("max_usos_familiares", String(maxUsosFamiliares));

      const response = await fetch("/api/importar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setStatus(`❌ Error: ${payload?.error || response.statusText}`);
        return;
      }

      if (!response.body) {
        setStatus("❌ No se pudo recibir la respuesta del servidor.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let importCompleted = false;
      let importErrored = false;

      const processEvent = (event: StreamEvent) => {
        switch (event.type) {
          case "start": {
            setStatus(
              `Procesando ${event.totalRows} registro${event.totalRows === 1 ? "" : "s"}. ` +
                `${event.studentsToEmail} estudiante${event.studentsToEmail === 1 ? "" : "s"} con correo válido.`
            );
            setPreview({
              totalRows: event.totalRows,
              studentRows: event.studentRows,
              studentsWithEmail: event.studentsToEmail,
            });
            setPreviewStatus(null);
            setProgress({ processed: 0, total: event.studentsToEmail });
            setCooldownInfo(null);
            break;
          }
          case "progress": {
            setProgress({ processed: event.processed, total: event.total });
            setStatus(`Enviando invitaciones ${event.processed}/${event.total}`);
            setCooldownInfo(null);
            break;
          }
          case "cooldown": {
            setCooldownInfo({ remaining: event.remaining, delayMs: event.delayMs });
            setStatus(
              `Pausa preventiva para evitar bloqueos. Quedan ${event.remaining} invitacione${event.remaining === 1 ? "" : "s"} por enviar.`
            );
            break;
          }
          case "email-failed": {
            setFailedEmails((prev) => [...prev, event.data]);
            break;
          }
          case "done": {
            importCompleted = true;
            setSummary(event.summary);
            setFailedEmails(event.failedEmails);
            setProgress({ processed: event.summary.emailsProcesados, total: event.summary.emailsIntentados });
            setCooldownInfo(null);
            setStatus(
              `✅ Importación completada. Correos enviados: ${event.summary.emailsEnviados}/${event.summary.emailsIntentados}. ` +
                `Registros con incidencias: ${event.summary.fallidos}.`
            );
            break;
          }
          case "error": {
            importCompleted = true;
            importErrored = true;
            setStatus(`❌ ${event.message}`);
            break;
          }
          default:
            break;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            processEvent(JSON.parse(line) as StreamEvent);
          } catch (parseErr) {
            console.error("No se pudo interpretar el evento del servidor:", parseErr, line);
          }
        }
      }

      if (buffer.trim()) {
        try {
          processEvent(JSON.parse(buffer) as StreamEvent);
        } catch (parseErr) {
          console.error("No se pudo interpretar el evento final del servidor:", parseErr, buffer);
        }
      }

      if (!importCompleted && !importErrored) {
        setStatus((prev) => prev ?? "❌ La importación finalizó inesperadamente. Verifica el archivo e inténtalo de nuevo.");
      }
    } catch (error) {
      console.error("Error en importación", error);
      setStatus("❌ No se pudo completar la importación. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="card-surface flex flex-col gap-6 rounded-3xl px-6 py-[25px] text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-brand-secondary/10">
              <Image src="/iste-logo.png" alt="Eventos ISTE" fill sizes="64px" className="object-contain p-2" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-brand-accent/70">Eventos ISTE</p>
              <h1 className="text-3xl font-semibold text-brand-primary">Importar Estudiantes</h1>
              <p className="text-sm text-brand-accent/80">
                Sube la planilla oficial para generar códigos QR y notificar por correo a cada estudiante.
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-brand-secondary/10 px-5 py-3 text-sm text-brand-primary">
            <p className="font-semibold text-brand-primary">Formato soportado</p>
            <p>Excel (.xlsx / .xls) con columnas: Nombre, Apellido, Cédula, Correo, Tipo</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <form
            onSubmit={handleSubmit}
            className="card-surface flex h-full flex-col gap-6 rounded-3xl px-8 py-[25px] text-brand-primary"
          >
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-accent/70">
                Archivo de importación
              </label>
              <div className="mt-3 rounded-2xl border border-dashed border-brand-secondary/40 bg-white/80 p-6 text-sm text-brand-accent">
                <p className="font-medium text-brand-primary">
                  Arrastra y suelta el archivo aquí o
                  <label className="ml-1 cursor-pointer text-brand-secondary underline">
                    selecciónalo
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </p>
                <p className="mt-1 text-xs text-brand-accent/70">Máximo recomendado: 5,000 registros por archivo.</p>
                {file ? (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-secondary/10 px-3 py-1 text-xs font-semibold text-brand-secondary">
                    📄 {file.name}
                  </p>
                ) : null}
                {previewStatus ? (
                  <p className="mt-3 text-xs text-brand-accent/70">{previewStatus}</p>
                ) : null}
                {preview ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-brand-accent/80 sm:grid-cols-3">
                    <div className="rounded-xl bg-white/70 px-3 py-2 text-brand-primary">
                      <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent/60">Registros totales</p>
                      <p className="mt-1 text-lg font-semibold">{preview.totalRows}</p>
                    </div>
                    <div className="rounded-xl bg-brand-secondary/10 px-3 py-2 text-brand-primary">
                      <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent/60">Estudiantes</p>
                      <p className="mt-1 text-lg font-semibold">{preview.studentRows}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-100/70 px-3 py-2 text-emerald-800">
                      <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-700/70">Con correo válido</p>
                      <p className="mt-1 text-lg font-semibold">{preview.studentsWithEmail}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-primary">
                Invitados adicionales por estudiante
              </label>
              <p className="text-xs text-brand-accent/70">
                Indica cuántas personas acompañarán al estudiante. El QR resultante permitirá el acceso del
                estudiante más sus invitados.
              </p>
              <input
                type="number"
                min={0}
                value={maxUsosFamiliares}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isNaN(value) || value < 0) {
                    setMaxUsosFamiliares(0);
                    return;
                  }
                  setMaxUsosFamiliares(value);
                }}
                className="mt-2 w-full rounded-xl border border-brand-secondary/30 bg-white/80 px-4 py-2 text-sm text-brand-primary focus:border-brand-secondary focus:outline-none focus:ring focus:ring-brand-secondary/30"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-brand-accent/70">
                El sistema generará un único QR por estudiante con la capacidad total (estudiante + invitados) y lo
                enviará por correo.
              </p>
              <button
                type="submit"
                disabled={!file || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-secondary px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-secondary/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                {loading ? "Importando…" : "Importar datos"}
              </button>
            </div>

            {(progress.total > 0 || loading) && (
              <div className="rounded-xl bg-white/80 px-4 py-3 text-xs text-brand-primary shadow-inner">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-brand-accent/60">
                  <span>Envío de invitaciones</span>
                  <span>
                    {progress.total > 0
                      ? `${progress.processed}/${progress.total}`
                      : loading
                      ? "Preparando…"
                      : "—"}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-brand-secondary/20">
                  <div
                    className="h-full rounded-full bg-brand-secondary transition-all duration-500"
                    style={{
                      width: progress.total > 0 ? `${progressPercent}%` : loading ? "35%" : "0%",
                    }}
                  />
                </div>
              </div>
            )}

            {cooldownInfo ? (
              <p className="text-xs text-brand-accent/70">
                Pausa preventiva durante {Math.round(cooldownInfo.delayMs / 1000)} segundos. Pendientes por enviar: {" "}
                {cooldownInfo.remaining}.
              </p>
            ) : null}

            {status ? (
              <p
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  status.startsWith("✅")
                    ? "bg-emerald-100/90 text-emerald-700"
                    : status.startsWith("❌")
                    ? "bg-red-100/90 text-red-700"
                    : "bg-brand-secondary/10 text-brand-primary"
                }`}
              >
                {status}
              </p>
            ) : null}

            {failedEmails.length > 0 ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="font-semibold">Correos no enviados ({failedEmails.length})</p>
                <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs">
                  {failedEmails.map((item, index) => (
                    <li key={`${item.fila}-${item.email ?? "sin-correo"}-${index}`}>
                      Fila {item.fila}: {item.email ?? "(sin correo)"} · {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </form>

          <aside className="card-surface flex flex-col gap-6 rounded-3xl px-6 py-8 text-brand-primary">
            <h2 className="text-lg font-semibold">Resumen de QR enviados por correo</h2>
            <p className="text-sm text-brand-accent/80">
              Visualiza cuántos destinatarios recibieron correctamente su correo y cuántos no pudieron ser notificados.
            </p>

            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl bg-emerald-100/80 px-4 py-3 text-emerald-800">
                <p className="text-sm font-medium">Correos enviados</p>
                <p className="text-3xl font-semibold">
                  {summary ? summary.emailsEnviados : "—"}
                  <span className="ml-1 text-sm font-normal">de {summary ? summary.emailsIntentados : "—"}</span>
                </p>
              </div>
              <div className="rounded-2xl bg-sky-100/80 px-4 py-3 text-sky-900">
                <p className="text-sm font-medium">Estudiantes procesados</p>
                <p className="text-3xl font-semibold">
                  {summary ? summary.exitosos : "—"}
                  <span className="ml-1 text-sm font-normal">de {summary ? summary.total : "—"}</span>
                </p>
              </div>
              <div className="rounded-2xl bg-red-100/70 px-4 py-3 text-red-700">
                <p className="text-sm font-medium">Correos pendientes o fallidos</p>
                <p className="text-3xl font-semibold">{summary ? summary.emailsFallidos : failedEmails.length}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-brand-secondary/10 px-4 py-3 text-xs text-brand-accent/80">
              <p className="font-semibold text-brand-primary">Tips</p>
              <ul className="mt-2 space-y-2">
                <li>• Valida que el correo tenga formato institucional antes de subir la plantilla.</li>
                <li>• Usa separadores decimales correctos para mantener la cédula sin errores.</li>
                <li>• Reintenta la importación solo con las filas fallidas para optimizar tiempos.</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
