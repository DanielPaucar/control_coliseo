"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { signIn, useSession } from "next-auth/react";

type LoginViewProps = {
  errorParam?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Tu cuenta no tiene acceso autorizado a esta aplicación. Verifica con el administrador que pertenezcas a uno de los grupos permitidos.",
  Configuration:
    "Hay un problema con la configuración de autenticación. Contacta al administrador para revisarlo.",
  Default: "No se pudo iniciar sesión. Intenta nuevamente.",
};

export function LoginView({ errorParam }: LoginViewProps) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const errorMessage = useMemo(() => {
    if (!errorParam) {
      return null;
    }
    return ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.Default;
  }, [errorParam]);

  const isCheckingSession = status === "loading";
  const isAuthenticated = status === "authenticated";

  return (
    <main className="min-h-screen bg-brand-gradient text-gray-100">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg overflow-hidden rounded-3xl card-surface">
          <div className="bg-gradient-to-r from-brand-primary to-brand-accent px-8 py-6 text-white">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/40 bg-white/10">
                <Image
                  src="/iste-logo.png"
                  alt="Eventos ISTE"
                  fill
                  sizes="56px"
                  className="object-contain p-2"
                  priority
                />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/70">Instituto Superior Tecnológico ISTE</p>
                <h1 className="text-3xl font-semibold leading-tight">Acceso al Panel de Eventos</h1>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-8 py-10 text-gray-800">
            <div className="space-y-2 text-center">
              <p className="text-lg font-medium text-brand-primary">Bienvenido 👋</p>
              <p className="text-sm text-gray-500">
                Usa tu cuenta institucional para acceder al sistema de control de ingreso.
              </p>
            </div>

            {errorMessage ? (
              <p className="rounded-xl border border-red-300 bg-red-50/80 px-4 py-3 text-sm text-red-700" role="alert">
                {errorMessage}
              </p>
            ) : null}

            {isCheckingSession ? (
              <p className="rounded-xl border border-brand-secondary/30 bg-white/70 px-4 py-3 text-sm text-brand-primary">
                Verificando si ya tienes una sesión activa…
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
              disabled={isAuthenticated}
              className="w-full rounded-xl bg-brand-secondary py-3 text-base font-semibold text-white shadow-md shadow-brand-secondary/40 transition hover:bg-sky-400 focus:outline-none focus:ring focus:ring-brand-secondary/40 disabled:cursor-not-allowed disabled:bg-sky-300"
            >
              {isAuthenticated ? "Redirigiendo…" : "Iniciar sesión con Entra ID"}
            </button>

            <div className="text-xs text-gray-500 space-y-2 text-center">
              <p>
                El acceso se concede solo a colaboradores incluidos en los grupos autorizados:
                <span className="block font-semibold text-brand-accent">
                  Unidad de TEI · Unidad de Financiero 
                </span>
              </p>
              <p>
                ¿Necesitas ayuda? Escríbenos a
                <Link className="text-brand-primary font-semibold" href="mailto:ti@iste.edu.ec">
                  {" "}
                  ti@iste.edu.ec
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
