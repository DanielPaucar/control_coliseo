import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

type DateRange = {
  start: Date;
  end: Date;
};

function buildDateRange(dateParam: string | null): DateRange | null {
  if (!dateParam) return null;

  const [yearStr, monthStr, dayStr] = dateParam.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const dateRange = buildDateRange(dateParam);

    const fechaFilter = dateRange ? { gte: dateRange.start, lte: dateRange.end } : undefined;

    const ingresos = await prisma.ingreso.findMany({
      where: fechaFilter ? { fecha: fechaFilter } : {},
      orderBy: { fecha: "desc" },
      include: {
        codigoqr: {
          select: {
            id_codigo: true,
            codigo: true,
            tipo_qr: true,
            max_usos: true,
            usos_actual: true,
            ventas: { select: { id: true } },
            persona: { select: { nombre: true, apellido: true } },
          },
        },
      },
    });

    const agrupadosMap = new Map<
      number,
      {
        codigo: string;
        tipo: "est" | "fam" | "vis";
        usosActual: number;
        maxUsos: number | null;
        totalIngresos: number;
        ultimaLectura: Date;
        persona: string | null;
        esAdicional: boolean;
      }
    >();

    for (const ingreso of ingresos) {
      const { codigoqr, fecha } = ingreso;
      const existente = agrupadosMap.get(codigoqr.id_codigo);

      if (!existente) {
        const nombrePersona = codigoqr.persona
          ? [codigoqr.persona.nombre, codigoqr.persona.apellido ?? ""].join(" ").trim() || null
          : null;

        agrupadosMap.set(codigoqr.id_codigo, {
          codigo: codigoqr.codigo,
          tipo: codigoqr.tipo_qr,
          usosActual: codigoqr.usos_actual,
          maxUsos: codigoqr.max_usos,
          totalIngresos: 1,
          ultimaLectura: fecha,
          persona: nombrePersona,
          esAdicional: codigoqr.ventas.length > 0,
        });
      } else {
        existente.totalIngresos += 1;
      }
    }

    const ingresosAgrupados = Array.from(agrupadosMap.values()).sort(
      (a, b) => b.ultimaLectura.getTime() - a.ultimaLectura.getTime()
    );

    let estudiantes = 0;
    let familiares = 0;
    let adicionales = 0;

    for (const registro of ingresosAgrupados) {
      const totalIngresos = registro.totalIngresos;

      if (registro.esAdicional) {
        adicionales += totalIngresos;
        continue;
      }

      if (registro.tipo === "est") {
        estudiantes += 1;
        if (totalIngresos > 1) {
          familiares += totalIngresos - 1;
        }
      } else {
        familiares += totalIngresos;
      }
    }

    const total = estudiantes + familiares + adicionales;

    return Response.json({
      total,
      estudiantes,
      familiares,
      adicionales,
      ingresosAgrupados: ingresosAgrupados.map((entrada) => ({
        ...entrada,
        ultimaLectura: entrada.ultimaLectura.toISOString(),
      })),
      selectedDate: dateRange ? dateRange.start.toISOString().slice(0, 10) : null,
    });
  } catch (err) {
    console.error(err);
    return new Response("Error en dashboard", { status: 500 });
  }
}
