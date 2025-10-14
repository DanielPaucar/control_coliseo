import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { generarQRpng } from "@/lib/generarQR";
import { createPdfDocument } from "@/lib/pdf";
import { sendMail } from "@/utils/mailer";

const PRECIO_KEY = "precio_boleto";
const LIMIT_KEY = "limite_boletos";
const DEFAULT_PRICE = 5;
const DEFAULT_LIMIT = 0;
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

async function ensureLimiteBoletos() {
  if (!hasConfiguracionModel) {
    return { clave: LIMIT_KEY, valor: DEFAULT_LIMIT.toString() };
  }

  try {
    const existing = await prisma.configuracion.findUnique({ where: { clave: LIMIT_KEY } });
    if (existing) {
      return existing;
    }
    return prisma.configuracion.create({ data: { clave: LIMIT_KEY, valor: DEFAULT_LIMIT.toString() } });
  } catch (error) {
    console.warn("Configuración de límite no disponible, usando valor por defecto", error);
    return { clave: LIMIT_KEY, valor: DEFAULT_LIMIT.toString() };
  }
}

function parseDecimal(value: string | null | undefined) {
  const numeric = Number(value ?? "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseInteger(value: string | null | undefined) {
  const numeric = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function obtenerCajaActiva(userEmail?: string | null, role?: string | null) {
  if (!hasCajaModel) {
    return null;
  }
  const whereClause =
    role === "admin" || !userEmail
      ? { abierto: true }
      : {
          abierto: true,
          abiertoPor: userEmail,
        };

  return prisma.cajaTurno.findFirst({
    where: whereClause,
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

function mapCaja<T extends { id: number; abierto: boolean; abiertoPor: string | null; abiertoAt: Date; ventas: VentaLike[] }>(
  caja: T | null
) {
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

async function obtenerResumenGlobalVentas() {
  if (!hasCajaModel) {
    return { totalVendidos: 0 };
  }

  const aggregate = await prisma.ventaAdicional.aggregate({
    _sum: { cantidad: true },
  });

  const totalVendidosRaw = aggregate._sum?.cantidad;
  const totalVendidos = totalVendidosRaw ? Number(totalVendidosRaw) : 0;

  return { totalVendidos };
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
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = session.user?.role ?? null;
  const userEmail = session.user?.email ?? "";

  await ensurePrecioUnitario();
  await ensureLimiteBoletos();

  if (!hasConfiguracionModel || !hasCajaModel) {
    return NextResponse.json({
      precioUnitario: DEFAULT_PRICE,
      caja: null,
      historial: [],
      closures: [],
      limiteBoletos: DEFAULT_LIMIT,
      totalVendidos: 0,
      limiteDisponible: DEFAULT_LIMIT > 0 ? DEFAULT_LIMIT : null,
      warning:
        "El modelo de caja aún no está disponible en la base de datos. Se muestra el precio por defecto de $5.",
    });
  }

  const [precioConfig, limiteConfig, cajaActiva, historial, closures, resumenGlobal] = await Promise.all([
    prisma.configuracion.findUnique({ where: { clave: PRECIO_KEY } }),
    prisma.configuracion.findUnique({ where: { clave: LIMIT_KEY } }),
    obtenerCajaActiva(role === "admin" ? undefined : userEmail, role),
    prisma.ventaAdicional.findMany({
      where:
        role === "admin"
          ? undefined
          : {
              caja: {
                abiertoPor: userEmail,
              },
            },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { codigo: true, caja: true },
    }),
    prisma.cajaTurno.findMany({
      where:
        role === "admin"
          ? { abierto: false }
          : {
              abierto: false,
              abiertoPor: userEmail,
            },
      orderBy: { cerradoAt: "desc" },
      take: 20,
      include: { ventas: true },
    }),
    obtenerResumenGlobalVentas(),
  ]);

  const precioUnitario = parseDecimal(precioConfig?.valor ?? DEFAULT_PRICE.toString());
  const limiteBoletos = parseInteger(limiteConfig?.valor ?? DEFAULT_LIMIT.toString());
  const cajaMap = mapCaja(cajaActiva);
  const totalVendidos = resumenGlobal.totalVendidos;
  const limiteDisponible = limiteBoletos > 0 ? Math.max(limiteBoletos - totalVendidos, 0) : null;

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
    limiteBoletos,
    totalVendidos,
    limiteDisponible,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = session?.user?.role;
  const userEmail = session?.user?.email ?? "";

  const body = await req.json();
  const action = body?.action as string | undefined;

  if (!action) {
    return NextResponse.json({ error: "Acción no especificada" }, { status: 400 });
  }

  await ensurePrecioUnitario();
  await ensureLimiteBoletos();

  switch (action) {
    case "open": {
      if (!hasCajaModel) {
        return NextResponse.json({ error: "Funcionalidad de caja no disponible. Ejecuta la migración." }, { status: 503 });
      }
      if (!userEmail) {
        return NextResponse.json({ error: "No se pudo identificar al usuario actual" }, { status: 400 });
      }

      const isAdmin = role === "admin";
      const existing = await obtenerCajaActiva(isAdmin ? undefined : userEmail, role);
      if (existing) {
        const message = isAdmin ? "Ya existe una caja abierta" : "Ya tienes una caja abierta actualmente.";
        return NextResponse.json({ error: message }, { status: 400 });
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
      if (!userEmail) {
        return NextResponse.json({ error: "No se pudo identificar al usuario actual" }, { status: 400 });
      }

      const caja = await obtenerCajaActiva(role === "admin" ? undefined : userEmail, role);
      if (!caja) {
        const message = role === "admin" ? "No hay una caja abierta" : "No tienes una caja abierta en curso.";
        return NextResponse.json({ error: message }, { status: 400 });
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

    case "updateLimit": {
      if (role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      const nuevoLimiteParam = Number(body?.limite);
      if (!Number.isFinite(nuevoLimiteParam) || nuevoLimiteParam < 0) {
        return NextResponse.json({ error: "Ingresa un límite válido (0 o mayor)" }, { status: 400 });
      }

      const nuevoLimite = Math.floor(nuevoLimiteParam);

      if (!hasConfiguracionModel) {
        return NextResponse.json({
          limiteBoletos: DEFAULT_LIMIT,
          warning: "Configuración no disponible. Se mantiene el límite por defecto (sin restricción).",
        });
      }

      try {
        const actualizado = await prisma.configuracion.update({
          where: { clave: LIMIT_KEY },
          data: { valor: nuevoLimite.toString(), actualizadoEn: new Date() },
        });

        return NextResponse.json({ limiteBoletos: parseInteger(actualizado.valor) });
      } catch (error) {
        console.error("No se pudo actualizar el límite de boletos", error);
        return NextResponse.json(
          { error: "No se pudo actualizar el límite en la base de datos", limiteBoletos: DEFAULT_LIMIT },
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
      if (!userEmail) {
        return NextResponse.json({ error: "No se pudo identificar al usuario actual" }, { status: 400 });
      }

      if (!cantidad || cantidad <= 0) {
        return NextResponse.json({ error: "Debes indicar la cantidad de QR a generar" }, { status: 400 });
      }

      const caja = await obtenerCajaActiva(role === "admin" ? undefined : userEmail, role);
      if (!caja) {
        return NextResponse.json(
          { error: role === "admin" ? "Debes abrir la caja antes de generar QR" : "Debes abrir tu caja antes de generar QR" },
          { status: 400 }
        );
      }

      const precioConfig = await prisma.configuracion.findUnique({ where: { clave: PRECIO_KEY } });
      const precioUnitario = parseDecimal(precioConfig?.valor ?? DEFAULT_PRICE.toString());
      const totalRecaudado = precioUnitario * cantidad;

      const limiteConfig = await prisma.configuracion.findUnique({ where: { clave: LIMIT_KEY } });
      const limiteBoletos = parseInteger(limiteConfig?.valor ?? DEFAULT_LIMIT.toString());
      if (limiteBoletos > 0) {
        const { totalVendidos } = await obtenerResumenGlobalVentas();
        if (totalVendidos + cantidad > limiteBoletos) {
          const disponibles = Math.max(limiteBoletos - totalVendidos, 0);
          return NextResponse.json(
            {
              error: `No se pueden emitir más boletos. Disponibles restantes: ${disponibles}`,
              limiteBoletos,
              totalVendidos,
              disponibles,
            },
            { status: 400 }
          );
        }
      }

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
                  ¡Te esperamos para celebrar la ceremonia de graduación.!
                </p>
                <p style="margin:0 0 12px;font-size:18px;font-weight:600;"><strong>Importante</strong> </p>
                <ul style="margin:0 0 12px 18px;padding:0;font-size:15px;line-height:1.6;">
                  <li style="margin-bottom:8px;">
                    Cuida este código y compártelo únicamente con tus personas invitadas.
                  </li>
                  <li>
                    Desde los <strong>10 años</strong> se requiere boleto individual.
                  </li>
                </ul>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                  Si necesitas entradas adicionales, estarán disponibles el día del evento en el lugar donde se desarrollará la ceremonia.
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
          `Adjuntamos el código QR válido para ${cantidad} persona(s). Recuerda: cuida tu código y desde los 10 años se cobra entrada. Las entradas adicionales estarán a la venta el día del evento en el mismo lugar. Total recaudado: $${totalRecaudado.toFixed(2)}.`,
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
      if (role !== "admin" && cierre.abiertoPor !== userEmail) {
        return NextResponse.json({ error: "No autorizado para ver este cierre" }, { status: 403 });
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

      const whereClause =
        role === "admin"
          ? { abierto: false }
          : {
              abierto: false,
              abiertoPor: userEmail,
            };

      const closures = await prisma.cajaTurno.findMany({
        where: whereClause,
        orderBy: { cerradoAt: "desc" },
        take: 20,
        include: { ventas: true },
      });

      return NextResponse.json({ closures: closures.map(summarizeClosure) });
    }

    case "openSessions": {
      if (role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      if (!hasCajaModel) {
        return NextResponse.json({ abiertas: [] });
      }

      const abiertas = await prisma.cajaTurno.findMany({
        where: { abierto: true },
        orderBy: { abiertoAt: "desc" },
        include: {
          ventas: {
            include: { codigo: true },
          },
        },
      });

      return NextResponse.json({ abiertas: abiertas.map((caja) => mapCaja(caja)) });
    }

    case "forceClose": {
      if (role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      if (!hasCajaModel) {
        return NextResponse.json({ error: "Funcionalidad de caja no disponible. Ejecuta la migración." }, { status: 503 });
      }

      const cajaId = Number(body?.cajaId);
      if (!Number.isInteger(cajaId)) {
        return NextResponse.json({ error: "Identificador de caja inválido" }, { status: 400 });
      }

      const caja = await prisma.cajaTurno.findUnique({
        where: { id: cajaId },
        include: {
          ventas: {
            orderBy: { createdAt: "asc" },
            include: { codigo: true },
          },
        },
      });

      if (!caja || !caja.abierto) {
        return NextResponse.json({ error: "Caja no encontrada o ya cerrada" }, { status: 404 });
      }

      const totalBoletos = calcularBoletos(caja.ventas);
      const totalRecaudado = calcularTotales(caja.ventas);

      const reportPdf = await buildClosingReportPdf({
        caja,
        ventas: caja.ventas,
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

      return NextResponse.json({ caja: mapCaja(cerrada) });
    }

    default:
      return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  }
}
