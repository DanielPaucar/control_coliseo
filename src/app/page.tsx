"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { signOut, useSession } from "next-auth/react";
import type { AppUserRole } from "@/types/auth";
import { ROLE_LABELS } from "@/types/auth";

type MenuOption = {
  href: string;
  label: string;
  icon: string;
  description?: string;
  accentClass: string;
};

const optionsByRole: Record<AppUserRole, MenuOption[]> = {
  admin: [
    {
      href: "/importar",
      label: "Importar Estudiantes",
      icon: "📥",
      description: "Carga masiva de registros desde planillas",
      accentClass: "bg-blue-600 hover:bg-blue-700",
    },
    {
      href: "/escaner",
      label: "Escanear QR",
      icon: "📷",
      description: "Validación de accesos en tiempo real",
      accentClass: "bg-green-600 hover:bg-green-700",
    },
    {
      href: "/generar-visitantes",
      label: "Generar QR Visitantes",
      icon: "📋",
      description: "Credenciales temporales para invitados",
      accentClass: "bg-orange-400 hover:bg-orange-500",
    },
    {
      href: "/generar",
      label: "Generar QR Adicional",
      icon: "➕",
      description: "Emite accesos especiales bajo demanda",
      accentClass: "bg-orange-400 hover:bg-orange-500",
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: "📊",
      description: "Indicadores y métricas del evento",
      accentClass: "bg-purple-600 hover:bg-purple-700",
    },
  ],
  financiero: [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: "📊",
      description: "Reportes de ingresos y ocupación",
      accentClass: "bg-purple-600 hover:bg-purple-700",
    },
    {
      href: "/generar",
      label: "Generar QR Adicional",
      icon: "➕",
      description: "Autoriza accesos especiales",
      accentClass: "bg-orange-400 hover:bg-orange-500",
    },
    {
      href: "/generar-visitantes",
      label: "QR Visitantes",
      icon: "📋",
      description: "Control de cortesías o invitados financieros",
      accentClass: "bg-blue-600 hover:bg-blue-700",
    },
  ],
  guardiania: [
    {
      href: "/escaner",
      label: "Escanear QR",
      icon: "📷",
      description: "Escanea códigos para autorizar el ingreso",
      accentClass: "bg-green-600 hover:bg-green-700",
    },
  ],
};

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const userEmail = session?.user?.email ?? "";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const options = useMemo(() => {
    if (!role) {
      return [];
    }
    return optionsByRole[role];
  }, [role]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-800">
        <p className="text-lg">Cargando panel…</p>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8 text-gray-900">
        <div className="max-w-xl text-center space-y-4">
          <h1 className="text-3xl font-semibold">Acceso no autorizado</h1>
          <p className="text-base text-gray-600">
            Tu cuenta no tiene un rol asignado dentro de la aplicación. Contacta al administrador
            para que te agregue a uno de los grupos autorizados.
          </p>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8 text-gray-900">
      <header className="w-full max-w-4xl flex flex-col gap-2 mb-8 text-center md:text-left md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Sesión iniciada como {userEmail}</p>
          <h1 className="text-4xl font-bold">🎟️ Control de Ingreso</h1>
          <p className="text-base text-gray-600">Rol asignado: {ROLE_LABELS[role]}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="self-center md:self-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cerrar sesión
        </button>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full max-w-4xl">
        {options.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className={`${option.accentClass} text-white rounded-xl p-6 shadow hover:shadow-lg transition`}
          >
            <span className="text-3xl" aria-hidden>
              {option.icon}
            </span>
            <span className="block text-xl font-semibold mt-3">{option.label}</span>
            {option.description ? (
              <span className="block text-sm text-white/80 mt-2">
                {option.description}
              </span>
            ) : null}
          </Link>
        ))}
      </section>
    </main>
  );
}
