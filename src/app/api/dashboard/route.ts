import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const estudiantes = await prisma.ingreso.count({ where: { codigoqr: { tipo_qr: "est" } } });
    const familiares = await prisma.ingreso.count({ where: { codigoqr: { tipo_qr: "fam" } } });
    const visitantes = await prisma.ingreso.count({ where: { codigoqr: { tipo_qr: "vis" } } });
    const total = estudiantes + familiares + visitantes;

    const ultimos = await prisma.ingreso.findMany({
      orderBy: { fecha: "desc" },
      take: 10,
      include: { codigoqr: true },
    });

    return Response.json({ total, estudiantes, familiares, visitantes, ultimos });
  } catch (err) {
    console.error(err);
    return new Response("Error en dashboard", { status: 500 });
  }
}
