import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { cedula: string } }
) {
  try {
    const { cedula } = params;

    const persona = await prisma.persona.findUnique({
      where: { cedula: String(cedula) },
    });

    if (!persona || persona.tipo_persona !== "estudiante") {
      return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      id: persona.id_persona,
      nombre: persona.nombre,
      apellido: persona.apellido,
      correo: persona.correo,
    });
  } catch (err) {
    console.error("Error buscando estudiante:", err);
    return NextResponse.json({ error: "Error en servidor" }, { status: 500 });
  }
}
