"use client";

import { useState } from "react";

export default function GenerarVisitantesPage() {
  const [cantidad, setCantidad] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerar = async () => {
    setError("");
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      setError("Ingresa una cantidad válida de códigos");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generar-visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad }),
      });

      if (!res.ok) throw new Error("Error al generar QR");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "visitantes.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      alert("❌ Error al generar los QR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6 text-gray-900">
      <h1 className="text-4xl font-bold mb-4">Generar QR Adicional</h1>

      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm text-gray-900">
        <label className="block text-sm font-medium mb-2">
          Número de QR a generar:
        </label>
        <input
          type="number"
          min="1"
          value={cantidad}
          onChange={(e) => setCantidad(Number(e.target.value))}
          className="w-full border p-2 rounded-md mb-4"
        />

        <button
          onClick={handleGenerar}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          {loading ? "Generando..." : "Generar y Descargar PDF"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
