import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eventos ISTE",
  description: "Panel de control de ingreso y gestión de eventos del Instituto Superior Tecnológico ISTE.",
  openGraph: {
    title: "Eventos ISTE",
    description:
      "Supervisa el control de ingreso, escaneo de códigos QR y métricas en tiempo real para los eventos del ISTE.",
    siteName: "Eventos ISTE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <header className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex items-center">
            <Link
              href="/"
              className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/70 text-brand-primary shadow-lg shadow-black/20 backdrop-blur transition hover:scale-105 hover:bg-white"
              aria-label="Ir al inicio"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6 text-brand-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3.5 11.5 12 4l8.5 7.5" />
                <path d="M6.5 10.5V19a1 1 0 0 0 1 1H16.5a1 1 0 0 0 1-1v-8.5" />
              </svg>
            </Link>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
