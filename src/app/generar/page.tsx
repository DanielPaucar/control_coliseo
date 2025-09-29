"use client";
import { useState } from "react";

export default function GenerarQRPage() {
  const [esEstudiante, setEsEstudiante] = useState(true);
  const [cedula, setCedula] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [maxUsos, setMaxUsos] = useState(1);
  const [status, setStatus] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);

  const handleBuscarEstudiante = async (ced: string) => {
    if (!ced) return;
    try {
      const res = await fetch(`/api/estudiante/${ced}`);
      const data = await res.json();
      if (res.ok) {
        setNombreCompleto(`${data.nombre} ${data.apellido}`);
      } else {
        setNombreCompleto("❌ Estudiante no encontrado");
      }
    } catch (err) {
      setNombreCompleto("⚠️ Error al buscar estudiante");
    }
  };

  const handleGenerar = async () => {
    try {
      setStatus("⏳ Generando QR...");
      setQrImage(null);

      const res = await fetch("/api/generar-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esEstudiante, cedula, max_usos: maxUsos }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(`❌ Error: ${data.error}`);
      } else {
        setStatus(`✅ ${data.mensaje}`);
        if (data.imagen) {
          setQrImage(data.imagen); // mostrar QR visitante
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Error al conectar con servidor.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 bg-gray-100">
      <h1 className="text-2xl font-bold mb-4">🎟️ Generar QR</h1>

      <div className="bg-white shadow rounded p-6 w-full max-w-md space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={esEstudiante}
            onChange={(e) => {
              setEsEstudiante(e.target.checked);
              setCedula("");
              setNombreCompleto("");
            }}
          />
          ¿Es estudiante?
        </label>

        {esEstudiante && (
          <div>
            <input
              type="text"
              placeholder="Cédula del estudiante"
              value={cedula}
              onChange={(e) => {
                setCedula(e.target.value);
                handleBuscarEstudiante(e.target.value);
              }}
              className="w-full border p-2 rounded mb-2"
            />
            {nombreCompleto && <p className="text-sm text-gray-700">👤 {nombreCompleto}</p>}
          </div>
        )}

        <input
          type="number"
          min="1"
          placeholder="Máximo de usos"
          value={maxUsos}
          onChange={(e) => setMaxUsos(Number(e.target.value))}
          className="w-full border p-2 rounded"
        />

        <button
          onClick={handleGenerar}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Generar QR
        </button>

        {status && <p className="mt-2 text-center">{status}</p>}
      </div>

      {qrImage && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded shadow text-center">
            <h2 className="text-lg font-bold mb-4">QR Generado</h2>
            <img src={qrImage} alt="QR generado" className="mx-auto" />
            <button
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded"
              onClick={() => setQrImage(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
