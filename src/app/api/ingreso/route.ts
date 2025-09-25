import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { codigo } = await req.json();

    // Buscar el QR en la base
    const qr = await prisma.codigoQR.findUnique({
      where: { codigo },
    });

    if (!qr) {
      return NextResponse.json({ error: "QR no encontrado" }, { status: 404 });
    }

    // Validar usos
    if (qr.max_usos !== null && qr.usos_actual >= qr.max_usos) {
      return NextResponse.json({ error: "QR ya ha sido usado al máximo" }, { status: 400 });
    }

    // Registrar ingreso usando el ID real
    await prisma.ingreso.create({
      data: {
        codigoqrId: qr.id_codigo, // ✅ Aquí va el id_codigo, no el código string
        fecha: new Date(),
      },
    });

    // Incrementar el contador de usos
    const updatedQR = await prisma.codigoQR.update({
      where: { id_codigo: qr.id_codigo },
      data: { usos_actual: { increment: 1 } },
    });
    
    // Calcular disponibles
    const disponibles =
      updatedQR.max_usos !== null
        ? updatedQR.max_usos - updatedQR.usos_actual
        : "∞"; // infinito si no hay límite

    return NextResponse.json({
      success: true,
      message: `✅ Ingreso registrado: Disponibles ${disponibles} de ${updatedQR.max_usos ?? "∞"}`,
    });
  } catch (error) {
    console.error("Error en ingreso:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
