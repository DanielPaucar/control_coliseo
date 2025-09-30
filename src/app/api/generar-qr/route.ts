import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generarQRpng } from "@/lib/generarQR";
import { sendMail } from "@/utils/mailer";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { esEstudiante, cedula, max_usos } = await req.json();

    if (!max_usos || max_usos <= 0) {
      return NextResponse.json({ error: "Debe especificar un número válido de usos" }, { status: 400 });
    }

    if (esEstudiante) {
      const persona = await prisma.persona.findUnique({
        where: { cedula: String(cedula) },
      });

      if (!persona || persona.tipo_persona !== "est") {
        return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 });
      }

      const codigo = `EST-ADD-${persona.id_persona}-${Date.now().toString().slice(-6)}`;
      await prisma.codigoQR.create({
        data: {
          codigo,
          tipo_qr: "est",
          max_usos,
          usos_actual: 0,
          persona: { connect: { id_persona: persona.id_persona } },
        },
      });

      const pngFile = await generarQRpng(codigo, `${persona.nombre} ${persona.apellido}`, `${codigo}.png`);

      if (persona.correo) {
        await sendMail(
          persona.correo,
          "🎓 QR adicional estudiante",
          `Hola ${persona.nombre}, aquí está tu QR adicional con ${max_usos} usos.`,
          [
            {
              filename: `${codigo}.png`,
              path: path.join(process.cwd(), "public", pngFile.replace(/^\//, "")),
            },
          ]
        );
      }

      return NextResponse.json({
        success: true,
        mensaje: "QR generado y enviado al correo",
        codigo,
      });
    } else {
      const codigo = `VIS-ADD-${Date.now().toString().slice(-6)}`;

      await prisma.codigoQR.create({
        data: {
          codigo,
          tipo_qr: "vis",
          max_usos,
          usos_actual: 0,
        },
      });

      const pngFile = await generarQRpng(codigo, "VISITANTE", `${codigo}.png`);

      return NextResponse.json({
        success: true,
        mensaje: "QR visitante generado",
        codigo,
        imagen: `/public/${pngFile}`,
      });
    }
  } catch (err) {
    console.error("Error en generación de QR:", err);
    return NextResponse.json({ error: "Error al generar el QR" }, { status: 500 });
  }
}

