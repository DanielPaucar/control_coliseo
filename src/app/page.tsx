"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8 text-gray-900">
      <h1 className="text-4xl font-bold mb-10">🎟️ Control de Ingreso</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <Link
          href="/importar"
          className="bg-blue-600 text-white rounded-xl p-6 shadow hover:bg-blue-700 text-center"
        >
          📥 Importar Estudiantes
        </Link>
        <Link
          href="/escaner"
          className="bg-green-600 text-white rounded-xl p-6 shadow hover:bg-green-700 text-center"
        >
          📷 Escanear QR
        </Link>
        <Link
          href="/generar-visitantes"
          className="bg-orange-400 text-white rounded-xl p-6 shadow hover:bg-purple-700 text-center"
        >
          📋 Generar QR Visitantes
        </Link>
        <Link
          href="/generar"
          className="bg-orange-400 text-white rounded-xl p-6 shadow hover:bg-purple-700 text-center"
        >
          📋 Generar QR Adisional
        </Link>
        <Link
          href="/dashboard"
          className="bg-purple-600 text-white rounded-xl p-6 shadow hover:bg-purple-700 text-center"
        >
          📊 Dashboard
        </Link>
      </div>
    </main>
  );
}
