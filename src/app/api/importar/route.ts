import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import path from "path";
import { generarQRpng } from "@/lib/generarQR";
import { sendMail } from "@/utils/mailer";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";

type ImportRow = Record<string, unknown>;
type ImportError = { fila: number; motivo: string; detalle: string };
type FailedEmail = { fila: number; email: string | null; reason: string };

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
                });
                sendEvent({
                  type: "email-failed",
                  data: { fila: index + 2, email: correoStr, reason: "Correo con formato inválido" },
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

                const pngGeneral = await generarQRpng(
                  codigoGeneral,
                  `${nombre} ${apellido}`.trim() || "ESTUDIANTE",
                  `${codigoGeneral}.png`
                );

                if (correoStr && EMAIL_REGEX.test(correoStr)) {
                  emailAttempts++;
                  try {
                    const attachmentPath = path.join(process.cwd(), "public", pngGeneral.replace(/^\//, ""));
                    const invitadosTexto =
                      invitadosAdicionales === 0
                        ? "sin invitados adicionales"
                        : invitadosAdicionales === 1
                        ? "con 1 invitado adicional"
                        : `con ${invitadosAdicionales} invitados adicionales`;

                    const textoPlano = `Hola ${persona.nombre}, adjuntamos tu código QR único. Este código permite el ingreso para ${totalPermitidos} persona(s) (${invitadosTexto}). Presenta el QR en el acceso.`;
                    const htmlContenido = `
                      <p>Hola <strong>${persona.nombre} ${persona.apellido ?? ""}</strong>,</p>
                      <p>Adjuntamos tu <strong>código QR único</strong> para ingresar al evento.</p>
                      <p>Este QR habilita el acceso para <strong>${totalPermitidos} persona${totalPermitidos === 1 ? "" : "s"}</strong> (${invitadosTexto}).</p>
                      <p>Presenta el código en el punto de control de ingreso. ¡Te esperamos!</p>
                    `;

                    await sendMail(
                      correoStr,
                      "🎟️ Tu código QR para el evento",
                      textoPlano,
                      [
                        {
                          filename: `${codigoGeneral}.png`,
                          path: attachmentPath,
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
                    });
                    sendEvent({
                      type: "email-failed",
                      data: {
                        fila: index + 2,
                        email: correoStr,
                        reason: mailErr instanceof Error
                          ? mailErr.message
                          : "Error desconocido al enviar el correo",
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
                  });
                  sendEvent({
                    type: "email-failed",
                    data: { fila: index + 2, email: correoStr, reason: "Sin correo disponible" },
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
              errores: errores.length ? errores : null,
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
                errores: errores.length ? errores : null,
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
