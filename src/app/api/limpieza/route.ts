import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promises as fs } from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CONFIRMATION_TOKEN = "LIMPIAR TODO";
const CLEANUP_CONFIG_KEY = "limpieza_last_run";

type StatsSnapshot = {
  personas: number;
  codigos: number;
  ingresos: number;
  importaciones: number;
  ventas: number;
  cajas: number;
};

type DirectoryReport = {
  path: string;
  exists: boolean;
  files: number;
  bytes: number;
  error?: string;
};

type DirectoryCleanupResult = DirectoryReport & {
  deletedFiles: number;
  deletedBytes: number;
};

const prismaRecord = prisma as Record<string, unknown>;
const hasConfiguracionModel = Boolean(prismaRecord?.configuracion);
const hasCajaModel = Boolean(prismaRecord?.cajaTurno);
const hasVentaModel = Boolean(prismaRecord?.ventaAdicional);

function resolveCleanupTargets(): string[] {
  const envVar = process.env.EVENTS_CLEANUP_PATHS ?? "";
  const envPaths = envVar
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(process.cwd(), value));

  const fallbackCandidates = [
    path.resolve(process.cwd(), "../../../api-factura/output"),
    path.resolve(process.cwd(), "./tmp/qr"),
  ];

  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const candidate of [...envPaths, ...fallbackCandidates]) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    resolved.push(candidate);
  }

  return resolved;
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dir);
    return stats.isDirectory();
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function walkDirectory(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;

  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stats = await fs.lstat(full);

    if (stats.isDirectory()) {
      const nested = await walkDirectory(full);
      files += nested.files;
      bytes += nested.bytes;
    } else {
      files += 1;
      bytes += stats.size;
    }
  }

  return { files, bytes };
}

