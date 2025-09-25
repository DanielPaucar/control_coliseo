import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import path from "path";
import QRCode from "qrcode";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { cantidad } = await req.json();

    // ✅ Crear documento PDF
    const fontPath = path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf");
    const doc = new PDFDocument({ margin: 30, font: fontPath });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(18).text("Códigos QR - Visitantes", { align: "center" });
    doc.moveDown();

    for (let i = 0; i < cantidad; i++) {
      const codigo = `VIS-1-${Math.floor(100000 + Math.random() * 900000)}`;
      await prisma.codigoQR.create({
        data: {
          codigo,
          tipo_qr: "vis",
          max_usos: 1,
          usos_actual: 0,
        },
      });

      const qrDataUrl = await QRCode.toDataURL(codigo, { width: 200 });
      const qrImage = qrDataUrl.replace(/^data:image\/png;base64,/, "");
      const qrBuffer = Buffer.from(qrImage, "base64");

      doc.image(qrBuffer, { fit: [150, 150], align: "center" });
      doc.text(codigo, { align: "center" });
      doc.moveDown();
    }

    doc.end();
    const pdfBuffer = await finished;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=visitantes.pdf",
      },
    });
  } catch (err) {
    console.error("Error al generar QR visitantes:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
