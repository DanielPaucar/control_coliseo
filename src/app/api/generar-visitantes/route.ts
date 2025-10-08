import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { generarQRpng } from "@/lib/generarQR";
import { createPdfDocument } from "@/lib/pdf";
import { sendMail } from "@/utils/mailer";

const PRECIO_KEY = "precio_boleto";
const DEFAULT_PRICE = 5;
const REPORT_RECIPIENTS = ["alexis.veloz@iste.edu.ec", "soporte.ti@iste.edu.ec"];

type VentaLike = {
  precio: number | string;
  cantidad?: number | string | null;
};

const prismaRecord = prisma as Record<string, unknown>;
const hasConfiguracionModel = Boolean(prismaRecord?.configuracion);
const hasCajaModel = Boolean(prismaRecord?.cajaTurno) && Boolean(prismaRecord?.ventaAdicional);

async function ensurePrecioUnitario() {
  if (!hasConfiguracionModel) {
    return { clave: PRECIO_KEY, valor: DEFAULT_PRICE.toString() };
  }

  try {
    const existing = await prisma.configuracion.findUnique({ where: { clave: PRECIO_KEY } });
    if (existing) {
      return existing;
    }

    return prisma.configuracion.create({ data: { clave: PRECIO_KEY, valor: DEFAULT_PRICE.toString() } });
  } catch (error) {
    console.warn("Configuración no disponible, usando precio por defecto", error);
    return { clave: PRECIO_KEY, valor: DEFAULT_PRICE.toString() };
  }
}

