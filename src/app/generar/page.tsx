"use client";

export default function GenerarQRPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-brand-sheen" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <section className="card-surface rounded-3xl px-8 py-12 text-brand-primary">
          <h1 className="text-3xl font-semibold">Módulo deshabilitado</h1>
          <p className="mt-4 text-sm text-brand-accent/80">
            La generación de códigos adicionales se administra ahora desde la sección
            <strong> "Generar QR adicional"</strong> en el menú principal.
          </p>
          <p className="mt-2 text-sm text-brand-accent/80">
            Desde allí podrás abrir o cerrar caja, definir el precio del boleto, enviar códigos por correo y descargar
            los PDF correspondientes.
          </p>
        </section>
      </div>
    </main>
  );
}
