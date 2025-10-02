import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import path from "path";
import { generarQRpng } from "@/lib/generarQR";
import { sendMail } from "@/utils/mailer"; // tu función de envío
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    // 1) leer file del formData
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const maxUsosFamiliares = parseInt(form.get("max_usos_familiares") as string) || 1;
    const usuario = (form.get("usuario") as string) || null;

    if (!file) {
      return new Response(JSON.stringify({ error: "Archivo no enviado" }), { status: 400 });
    }

    // registrar importación
    const fileName = `import_${Date.now()}_${uuidv4().slice(0, 8)}.xlsx`;
    const importLog = await prisma.importacion.create({
      data: { archivo: fileName, usuario },
    });

    // leer Excel
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let exitosos = 0;
    let fallidos = 0;
    const errores: any[] = [];

    for (const [index, r] of rows.entries()) {
      let cedulaStr: string | null = null;

      try {
        const nombre = (r["Nombre"] || r["nombre"] || "").toString().trim();
        const apellido = (r["Apellido"] || r["apellido"] || "").toString().trim();
        const cedula = r["Cédula"] || r["Cedula"] || r["cedula"] || null;
        const rawCorreo =
          r["Correo"] ||
          r["correo"] ||
          r["Correo Institucional"] ||
          r["correo institucional"] ||
          r["Correo institucional"] ||
          r["Email"] ||
          r["email"] ||
          r["Correo electronico"] ||
          r["Correo electrónico"] ||
          r["correoElectronico"] ||
          null;
        const tipo_raw = (r["Tipo"] || r["tipo"] || "est").toLowerCase();

        const normalizeCedula = (value: unknown): string | null => {
          if (value === null || value === undefined) return null;
          if (typeof value === "number") {
            return String(Math.trunc(value));
          }
          const cleaned = String(value).trim();
          const digitsOnly = cleaned.replace(/\D+/g, "");
          return digitsOnly || null;
        };

        cedulaStr = normalizeCedula(cedula);

        const correoStr = rawCorreo !== null && rawCorreo !== undefined
          ? String(rawCorreo).trim() || null
          : null;

        if (correoStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoStr)) {
          fallidos++;
          errores.push({
            fila: index + 2,
            motivo: "Correo inválido",
            detalle: `El correo "${correoStr}" no tiene un formato válido`,
          });
          continue;
        }

        // mapear al enum Prisma
        let tipo_persona: "estudiante" | "familiar" | "visitante";
        if (tipo_raw === "est" || tipo_raw === "estudiante") tipo_persona = "estudiante";
        else if (tipo_raw === "fam" || tipo_raw === "familiar") tipo_persona = "familiar";
        else if (tipo_raw === "vis" || tipo_raw === "visitante") tipo_persona = "visitante";
        else tipo_persona = "estudiante"; // default

        let persona = null;
        if (cedulaStr) {
          persona = await prisma.persona.findUnique({
            where: { cedula: cedulaStr },
          });
        }

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
          if (tipo_persona && tipo_persona !== persona.tipo_persona) updates.tipo_persona = tipo_persona;

          if (Object.keys(updates).length) {
            persona = await prisma.persona.update({
              where: { id_persona: persona.id_persona },
              data: updates,
            });
          }
        }

        // Generar y guardar códigos QR
         const qrFiles: { filename: string; path: string }[] = [];

        if (tipo_persona === "estudiante") {
          // QR estudiante
          const codigoEst = `EST-${persona.id_persona}-${Date.now().toString().slice(-6)}`;
          await prisma.codigoQR.create({
            data: {
              codigo: codigoEst,
              tipo_qr: "est",
              max_usos: 1,
              usos_actual: 0,
              persona: { connect: { id_persona: persona.id_persona } },
            },
          });
          const pngEst = await generarQRpng(codigoEst, `${nombre} ${apellido}`, `${codigoEst}.png`);
          qrFiles.push({ filename: `${codigoEst}.png`, path: path.join(process.cwd(), "public", pngEst.replace(/^\//, "")) });

          // QR familiar
          const codigoFam = `FAM-${persona.id_persona}-${Date.now().toString().slice(-6)}`;
          await prisma.codigoQR.create({
            data: {
              codigo: codigoFam,
              tipo_qr: "fam",
              max_usos: maxUsosFamiliares,
              usos_actual: 0,
              persona: { connect: { id_persona: persona.id_persona } },
            },
          });
          const pngFam = await generarQRpng(codigoFam, "FAMILIAR", `${codigoFam}.png`);
          qrFiles.push({ filename: `${codigoFam}.png`, path: path.join(process.cwd(), "public", pngFam.replace(/^\//, "")) });

          // enviar correo con ambos QR
          const correoDestino = correoStr || persona.correo;
          if (correoDestino) {
            console.log(`📬 Preparando correo para ${correoDestino} - fila ${index + 2}`);
            await sendMail(
              correoDestino,
              "🎟️ Tus códigos QR para el evento",
              `Hola ${persona.nombre}, adjuntamos tus códigos QR.`,
              qrFiles,
              `
              <p>Hola <b>${persona.nombre} ${persona.apellido ?? ""}</b>,</p>
              <p>A continuación encontrarás tus <b>códigos QR</b> para el ingreso al evento:</p>
              <ul>
                <li>🎓 Código de estudiante: <b>${codigoEst}</b></li>
                <li>👨‍👩‍👧‍👦 Código familiar para ${maxUsosFamiliares} personas: <b>${codigoFam}</b></li>
              </ul>
              <p>Presenta estos códigos al ingreso. ¡Te esperamos!</p>
              `
            );
            console.log(`✅ Correo encolado para ${correoDestino}`);
          } else {
            console.warn(`⚠️ Sin correo para persona ${persona.id_persona} en fila ${index + 2}, se omite envío`);
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
/*           if (correo) {
            const pngVis = await generarQRpng(codigoVis, "VISITANTE", `${codigoVis}.png`);
            await sendMail(
              correo,
              "🎟️ Código QR Visitante",
              `Hola ${nombre}, adjuntamos tu código QR de visitante.`,
              [{ filename: `${codigoVis}.png`, path: path.join(process.cwd(), "public", pngVis.replace(/^\//, "")) }]
            );
          } */ 
        }

        exitosos++;
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

    // actualizar importación
    await prisma.importacion.update({
      where: { id: importLog.id },
      data: {
        total_registros: rows.length,
        exitosos,
        fallidos,
        errores: errores.length ? errores : null,
      },
    });

    return new Response(
      JSON.stringify({
        message: "Importación completada",
        importId: importLog.id,
        total: rows.length,
        exitosos,
        fallidos,
        errores: errores.length,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Error global en import:", err);
    return new Response(JSON.stringify({ error: "Error en importación" }), { status: 500 });
  }
}
