import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generarQRpng } from "@/lib/generarQR";
import { sendMail } from "@/utils/mailer";

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

      const pngAsset = await generarQRpng(codigo, `${persona.nombre} ${persona.apellido}`, `${codigo}.png`);

      if (persona.correo) {
        const invitadosAdicionales = Math.max(0, totalPermitidos - 1);
        const invitadosTexto = invitadosAdicionales === 0
          ? "sin invitados adicionales"
          : invitadosAdicionales === 1
          ? "con 1 invitado adicional"
          : `Estudiante y ${invitadosAdicionales} invitados adicionales`;

        await sendMail(
          persona.correo,
          "🎓 Tu código QR para el evnto de Graduación",
          `Hola ${persona.nombre}, adjuntamos tu código QR único. Cuida este código y compártelo solo con tus invitados. Desde los 10 años se requiere boleto. Las entradas adicionales se venderán el día del evento en el lugar donde se desarrollará la ceremonia. Este QR permite el ingreso para ${totalPermitidos} persona(s) (${invitadosTexto}). Presenta el QR en el acceso.`,
          [
            {
              filename: `${codigo}.png`,
              content: pngAsset.buffer,
              contentType: "image/png",
            },
          ],
          `
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;color:#0b1d33;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:0;">
                <div style="background-color:#003976; padding:20px; text-align:center;">
                  <img src="https://yosoyistealmacenamiento.blob.core.windows.net/directorio-telefonico/iste.png" alt="ISTE" style="max-width:240px;"/>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 24px;">
                <p style="margin:0 0 12px;font-size:18px;font-weight:600;">Hola <strong>${persona.nombre} ${persona.apellido ?? ""}</strong>,</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                  Adjuntamos tu <strong>código QR único</strong> para la ceremonia de graduación. Este QR habilita el acceso para <strong>${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}</strong> (${invitadosTexto}).
                </p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                  ¡Te esperamos para celebrar juntos! 
                </p>
                <p style="margin:0 0 12px;font-size:18px;font-weight:600;"><strong>Importante</strong> </p>
                <ul style="margin:0 0 12px 18px;padding:0;font-size:15px;line-height:1.6;">
                  <li style="margin-bottom:8px;">
                    Cuida este código y compártelo únicamente con tus invitados.
                  </li>
                  <li>
                    A partir de los <strong>10 años</strong> cada persona debe contar con su propio boleto.
                  </li>
                </ul>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                  ¿Necesitas más entradas? Podrás comprarlas el día del evento en el lugar donde se llevará a cabo la ceremonia.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <div style="margin-top:12px;border-radius:16px;background:#ffffff;border:1px solid #d6e3f5;padding:20px;font-size:14px;color:#0b1d33;">
                  <p style="margin:0;font-weight:600;">Consejo rápido</p>
                  <p style="margin:8px 0 0;line-height:1.6;">Presenta el código en la entrada y asegúrate de que la pantalla tenga buen brillo para agilizar el acceso.</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #d6e3f5;">
                  <tr>
                    <td style="padding:20px;text-align:justify;font-size:13px;color:#0b1d33;line-height:1.6;border-bottom:1px solid #2167b1;">
                      “En cumplimiento con lo establecido en la Ley Orgánica de Protección de Datos Personales y el Reglamento,
                      el ISTE garantiza la confidencialidad y privacidad de los datos personales que trata. Este correo es
                      confidencial. Si no eres el destinatario, está prohibido usarlo, copiarlo o difundirlo; devuélvelo y elimínalo.”
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 20px 16px;text-align:center;font-size:12px;color:#7f8c8d;">
                      © 2025 Unidad de TEI - ISTE. Todos los derechos reservados.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
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

      const pngAsset = await generarQRpng(codigo, "VISITANTE", `${codigo}.png`);

      return NextResponse.json({
        success: true,
        mensaje: `QR visitante generado con capacidad para ${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}`,
        codigo,
        imagen: pngAsset.dataUrl,
      });
    }
  } catch (err) {
    console.error("Error en generación de QR:", err);
    return NextResponse.json({ error: "Error al generar el QR" }, { status: 500 });
  }
}
