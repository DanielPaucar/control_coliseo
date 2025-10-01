"use client";

import { useCallback, useEffect, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { BrowserQRCodeReader } from "@zxing/browser";

export default function EscanerPage() {
  const [msg, setMsg] = useState("");
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [checkingPermission, setCheckingPermission] = useState(true);

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
    // 👉 Forzamos a usar el wasm local
    (BrowserQRCodeReader as any).WORKER_PATH = "/wasm/zxing_reader.wasm";
    requestCameraAccess();
  }, [requestCameraAccess]);

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6 text-gray-900">
      <h1 className="text-2xl font-bold mb-4">Escáner de QR</h1>

      <div className="w-full max-w-md bg-white text-gray-900 shadow-md rounded-lg p-4">
        {!hasPermission && !checkingPermission ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-red-600">{permissionError}</p>
            <button
              type="button"
              onClick={requestCameraAccess}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              Intentar de nuevo
            </button>
          </div>
        ) : hasPermission ? (
          <Scanner
            onScan={(result) => handleScan(result[0]?.rawValue || "")}
            onError={(error) => console.error(error)}
          />
        ) : (
          <p className="text-center">Solicitando acceso a la cámara...</p>
        )}
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