async function collectDirectoryReport(dir: string): Promise<DirectoryReport> {
  try {
    const exists = await directoryExists(dir);
    if (!exists) {
      return { path: dir, exists: false, files: 0, bytes: 0 };
    }

    const metrics = await walkDirectory(dir);
    return { path: dir, exists: true, files: metrics.files, bytes: metrics.bytes };
  } catch (error: unknown) {
    return {
      path: dir,
      exists: false,
      files: 0,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function collectDirectoryReports(dirs: string[]): Promise<DirectoryReport[]> {
  const reports: DirectoryReport[] = [];
  for (const dir of dirs) {
    reports.push(await collectDirectoryReport(dir));
  }
  return reports;
}

async function emptyDirectory(dir: string): Promise<{ deletedFiles: number; deletedBytes: number }> {
  let deletedFiles = 0;
  let deletedBytes = 0;

  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stats = await fs.lstat(full);

    if (stats.isDirectory()) {
      const nested = await walkDirectory(full);
      await fs.rm(full, { recursive: true, force: true });
      deletedFiles += nested.files;
      deletedBytes += nested.bytes;
    } else {
      await fs.rm(full, { force: true });
      deletedFiles += 1;
      deletedBytes += stats.size;
    }
  }

  return { deletedFiles, deletedBytes };
}

async function cleanDirectories(dirs: string[]): Promise<DirectoryCleanupResult[]> {
  const results: DirectoryCleanupResult[] = [];
  for (const dir of dirs) {
    const report = await collectDirectoryReport(dir);
    if (!report.exists) {
      results.push({ ...report, deletedFiles: 0, deletedBytes: 0 });
      continue;
    }

    try {
      const { deletedFiles, deletedBytes } = await emptyDirectory(dir);
      results.push({ ...report, deletedFiles, deletedBytes });
    } catch (error: unknown) {
      results.push({
        path: dir,
        exists: true,
        files: report.files,
        bytes: report.bytes,
        error: error instanceof Error ? error.message : String(error),
        deletedFiles: 0,
        deletedBytes: 0,
      });
    }
  }

  return results;
}

async function collectStats(): Promise<StatsSnapshot> {
  const prismaAny = prisma as Record<string, unknown>;
  const ventaDelegate = prismaAny?.ventaAdicional as { count?: () => Promise<number> } | undefined;
  const cajaDelegate = prismaAny?.cajaTurno as { count?: () => Promise<number> } | undefined;

  const ventasPromise =
    typeof ventaDelegate?.count === "function" ? ventaDelegate.count() : Promise.resolve(0);
  const cajasPromise =
    typeof cajaDelegate?.count === "function" ? cajaDelegate.count() : Promise.resolve(0);

  const [personas, codigos, ingresos, importaciones, ventas, cajas] = await Promise.all([
    prisma.persona.count(),
    prisma.codigoQR.count(),
    prisma.ingreso.count(),
    prisma.importacion.count(),
    ventasPromise,
    cajasPromise,
  ]);

  return { personas, codigos, ingresos, importaciones, ventas, cajas };
}

async function getLastCleanup(): Promise<string | null> {
  if (!hasConfiguracionModel) {
    return null;
  }

  try {
    const record = await (prisma as typeof prisma & {
      configuracion: { findUnique: (args: { where: { clave: string } }) => Promise<{ valor: string } | null> };
    }).configuracion.findUnique({ where: { clave: CLEANUP_CONFIG_KEY } });
    return record?.valor ?? null;
  } catch (error) {
    console.warn("No se pudo obtener la fecha de la última limpieza:", error);
    return null;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const cleanupTargets = resolveCleanupTargets();
    const [stats, directories, lastCleanupAt] = await Promise.all([
      collectStats(),
      collectDirectoryReports(cleanupTargets),
      getLastCleanup(),
    ]);

    return NextResponse.json({
      stats,
      directories,
      lastCleanupAt,
      confirmationToken: process.env.EVENTS_CLEANUP_TOKEN ?? DEFAULT_CONFIRMATION_TOKEN,
    });
  } catch (error: unknown) {
    console.error("Error obteniendo datos de limpieza:", error);
    return NextResponse.json({ error: "No se pudo obtener el estado de limpieza" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const confirmationInput = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
  const confirmationToken = process.env.EVENTS_CLEANUP_TOKEN ?? DEFAULT_CONFIRMATION_TOKEN;

  if (confirmationInput !== confirmationToken) {
    return NextResponse.json(
      { error: `Debes escribir "${confirmationToken}" para confirmar la limpieza completa.` },
      { status: 400 }
    );
  }

  const cleanupTargets = resolveCleanupTargets();
  const [statsBefore, directoriesBefore] = await Promise.all([
    collectStats(),
    collectDirectoryReports(cleanupTargets),
  ]);

  const timestamp = new Date().toISOString();

  try {
    const removed = await prisma.$transaction(async (tx) => {
      const txAny = tx as typeof prisma & Record<string, any>;

      const ventasDeleted = hasVentaModel ? await txAny.ventaAdicional.deleteMany() : { count: 0 };
      const ingresosDeleted = await tx.ingreso.deleteMany();
      const codigosDeleted = await tx.codigoQR.deleteMany();
      const personasDeleted = await tx.persona.deleteMany();
      const importacionesDeleted = await tx.importacion.deleteMany();
      const cajasDeleted = hasCajaModel ? await txAny.cajaTurno.deleteMany() : { count: 0 };

      if (hasConfiguracionModel) {
        await txAny.configuracion.upsert({
          where: { clave: CLEANUP_CONFIG_KEY },
          update: { valor: timestamp, actualizadoEn: new Date() },
          create: { clave: CLEANUP_CONFIG_KEY, valor: timestamp },
        });
      }

      return {
        personas: personasDeleted.count,
        codigos: codigosDeleted.count,
        ingresos: ingresosDeleted.count,
        importaciones: importacionesDeleted.count,
        ventas: ventasDeleted.count ?? 0,
        cajas: cajasDeleted.count ?? 0,
      };
    });

    const cleanedDirectories = await cleanDirectories(cleanupTargets);
    const [statsAfter, directoriesAfter] = await Promise.all([
      collectStats(),
      collectDirectoryReports(cleanupTargets),
    ]);

    return NextResponse.json({
      success: true,
      timestamp,
      database: {
        before: statsBefore,
        removed,
        after: statsAfter,
      },
      directories: {
        before: directoriesBefore,
        cleaned: cleanedDirectories,
        after: directoriesAfter,
      },
    });
  } catch (error: unknown) {
    console.error("Error ejecutando la limpieza:", error);
    return NextResponse.json({ error: "No se pudo completar la limpieza" }, { status: 500 });
  }
}
