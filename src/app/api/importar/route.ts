import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { generarQRpng } from "@/lib/generarQR";
import { sendMail } from "@/utils/mailer";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";

type ImportRow = Record<string, unknown>;
type ImportError = { fila: number; motivo: string; detalle: string };
type FailedEmail = {
  fila: number;
  email: string | null;
  reason: string;
  cedula?: string | null;
  nombre?: string | null;
  apellido?: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const EMAIL_BATCH_SIZE = 150;
const EMAIL_BATCH_DELAY_MS = 20_000;
const EMAIL_FIELD_KEYS = [
  "Correo",
  "correo",
  "Correo Institucional",
  "correo institucional",
  "Correo institucional",
  "Email",
  "email",
  "Correo electronico",
  "Correo electrónico",
  "correoElectronico",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractFirstValue = (row: ImportRow, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return null;
};

const normalizeCedula = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return String(Math.trunc(value));
  }
  const cleaned = String(value).trim();
  const digitsOnly = cleaned.replace(/\D+/g, "");
  return digitsOnly || null;
};

const normalizeEmail = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const email = String(value).trim();
  return email.length ? email : null;
};

const resolveTipoPersona = (tipo: unknown): "estudiante" | "familiar" | "visitante" => {
  const normalized = (typeof tipo === "string" ? tipo : String(tipo ?? "")).toLowerCase();
  if (normalized === "fam" || normalized === "familiar") return "familiar";
  if (normalized === "vis" || normalized === "visitante") return "visitante";
  return "estudiante";
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const maxUsosFamiliares = Math.max(0, parseInt((form.get("max_usos_familiares") as string) ?? "0", 10) || 0);
    const usuario = (form.get("usuario") as string) || null;

    if (!file) {
      return new Response(JSON.stringify({ error: "Archivo no enviado" }), { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return new Response(JSON.stringify({ error: "El archivo no contiene una hoja válida" }), { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet ?? {});
    const fileName = `import_${Date.now()}_${uuidv4().slice(0, 8)}.xlsx`;

    const importLog = await prisma.importacion.create({
      data: { archivo: fileName, usuario },
    });

    let exitosos = 0;
    let fallidos = 0;
    const errores: ImportError[] = [];
    const failedEmails: FailedEmail[] = [];

    const totalRows = rows.length;

    const studentRows = rows.reduce((acc, row) => {
      const tipoRaw = extractFirstValue(row, ["Tipo", "tipo"]);
      return resolveTipoPersona(tipoRaw ?? "est") === "estudiante" ? acc + 1 : acc;
    }, 0);

    const studentsToEmail = rows.reduce((acc, row) => {
      const tipoRaw = extractFirstValue(row, ["Tipo", "tipo"]);
      const correoRaw = extractFirstValue(row, EMAIL_FIELD_KEYS);
      const correo = normalizeEmail(correoRaw);
      return resolveTipoPersona(tipoRaw ?? "est") === "estudiante" && correo && EMAIL_REGEX.test(correo)
        ? acc + 1
        : acc;
    }, 0);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        let emailAttempts = 0;
        let emailsSent = 0;

        sendEvent({
          type: "start",
          totalRows,
          studentRows,
          studentsToEmail,
        });

        try {
          for (const [index, row] of rows.entries()) {
            let cedulaStr: string | null = null;
            let rowHadFailure = false;

            try {
              const nombre = String(extractFirstValue(row, ["Nombre", "nombre"]) ?? "").trim();
              const apellido = String(extractFirstValue(row, ["Apellido", "apellido"]) ?? "").trim();
              const cedulaRaw = extractFirstValue(row, ["Cédula", "Cedula", "cedula"]);
              const correoRaw = extractFirstValue(row, EMAIL_FIELD_KEYS);
              const tipoRaw = extractFirstValue(row, ["Tipo", "tipo"]) ?? "est";

              cedulaStr = normalizeCedula(cedulaRaw);
              const correoStr = normalizeEmail(correoRaw);
              const tipo_persona = resolveTipoPersona(tipoRaw);

              if (correoStr && !EMAIL_REGEX.test(correoStr)) {
                fallidos++;
                failedEmails.push({
                  fila: index + 2,
                  email: correoStr,
                  reason: "Correo con formato inválido",
                  cedula: cedulaStr,
                  nombre,
                  apellido,
                });
                sendEvent({
                  type: "email-failed",
                  data: {
                    fila: index + 2,
                    email: correoStr,
                    reason: "Correo con formato inválido",
                    cedula: cedulaStr,
                    nombre,
                    apellido,
                  },
                });
                errores.push({
                  fila: index + 2,
                  motivo: "Correo inválido",
                  detalle: `El correo "${correoStr}" no tiene un formato válido`,
                });
                continue;
              }

              let persona = cedulaStr
                ? await prisma.persona.findUnique({ where: { cedula: cedulaStr } })
                : null;

              if (!persona) {
                persona = await prisma.persona.create({
                  data: {
                    nombre,
                    apellido,
                    cedula: cedulaStr,
                    correo: correoStr,
                    tipo_persona,
                  },
                });
              } else {
                const updates: Prisma.PersonaUpdateInput = {};
                if (nombre && nombre !== persona.nombre) updates.nombre = nombre;
                if (apellido && apellido !== persona.apellido) updates.apellido = apellido;
                if (correoStr && correoStr !== persona.correo) updates.correo = correoStr;
                if (tipo_persona !== persona.tipo_persona) updates.tipo_persona = tipo_persona;

                if (Object.keys(updates).length > 0) {
                  persona = await prisma.persona.update({
                    where: { id_persona: persona.id_persona },
                    data: updates,
                  });
                }
              }

              if (tipo_persona === "estudiante") {
                const invitadosAdicionales = Math.max(0, maxUsosFamiliares);
                const totalPermitidos = 1 + invitadosAdicionales;

                const codigoGeneral = `EST-${persona.id_persona}-${Date.now().toString().slice(-6)}`;
                await prisma.codigoQR.create({
                  data: {
                    codigo: codigoGeneral,
                    tipo_qr: "est",
                    max_usos: totalPermitidos,
                    usos_actual: 0,
                    persona: { connect: { id_persona: persona.id_persona } },
                  },
                });

                const pngGeneralAsset = await generarQRpng(
                  codigoGeneral,
                  `${nombre} ${apellido}`.trim() || "ESTUDIANTE",
                  `${codigoGeneral}.png`
                );

                if (correoStr && EMAIL_REGEX.test(correoStr)) {
                  emailAttempts++;
                  try {
                    const invitadosTexto =
                      invitadosAdicionales === 0
                        ? "sin invitados adicionales"
                        : invitadosAdicionales === 1
                        ? "con 1 invitado adicional"
                        : `Estudiante y ${invitadosAdicionales} invitados adicionales`;

                    const textoPlano = `Hola ${persona.nombre}, adjuntamos tu código QR único. Cuida este código y compártelo solo con tus invitados. Desde los 10 años se requiere boleto individual. Las entradas adicionales se venderán el día del evento en el lugar donde se desarrollará la ceremonia. Este código permite el ingreso para ${totalPermitidos} persona(s) (${invitadosTexto}). Presenta el QR en el acceso.`;
                    const htmlContenido = `
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
                              Adjuntamos tu <strong>código QR único</strong> para la ceremonia de graduación. Este QR permite el ingreso para <strong>${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}</strong> (${invitadosTexto}).
                            </p>
                            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
                              ¡Felicitaciones por este gran logro! Te esperamos para celebrarlo.
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
                    `;

                    await sendMail(
                      correoStr,
                      "🎟️ Tu código QR para el evento de Graduación",
                      textoPlano,
                      [
                        {
                          filename: `${codigoGeneral}.png`,
                          content: pngGeneralAsset.buffer,
                          contentType: "image/png",
                        },
                      ],
                      htmlContenido
                    );
                    emailsSent++;
                  } catch (mailErr) {
                    rowHadFailure = true;
                    failedEmails.push({
                      fila: index + 2,
                      email: correoStr,
                      reason: mailErr instanceof Error ? mailErr.message : "Error desconocido al enviar el correo",
                      cedula: cedulaStr,
                      nombre,
                      apellido,
                    });
                    sendEvent({
                      type: "email-failed",
                      data: {
                        fila: index + 2,
                        email: correoStr,
                        reason: mailErr instanceof Error
                          ? mailErr.message
                          : "Error desconocido al enviar el correo",
                        cedula: cedulaStr,
                        nombre,
                        apellido,
                      },
                    });
                    errores.push({
                      fila: index + 2,
                      motivo: "Error enviando correo",
                      detalle: String(mailErr),
                    });
                    console.error(`❌ Error enviando correo a ${correoStr} (fila ${index + 2}):`, mailErr);
                  }

                  sendEvent({
                    type: "progress",
                    processed: emailAttempts,
                    total: studentsToEmail,
                  });

                  if (emailAttempts % EMAIL_BATCH_SIZE === 0 && emailAttempts < studentsToEmail) {
                    sendEvent({
                      type: "cooldown",
                      processed: emailAttempts,
                      remaining: Math.max(studentsToEmail - emailAttempts, 0),
                      delayMs: EMAIL_BATCH_DELAY_MS,
                    });
                    await delay(EMAIL_BATCH_DELAY_MS);
                  }
                } else {
                  rowHadFailure = true;
                  failedEmails.push({
                    fila: index + 2,
                    email: correoStr,
                    reason: "Sin correo disponible",
                    cedula: cedulaStr,
                    nombre,
                    apellido,
                  });
                  sendEvent({
                    type: "email-failed",
                    data: {
                      fila: index + 2,
                      email: correoStr,
                      reason: "Sin correo disponible",
                      cedula: cedulaStr,
                      nombre,
                      apellido,
                    },
                  });
                }
              } else if (tipo_persona === "visitante") {
                const codigoVis = `VIS-${persona.id_persona}-${Date.now().toString().slice(-6)}`;
                await prisma.codigoQR.create({
                  data: {
                    codigo: codigoVis,
                    tipo_qr: "vis",
                    max_usos: 1,
                    usos_actual: 0,
                    persona: { connect: { id_persona: persona.id_persona } },
                  },
                });
              } else if (tipo_persona === "familiar") {
                const codigoFam = `FAM-${persona.id_persona}-${Date.now().toString().slice(-6)}`;
                await prisma.codigoQR.create({
                  data: {
                    codigo: codigoFam,
                    tipo_qr: "fam",
                    max_usos: 1,
                    usos_actual: 0,
                    persona: { connect: { id_persona: persona.id_persona } },
                  },
                });
              }

              if (rowHadFailure) {
                fallidos++;
              } else {
                exitosos++;
              }
            } catch (filaErr) {
              fallidos++;
              if (cedulaStr) {
                console.error(`❌ Error procesando fila ${index + 2} (cédula ${cedulaStr}):`, filaErr);
              } else {
                console.error(`❌ Error procesando fila ${index + 2}:`, filaErr);
              }

              if (
                filaErr instanceof Prisma.PrismaClientKnownRequestError &&
                filaErr.code === "P2002" &&
                filaErr.meta?.target &&
                Array.isArray(filaErr.meta.target) &&
                filaErr.meta.target.includes("cedula")
              ) {
                errores.push({
                  fila: index + 2,
                  motivo: "Cédula duplicada",
                  detalle: cedulaStr
                    ? `La cédula ${cedulaStr} ya existe en la base de datos`
                    : "La cédula ya existe en la base de datos",
                });
              } else {
                errores.push({ fila: index + 2, motivo: "Error procesando fila", detalle: String(filaErr) });
              }
            }
          }

          await prisma.importacion.update({
            where: { id: importLog.id },
            data: {
              total_registros: rows.length,
              exitosos,
              fallidos,
              errores: errores.length ? errores : Prisma.JsonNull,
            },
          });

          sendEvent({
            type: "done",
            summary: {
              total: rows.length,
              exitosos,
              fallidos,
              emailsIntentados: studentsToEmail,
              emailsProcesados: emailAttempts,
              emailsEnviados: emailsSent,
              emailsFallidos: failedEmails.length,
              studentRows,
              studentsToEmail,
            },
            failedEmails,
          });

          controller.close();
        } catch (streamErr) {
          console.error("Error durante la importación:", streamErr);
          try {
            await prisma.importacion.update({
              where: { id: importLog.id },
              data: {
                total_registros: rows.length,
                exitosos,
                fallidos,
                errores: errores.length ? errores : Prisma.JsonNull,
              },
            });
          } catch (updateErr) {
            console.error("No se pudo actualizar el registro de importación tras el error:", updateErr);
          }
          sendEvent({
            type: "error",
            message: "Error durante la importación. Revisa el archivo e inténtalo nuevamente.",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Error global en import:", err);
    return new Response(JSON.stringify({ error: "Error en importación" }), { status: 500 });
  }
}
