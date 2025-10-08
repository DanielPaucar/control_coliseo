import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { generarQRpng } from "@/lib/generarQR";
import { sendMail } from "@/utils/mailer";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeCedula(value: string | null) {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D+/g, "").trim();
  return digits.length ? digits : null;
}

function invitadosTexto(totalPermitidos: number) {
  const invitadosAdicionales = Math.max(totalPermitidos - 1, 0);
  if (invitadosAdicionales === 0) return "sin invitados adicionales";
  if (invitadosAdicionales === 1) return "con 1 invitado adicional";
  return `con ${invitadosAdicionales} invitados adicionales`;
}

function buildPlainText(nombre: string, totalPermitidos: number) {
  return `Hola ${nombre}, adjuntamos tu código QR único. Cuida este código y compártelo solo con tus invitados. Desde los 10 años se requiere boleto. Para entradas adicionales comunícate al 099 556 9101 o 099 979 1099. Este QR permite el ingreso para ${totalPermitidos} persona(s) (${invitadosTexto(totalPermitidos)}). Presenta el QR en el acceso.`;
}

function buildHtmlMail(nombre: string, apellido: string | null, totalPermitidos: number) {
  return `
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
          <p style="margin:0 0 12px;font-size:18px;font-weight:600;">Hola <strong>${nombre}${apellido ? ` ${apellido}` : ""}</strong>,</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
            Adjuntamos tu <strong>código QR único</strong> para la ceremonia de graduación. Este QR permite el ingreso para <strong>${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}</strong> (${invitadosTexto(totalPermitidos)}).
          </p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
            ¡Felicitaciones por este gran logro! Te esperamos para celebrarlo.
          </p>
          <ul style="margin:0 0 12px 18px;padding:0;font-size:15px;line-height:1.6;">
            <li style="margin-bottom:8px;">
              Cuida este código y compártelo únicamente con tus invitados.
            </li>
            <li>
              Desde los <strong>10 años</strong> se requiere boleto individual.
            </li>
          </ul>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
            ¿Necesitas entradas adicionales? Contáctanos por WhatsApp o llamada al
            <a href="tel:+593995569101" style="color:#003976;text-decoration:none;font-weight:600;">099 556 9101</a>
            o
            <a href="tel:+593999791099" style="color:#003976;text-decoration:none;font-weight:600;">099 979 1099</a>.
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
  `;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const cedulaParam = req.nextUrl.searchParams.get("cedula");
  const cedula = normalizeCedula(cedulaParam);

  if (!cedula) {
    return NextResponse.json({ error: "Debes ingresar una cédula válida" }, { status: 400 });
  }

  const persona = await prisma.persona.findUnique({
    where: { cedula },
    include: {
      codigoqr: {
        orderBy: { id_codigo: "desc" },
        include: {
          ingresos: {
            orderBy: { fecha: "desc" },
            take: 1,
          },
          _count: {
            select: { ingresos: true },
          },
        },
      },
    },
  });

  if (!persona) {
    return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
  }

  const codigos = persona.codigoqr.map((codigo) => {
    const ultimaLectura = codigo.ingresos[0]?.fecha ?? null;
    return {
      id: codigo.id_codigo,
      codigo: codigo.codigo,
      tipo: codigo.tipo_qr,
      maxUsos: codigo.max_usos,
      usosActual: codigo.usos_actual,
      disponibles: Math.max(codigo.max_usos - codigo.usos_actual, 0),
      totalIngresos: codigo._count?.ingresos ?? 0,
      ultimaLectura,
    };
  });

  return NextResponse.json({
    persona: {
      id: persona.id_persona,
      nombre: persona.nombre,
      apellido: persona.apellido,
      correo: persona.correo,
      cedula: persona.cedula,
      tipo: persona.tipo_persona,
      codigos,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const action = body?.action;

  if (action !== "resend") {
    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  }

  const codigoId = Number(body?.codigoId);
  if (!Number.isFinite(codigoId) || codigoId <= 0) {
    return NextResponse.json({ error: "Identificador de QR inválido" }, { status: 400 });
  }

  const codigo = await prisma.codigoQR.findUnique({
    where: { id_codigo: codigoId },
    include: { persona: true },
  });

  if (!codigo) {
    return NextResponse.json({ error: "QR no encontrado" }, { status: 404 });
  }

  const destinatario = typeof body?.correo === "string" ? body.correo.trim() : "";
  const correoObjetivo = destinatario || codigo.persona?.correo || "";

  if (!correoObjetivo || !EMAIL_REGEX.test(correoObjetivo)) {
    return NextResponse.json({ error: "Debe proporcionar un correo válido para reenviar el QR" }, { status: 400 });
  }

  if (codigo.persona && codigo.persona.correo !== correoObjetivo) {
    await prisma.persona.update({
      where: { id_persona: codigo.persona.id_persona },
      data: { correo: correoObjetivo },
    });
  }

  const nombre = codigo.persona?.nombre ?? "Invitado";
  const apellido = codigo.persona?.apellido ?? null;
  const nombreCompleto = `${nombre}${apellido ? ` ${apellido}` : ""}`.trim() || "Invitado";
  const totalPermitidos = Number.isFinite(codigo.max_usos) ? codigo.max_usos : 1;

  const qrAsset = await generarQRpng(codigo.codigo, nombreCompleto, `${codigo.codigo}.png`);
  const textoPlano = buildPlainText(nombreCompleto, totalPermitidos);
  const htmlContenido = buildHtmlMail(nombre, apellido, totalPermitidos);

  await sendMail(
    correoObjetivo,
    "🎓 Tu código QR para la graduación",
    textoPlano,
    [
      {
        filename: qrAsset.fileName,
        content: qrAsset.buffer,
        contentType: "image/png",
      },
    ],
    htmlContenido
  );

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const codigoId = Number(body?.codigoId);
  const maxUsosParam = Number(body?.maxUsos);

  if (!Number.isFinite(codigoId) || codigoId <= 0) {
    return NextResponse.json({ error: "Identificador de QR inválido" }, { status: 400 });
  }

  if (!Number.isFinite(maxUsosParam) || maxUsosParam <= 0) {
    return NextResponse.json({ error: "El número de entradas debe ser un entero positivo" }, { status: 400 });
  }

  const nuevoMaxUsos = Math.floor(maxUsosParam);

  const codigo = await prisma.codigoQR.findUnique({
    where: { id_codigo: codigoId },
  });

  if (!codigo) {
    return NextResponse.json({ error: "QR no encontrado" }, { status: 404 });
  }

  if (nuevoMaxUsos < codigo.usos_actual) {
    return NextResponse.json(
      { error: "El nuevo límite no puede ser inferior a los usos ya registrados" },
      { status: 400 }
    );
  }

  const actualizado = await prisma.codigoQR.update({
    where: { id_codigo: codigoId },
    data: { max_usos: nuevoMaxUsos },
    include: {
      ingresos: {
        orderBy: { fecha: "desc" },
        take: 1,
      },
      _count: {
        select: { ingresos: true },
      },
    },
  });

  const ultimaLectura = actualizado.ingresos[0]?.fecha ?? null;

  return NextResponse.json({
    codigo: {
      id: actualizado.id_codigo,
      codigo: actualizado.codigo,
      tipo: actualizado.tipo_qr,
      maxUsos: actualizado.max_usos,
      usosActual: actualizado.usos_actual,
      disponibles: Math.max(actualizado.max_usos - actualizado.usos_actual, 0),
      totalIngresos: actualizado._count?.ingresos ?? 0,
      ultimaLectura,
    },
  });
}
