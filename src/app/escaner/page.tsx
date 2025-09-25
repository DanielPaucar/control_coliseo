"use client";

import { useEffect, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { BrowserQRCodeReader } from "@zxing/browser";

export default function EscanerPage() {
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // 👉 Forzamos a usar el wasm local
    (BrowserQRCodeReader as any).WORKER_PATH = "/zxing_reader.wasm";
  }, []);

  const handleScan = async (result: string) => {
    if (!result) return;

    try {
      const res = await fetch("/api/ingreso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: result }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMsg(`${data.message}`); // Mostramos el mensaje con usos disponibles
      } else {
        setMsg(`❌ Error: ${data.error || "No se pudo registrar el ingreso"}`);
      }
    } catch (err) {
      console.error(err);
      setMsg("⚠️ Error al conectar con el servidor");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">Escáner de QR</h1>

      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-4">
        <Scanner
          onScan={(result) => handleScan(result[0]?.rawValue || "")}
          onError={(error) => console.error(error)}
        />
      </div>

      <p
        className={`mt-4 text-lg font-semibold ${
          msg.startsWith("✅")
            ? "text-green-600"
            : msg.startsWith("❌")
            ? "text-red-600"
            : "text-yellow-600"
        }`}
      >
        {msg}
      </p>
    </div>
  );
}

