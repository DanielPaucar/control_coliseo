"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { signIn, useSession } from "next-auth/react";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Tu cuenta no tiene acceso autorizado a esta aplicación. Verifica con el administrador que pertenezcas a uno de los grupos permitidos.",
  Configuration:
    "Hay un problema con la configuración de autenticación. Contacta al administrador para revisarlo.",
  Default: "No se pudo iniciar sesión. Intenta nuevamente.",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const errorKey = searchParams?.get("error");
  const errorMessage = useMemo(() => {
    if (!errorKey) {
      return null;
    }
    return ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.Default;
  }, [errorKey]);

  const isLoading = status === "loading" || status === "authenticated";

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-900 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold">Bienvenido 👋</h1>
          <p className="text-sm text-gray-500">
            Usa tu cuenta institucional para acceder al panel de control de eventos.
          </p>
        </div>

        {errorMessage ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
          disabled={isLoading}
          className="w-full flex justify-center items-center gap-2 rounded-lg bg-blue-600 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring focus:ring-blue-200 disabled:bg-blue-300"
        >
          {isLoading ? "Verificando sesión…" : "Iniciar sesión con Entra ID"}
        </button>

        <div className="text-xs text-gray-400 space-y-2 text-center">
          <p>
            El acceso se concede a miembros de los grupos:
            <br />
            <span className="font-medium text-gray-500">
              app-eventos-admins, app-eventos-financiero, app-eventos-guardia
            </span>
          </p>
          <p>
            ¿Necesitas ayuda? Escríbenos a
            <Link className="text-blue-600 font-medium" href="mailto:soporte@coliseo.com">
              {" "}
              soporte@coliseo.com
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
