"use client";
import { useState } from "react";

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState("");
  const [maxUsosFamiliares, setMaxUsosFamiliares] = useState(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setStatus("⚠️ Selecciona un archivo primero");
      return;
    }

    try {
      setLoading(true);
      setStatus("⏳ Importando...");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("max_usos_familiares", String(maxUsosFamiliares));

      const res = await fetch("/api/importar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus(`❌ Error: ${err.error || res.statusText}`);
      } else {
        const data = await res.json();
        setStatus(`✅ Importación completada. ${data.message || ""}`);
      }
    } catch (err) {
      console.error("Error en fetch:", err);
      setStatus("❌ No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <main className="min-h-screen bg-gray-100 p-8">
        <h1 className="text-3xl font-bold mb-6">📥 Importar Estudiantes (Excel)</h1>
        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-xl shadow w-full max-w-md space-y-4"
        >
          {/* Archivo Excel */}
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full border p-2 rounded"
          />

          {/* Máx. usos familiares */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Máx. usos para familiares:
            </label>
            <input
              type="number"
              value={maxUsosFamiliares}
              onChange={(e) => setMaxUsosFamiliares(Number(e.target.value))}
              min={1}
              className="w-full border p-2 rounded"
            />
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={!file || loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? "Procesando..." : "Importar"}
          </button>

          {/* Mensaje */}
          {status && (
            <p className="mt-4 text-center font-medium">{status}</p>
          )}
        </form>
      </main>
    </div>
  );
}
