import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generarQRpng } from "@/lib/generarQR";
import { sendMail } from "@/utils/mailer";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { esEstudiante, cedula, max_usos } = await req.json();
    const requestedMax = Number(max_usos);

    if (!Number.isFinite(requestedMax) || requestedMax <= 0) {
      return NextResponse.json({ error: "Debe especificar un número válido de usos" }, { status: 400 });
    }

    if (esEstudiante) {
      const persona = await prisma.persona.findUnique({
        where: { cedula: String(cedula) },
      });

      if (!persona || persona.tipo_persona !== "estudiante") {
        return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 });
      }

      const totalPermitidos = Math.max(1, requestedMax);
      const codigo = `EST-ADD-${persona.id_persona}-${Date.now().toString().slice(-6)}`;
      await prisma.codigoQR.create({
        data: {
          codigo,
          tipo_qr: "est",
          max_usos: totalPermitidos,
          usos_actual: 0,
          persona: { connect: { id_persona: persona.id_persona } },
        },
      });

      const pngFile = await generarQRpng(codigo, `${persona.nombre} ${persona.apellido}`, `${codigo}.png`);

      if (persona.correo) {
        const invitadosAdicionales = Math.max(0, totalPermitidos - 1);
        const invitadosTexto = invitadosAdicionales === 0
          ? "sin invitados adicionales"
          : invitadosAdicionales === 1
          ? "con 1 invitado adicional"
          : `con ${invitadosAdicionales} invitados adicionales`;

        await sendMail(
          persona.correo,
          "🎟️ Tu código QR para el evento",
          `Hola ${persona.nombre}, adjuntamos tu código QR único. Este código permite el ingreso para ${totalPermitidos} persona(s) (${invitadosTexto}). Presenta el QR en el acceso.`,
          [
            {
              filename: `${codigo}.png`,
              path: path.join(process.cwd(), "public", pngFile.replace(/^\//, "")),
            },
          ],
          `
          <p>Hola <strong>${persona.nombre} ${persona.apellido ?? ""}</strong>,</p>
          <p>Adjuntamos tu <strong>código QR único</strong> para ingresar al evento.</p>
          <p>Este QR habilita el acceso para <strong>${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}</strong> (${invitadosTexto}).</p>
          <p>Presenta el código en el punto de control de ingreso. ¡Te esperamos!</p>
          `
        );
      }

      return NextResponse.json({
        success: true,
        mensaje: `QR generado con capacidad para ${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}`,
        codigo,
      });
    } else {
      const totalPermitidos = Math.max(1, requestedMax);
      const codigo = `VIS-ADD-${Date.now().toString().slice(-6)}`;

      await prisma.codigoQR.create({
        data: {
          codigo,
          tipo_qr: "vis",
          max_usos: totalPermitidos,
          usos_actual: 0,
        },
      });

      const pngFile = await generarQRpng(codigo, "VISITANTE", `${codigo}.png`);

      return NextResponse.json({
        success: true,
        mensaje: `QR visitante generado con capacidad para ${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}`,
        codigo,
        imagen: `/public/${pngFile}`,
      });
    }
  } catch (err) {
    console.error("Error en generación de QR:", err);
    return NextResponse.json({ error: "Error al generar el QR" }, { status: 500 });
  }
}