function parseDecimal(value: string | null | undefined) {
  const numeric = Number(value ?? "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

async function obtenerCajaActiva() {
  if (!hasCajaModel) {
    return null;
  }

  return prisma.cajaTurno.findFirst({
    where: { abierto: true },
    include: {
      ventas: {
        orderBy: { createdAt: "desc" },
        include: { codigo: true },
      },
    },
  });
}

function calcularTotales(ventas: VentaLike[]) {
  return ventas.reduce((acc, venta) => acc + Number(venta.precio) * Number(venta.cantidad ?? 1), 0);
}

function calcularBoletos(ventas: Array<{ cantidad?: number | string | null }>) {
  return ventas.reduce((acc, venta) => acc + Number(venta.cantidad ?? 1), 0);
}

function mapCaja(caja: Awaited<ReturnType<typeof obtenerCajaActiva>>) {
  if (!caja) {
    return null;
  }
  const totalTickets = calcularBoletos(caja.ventas);
  const totalRecaudado = calcularTotales(caja.ventas);
  return {
    id: caja.id,
    abierto: caja.abierto,
    abiertoPor: caja.abiertoPor,
    abiertoAt: caja.abiertoAt,
    totalTickets,
    totalRecaudado,
  };
}

async function buildTicketPdf({
  codigo,
  qrBuffer,
  cantidad,
  precioUnitario,
  total,
}: {
  codigo: string;
  qrBuffer: Buffer;
  cantidad: number;
  precioUnitario: number;
  total: number;
}) {
  const doc = createPdfDocument({ margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  doc.roundedRect(30, 30, 550, 780, 16).stroke("#003976");
  doc.font("Roboto").fontSize(22).fillColor("#003976").text("Eventos ISTE", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor("#29598c").text("Boleto adicional", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).fillColor("#0b1d33");
  doc.text(`Código: ${codigo}`, { align: "center" });
  doc.text(`Capacidad: ${cantidad} ingreso(s)`, { align: "center" });
  doc.text(`Precio unitario: $${precioUnitario.toFixed(2)}`, { align: "center" });
  doc.text(`Total de la compra: $${total.toFixed(2)}`, { align: "center" });
  doc.moveDown(1.5);

  const x = (doc.page.width - 220) / 2;
  doc.rect(x - 10, doc.y - 10, 240, 260).fillOpacity(0.05).fillAndStroke("#00a6f2", "#00a6f2");
  doc.fillOpacity(1).image(qrBuffer, x, doc.y, { fit: [220, 220] });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#29598c").text("Presenta este código en el punto de control", {
    align: "center",
  });

  doc.end();
  return finished;
}

async function buildClosingReportPdf({
  caja,
  ventas,
  totalBoletos,
  totalRecaudado,
  cerradoPor,
}: {
  caja: NonNullable<Awaited<ReturnType<typeof obtenerCajaActiva>>>;
  ventas: Awaited<ReturnType<typeof prisma.ventaAdicional.findMany>>;
  totalBoletos: number;
  totalRecaudado: number;
  cerradoPor: string;
}) {
  const doc = createPdfDocument({ margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  doc.font("Roboto").fontSize(24).fillColor("#003976").text("Reporte de cierre de caja", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).fillColor("#0b1d33");
  doc.text(`Caja ID: ${caja.id}`);
  doc.text(`Abierta por: ${caja.abiertoPor ?? "-"}`);
  doc.text(`Fecha apertura: ${new Date(caja.abiertoAt).toLocaleString("es-EC")}`);
  doc.text(`Cerrada por: ${cerradoPor || caja.cerradoPor || "-"}`);
  doc.text(`Fecha cierre: ${new Date().toLocaleString("es-EC")}`);
  doc.moveDown();

  doc.fontSize(12).fillColor("#29598c").text(`Total boletos emitidos: ${totalBoletos}`);
  doc.text(`Total recaudado: $${totalRecaudado.toFixed(2)}`);
  doc.moveDown();

  doc.fontSize(12).fillColor("#003976").text("Detalle de ventas", { underline: true });
  doc.moveDown(0.5);

  ventas.forEach((venta, index) => {
    const cantidad = Number(venta.cantidad ?? 1);
    const total = Number(venta.precio) * cantidad;
    doc.fontSize(10).fillColor("#0b1d33").text(
      `${index + 1}. Código: ${venta.codigo.codigo} | Cantidad: ${cantidad} | Unitario: $${Number(
        venta.precio
      ).toFixed(2)} | Total: $${total.toFixed(2)} | Fecha: ${new Date(venta.createdAt).toLocaleString("es-EC")}`
    );
  });

  doc.end();
  return finished;
}

async function sendClosingReport({
  buffer,
  totalBoletos,
  totalRecaudado,
}: {
  buffer: Buffer;
  totalBoletos: number;
  totalRecaudado: number;
}) {
  const subject = "Reporte de cierre de caja - Eventos ISTE";
  const plain = `Cierre de caja completado.
Boletos: ${totalBoletos}
Total recaudado: $${totalRecaudado.toFixed(2)}.`;
  const html = `
    <p>Hola equipo,</p>
    <p>Adjuntamos el reporte de cierre de caja.</p>
    <p><strong>Boletos emitidos:</strong> ${totalBoletos}<br/>
       <strong>Total recaudado:</strong> $${totalRecaudado.toFixed(2)}</p>
    <p>Saludos.</p>
  `;

  await sendMail(
    REPORT_RECIPIENTS.join(", "),
    subject,
    plain,
    [
      {
        filename: `reporte-cierre-caja-${Date.now()}.pdf`,
        content: buffer,
      },
    ],
    html
  );
}

function summarizeClosure(closure: {
  id: number;
  abiertoPor: string | null;
  cerradoPor: string | null;
  abiertoAt: Date;
  cerradoAt: Date | null;
  ventas: VentaLike[];
}) {
  return {
    id: closure.id,
    abiertoPor: closure.abiertoPor,
    cerradoPor: closure.cerradoPor,
    abiertoAt: closure.abiertoAt,
    cerradoAt: closure.cerradoAt,
    totalTickets: calcularBoletos(closure.ventas),
    totalRecaudado: calcularTotales(closure.ventas),
  };
}

export async function GET() {
  await ensurePrecioUnitario();

  if (!hasConfiguracionModel || !hasCajaModel) {
    return NextResponse.json({
      precioUnitario: DEFAULT_PRICE,
      caja: null,
      historial: [],
      closures: [],
      warning:
        "El modelo de caja aún no está disponible en la base de datos. Se muestra el precio por defecto de $5.",
    });
  }

  const [precioConfig, cajaActiva, historial, closures] = await Promise.all([
    prisma.configuracion.findUnique({ where: { clave: PRECIO_KEY } }),
    obtenerCajaActiva(),
    prisma.ventaAdicional.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { codigo: true },
    }),
    prisma.cajaTurno.findMany({
      where: { abierto: false },
      orderBy: { cerradoAt: "desc" },
      take: 20,
      include: { ventas: true },
    }),
  ]);

  const precioUnitario = parseDecimal(precioConfig?.valor ?? DEFAULT_PRICE.toString());
  const cajaMap = mapCaja(cajaActiva);

  const historialMap = historial.map((venta) => {
    const cantidad = Number(venta.cantidad ?? 1);
    const total = Number(venta.precio) * cantidad;
    return {
      id: venta.id,
      codigo: venta.codigo.codigo,
      precio: Number(venta.precio),
      cantidad,
      total,
      correo: venta.correo,
      enviadoPorCorreo: venta.enviadoPorCorreo,
      createdAt: venta.createdAt,
      cajaId: venta.cajaId,
    };
  });

  const closuresMap = Array.isArray(closures) ? closures.map(summarizeClosure) : [];

  return NextResponse.json({
    precioUnitario,
    caja: cajaMap,
    historial: historialMap,
    closures: closuresMap,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const userEmail = session?.user?.email ?? "";

  const body = await req.json();
  const action = body?.action as string | undefined;

  if (!action) {
    return NextResponse.json({ error: "Acción no especificada" }, { status: 400 });
  }

  await ensurePrecioUnitario();

  switch (action) {
    case "open": {
      if (!hasCajaModel) {
        return NextResponse.json({ error: "Funcionalidad de caja no disponible. Ejecuta la migración." }, { status: 503 });
      }

      const existing = await obtenerCajaActiva();
      if (existing) {
        return NextResponse.json({ error: "Ya existe una caja abierta" }, { status: 400 });
      }

      const nueva = await prisma.cajaTurno.create({
        data: {
          abierto: true,
          abiertoPor: userEmail,
        },
        include: {
          ventas: true,
        },
      });

      return NextResponse.json({ caja: mapCaja(nueva) });
    }

    case "close": {
      if (!hasCajaModel) {
        return NextResponse.json({ error: "Funcionalidad de caja no disponible. Ejecuta la migración." }, { status: 503 });
      }

      const caja = await obtenerCajaActiva();
      if (!caja) {
        return NextResponse.json({ error: "No hay una caja abierta" }, { status: 400 });
      }

      const ventas = await prisma.ventaAdicional.findMany({
        where: { cajaId: caja.id },
        orderBy: { createdAt: "asc" },
        include: { codigo: true },
      });

      const totalBoletos = calcularBoletos(ventas);
      const totalRecaudado = calcularTotales(ventas);

      const reportPdf = await buildClosingReportPdf({
        caja,
        ventas,
        totalBoletos,
        totalRecaudado,
        cerradoPor: userEmail,
      });
      await sendClosingReport({ buffer: reportPdf, totalBoletos, totalRecaudado });

      const cerrada = await prisma.cajaTurno.update({
        where: { id: caja.id },
        data: {
          abierto: false,
          cerradoAt: new Date(),
          cerradoPor: userEmail,
        },
        include: { ventas: true },
      });

      return NextResponse.json({ caja: mapCaja(cerrada), reportSent: true });
    }

    case "updatePrice": {
      if (role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      const nuevoPrecio = Number(body?.precio);
      if (!Number.isFinite(nuevoPrecio) || nuevoPrecio < 0) {
        return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
      }

      if (!hasConfiguracionModel) {
        return NextResponse.json({
          precioUnitario: DEFAULT_PRICE,
          warning: "Configuración no disponible. Se mantiene el precio por defecto de $5.",
        });
      }

      try {
        const actualizado = await prisma.configuracion.update({
          where: { clave: PRECIO_KEY },
          data: { valor: nuevoPrecio.toString(), actualizadoEn: new Date() },
        });

        return NextResponse.json({ precioUnitario: parseDecimal(actualizado.valor) });
      } catch (error) {
        console.error("No se pudo actualizar el precio", error);
        return NextResponse.json(
          { error: "No se pudo actualizar el precio en la base de datos", precioUnitario: DEFAULT_PRICE },
          { status: 500 }
        );
      }
    }

    case "generate": {
      if (!hasCajaModel) {
        return NextResponse.json({ error: "Funcionalidad de caja no disponible. Ejecuta la migración." }, { status: 503 });
      }

      const { cantidad, correo, sendEmail } = body as {
        cantidad: number;
        correo?: string | null;
        sendEmail?: boolean;
      };

      if (!cantidad || cantidad <= 0) {
        return NextResponse.json({ error: "Debes indicar la cantidad de QR a generar" }, { status: 400 });
      }

      const caja = await obtenerCajaActiva();
      if (!caja) {
        return NextResponse.json({ error: "Debes abrir la caja antes de generar QR" }, { status: 400 });
      }

      const precioConfig = await prisma.configuracion.findUnique({ where: { clave: PRECIO_KEY } });
      const precioUnitario = parseDecimal(precioConfig?.valor ?? DEFAULT_PRICE.toString());
      const totalRecaudado = precioUnitario * cantidad;

      const emailLimpio = typeof correo === "string" ? correo.trim() : "";
      const enviarCorreo = Boolean(sendEmail && emailLimpio);

      const codigo = `VIS-ADD-${caja.id}-${Date.now()}`;
      const codigoRecord = await prisma.codigoQR.create({
        data: {
          codigo,
          tipo_qr: "vis",
          max_usos: cantidad,
          usos_actual: 0,
        },
      });

      const qrAsset = await generarQRpng(codigo, "Eventos ISTE", `${codigo}.png`);
      const qrBuffer = qrAsset.buffer;

      await prisma.ventaAdicional.create({
        data: {
          codigo: { connect: { id_codigo: codigoRecord.id_codigo } },
          caja: { connect: { id: caja.id } },
          precio: precioUnitario,
          cantidad,
          correo: emailLimpio || null,
          enviadoPorCorreo: enviarCorreo,
        },
      });

      if (enviarCorreo) {
        const html = `
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
                <p style="margin:0 0 12px;font-size:18px;font-weight:600;">Hola,</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                  Adjuntamos el código QR para el ingreso de <strong>${cantidad} persona(s)</strong>.
                </p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                  ¡Felicitaciones por este gran paso! Te esperamos para celebrar la ceremonia de graduación.
                </p>
                <ul style="margin:0 0 12px 18px;padding:0;font-size:15px;line-height:1.6;">
                  <li style="margin-bottom:8px;">
                    Cuida este código y compártelo únicamente con tus personas invitadas.
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
                <p style="margin:0;font-size:15px;line-height:1.6;">
                  Precio unitario: <strong>$${precioUnitario.toFixed(2)}</strong><br/>
                  Monto total: <strong>$${totalRecaudado.toFixed(2)}</strong>
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

        await sendMail(
          emailLimpio,
          "🎟️ Tu código QR adicional",
          `Adjuntamos el código QR válido para ${cantidad} persona(s). Recuerda: cuida tu código, cobra entrada desde los 10 años y para boletos extra comunícate al 099 556 9101 o 099 979 1099. Total recaudado: $${totalRecaudado.toFixed(2)}.`,
          [
            {
              filename: `${codigo}.png`,
              content: qrAsset.buffer,
              contentType: "image/png",
            },
          ],
          html
        );

        return NextResponse.json({ success: true, cantidad, total: totalRecaudado });
      }

      const pdfBuffer = await buildTicketPdf({
        codigo,
        qrBuffer,
        cantidad,
        precioUnitario,
        total: totalRecaudado,
      });

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=qr-adicional-${Date.now()}.pdf`,
        },
      });
    }

    case "details": {
      if (role !== "admin" && role !== "finance" && role !== "financiero") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      if (!hasCajaModel) {
        return NextResponse.json({ error: "Funcionalidad de caja no disponible. Ejecuta la migración." }, { status: 503 });
      }

      const cajaId = Number(body?.cajaId);
      if (!Number.isInteger(cajaId)) {
        return NextResponse.json({ error: "Identificador de caja inválido" }, { status: 400 });
      }

      const cierre = await prisma.cajaTurno.findUnique({
        where: { id: cajaId },
        include: {
          ventas: {
            orderBy: { createdAt: "asc" },
            include: { codigo: true },
          },
        },
      });

      if (!cierre || cierre.abierto) {
        return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
      }

      const totalBoletos = calcularBoletos(cierre.ventas);
      const totalRecaudado = calcularTotales(cierre.ventas);

      const ventasDetalle = cierre.ventas.map((venta) => {
        const cantidad = Number(venta.cantidad ?? 1);
        const total = Number(venta.precio) * cantidad;
        return {
          id: venta.id,
          codigo: venta.codigo.codigo,
          cantidad,
          precio: Number(venta.precio),
          total,
          correo: venta.correo,
          enviadoPorCorreo: venta.enviadoPorCorreo,
          createdAt: venta.createdAt,
        };
      });

      return NextResponse.json({
        summary: {
          id: cierre.id,
          abiertoPor: cierre.abiertoPor,
          cerradoPor: cierre.cerradoPor,
          abiertoAt: cierre.abiertoAt,
          cerradoAt: cierre.cerradoAt,
          totalBoletos,
          totalRecaudado,
        },
        ventas: ventasDetalle,
      });
    }

    case "deleteClosure": {
      if (role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      if (!hasCajaModel) {
        return NextResponse.json({ error: "Funcionalidad de caja no disponible. Ejecuta la migración." }, { status: 503 });
      }

      const cajaId = Number(body?.cajaId);
      if (!Number.isInteger(cajaId)) {
        return NextResponse.json({ error: "Identificador de cierre inválido" }, { status: 400 });
      }

      const cierre = await prisma.cajaTurno.findUnique({
        where: { id: cajaId },
        include: {
          ventas: {
            include: { codigo: true },
          },
        },
      });

      if (!cierre || cierre.abierto) {
        return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
      }

      const ventaIds = cierre.ventas.map((venta) => venta.id);
      const codigoIds = cierre.ventas
        .map((venta) => venta.codigo?.id_codigo)
        .filter((id): id is number => typeof id === "number");

      if (ventaIds.length) {
        await prisma.ventaAdicional.deleteMany({ where: { id: { in: ventaIds } } });
      }
      if (codigoIds.length) {
        await prisma.codigoQR.deleteMany({ where: { id_codigo: { in: codigoIds } } });
      }

      await prisma.cajaTurno.delete({ where: { id: cajaId } });

      return NextResponse.json({ success: true });
    }

    case "closures": {
      if (!hasCajaModel) {
        return NextResponse.json({ closures: [] });
      }

      const closures = await prisma.cajaTurno.findMany({
        where: { abierto: false },
        orderBy: { cerradoAt: "desc" },
        take: 20,
        include: { ventas: true },
      });

      return NextResponse.json({ closures: closures.map(summarizeClosure) });
    }

    default:
      return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  }
}
