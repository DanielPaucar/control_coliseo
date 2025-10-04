"use client";

import Image from "next/image";
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
  gradient: string;
};

const BRAND_GRADIENTS = {
  deep: "linear-gradient(135deg, #003976 0%, #29598c 100%)",
  sky: "linear-gradient(135deg, #00a6f2 0%, #29598c 100%)",
  hybrid: "linear-gradient(135deg, #29598c 0%, #003976 55%, #00a6f2 100%)",
};

const optionsByRole: Record<AppUserRole, MenuOption[]> = {
  admin: [
    {
      href: "/importar",
      label: "Importar Estudiantes",
      icon: "📥",
      description: "Carga masiva de registros desde planillas",
      gradient: BRAND_GRADIENTS.deep,
    },
    {
      href: "/escaner",
      label: "Escanear QR",
      icon: "📷",
      description: "Validación de accesos en tiempo real",
      gradient: BRAND_GRADIENTS.sky,
    },
    {
      href: "/generar-visitantes",
      label: "Generar QR adicional",
      icon: "📋",
      description: "Gestiona caja, emisiones y envíos de tickets",
      gradient: BRAND_GRADIENTS.hybrid,
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: "📊",
      description: "Indicadores y métricas del evento",
      gradient: BRAND_GRADIENTS.deep,
    },
  ],
  financiero: [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: "📊",
      description: "Reportes de ingresos y ocupación",
      gradient: BRAND_GRADIENTS.sky,
    },
    {
      href: "/generar-visitantes",
      label: "Generar QR adicional",
      icon: "📋",
      description: "Control de boletos y recaudación",
      gradient: BRAND_GRADIENTS.deep,
    },
  ],
  guardiania: [
    {
      href: "/escaner",
      label: "Escanear QR",
      icon: "📷",
      description: "Escanea códigos para autorizar el ingreso",
      gradient: BRAND_GRADIENTS.sky,
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
      <main className="min-h-screen bg-brand-gradient text-white">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-lg font-medium">Cargando panel…</p>
        </div>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
        <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
          <div className="max-w-xl space-y-4">
            <Image
              src="/iste-logo.png"
              alt="Eventos ISTE"
              width={96}
              height={96}
              className="mx-auto rounded-full border border-white/40 bg-white/10 p-4"
              priority
            />
            <h1 className="text-4xl font-semibold">Acceso no autorizado</h1>
            <p className="text-base text-brand-highlight/90">
              Tu cuenta no tiene un rol asignado dentro del panel. Solicita al administrador que te agregue al
              grupo correspondiente.
            </p>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="inline-flex justify-center rounded-xl bg-white/15 px-5 py-2 text-sm font-medium text-white shadow-md shadow-black/20 transition hover:bg-white/25"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="card-surface flex flex-col gap-6 rounded-3xl px-8 py-10 text-brand-primary shadow-lg shadow-black/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-brand-secondary/10">
              <Image src="/iste-logo.png" alt="Eventos ISTE" fill sizes="64px" className="object-contain p-2" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-brand-accent/70">Eventos ISTE</p>
              <h1 className="text-3xl font-semibold text-brand-primary">Control de Ingreso</h1>
              <p className="text-sm text-brand-accent/80">Rol asignado: {ROLE_LABELS[role]}</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <div className="text-sm text-brand-accent/80">
              <p className="font-medium text-brand-primary">Sesión iniciada</p>
              <p>{userEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-xl bg-brand-secondary px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-secondary/30 transition hover:bg-sky-400"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => (
            <Link
              key={option.href}
              href={option.href}
              className="group relative overflow-hidden rounded-3xl px-7 py-9 shadow-lg shadow-black/10 transition-transform hover:-translate-y-1"
              style={{ backgroundImage: option.gradient }}
            >
              <div className="absolute inset-0 bg-white/5 opacity-0 transition group-hover:opacity-100" aria-hidden />
              <div className="relative z-10">
                <span className="text-4xl" aria-hidden>
                  {option.icon}
                </span>
                <h2 className="mt-5 text-2xl font-semibold">{option.label}</h2>
                {option.description ? (
                  <p className="mt-3 text-sm text-white/80">{option.description}</p>
                ) : null}
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/90">
                  Ir al módulo
                  <span aria-hidden>→</span>
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
