import QRCode from "qrcode";
import * as PImage from "pureimage";
import { PassThrough, Readable } from "stream";

/**
 * Genera un QR PNG con texto debajo.
 * @param codigo - El código único para el QR
 * @param texto - La leyenda a mostrar debajo
 * @param fileName - Nombre del archivo PNG
 * @returns Objeto con buffer y dataURL del PNG generado
 */
export async function generarQRpng(
  codigo: string,
  texto: string,
  fileName: string
): Promise<{ buffer: Buffer; dataUrl: string; fileName: string }> {
  // Generar el QR en buffer
  const qrBuffer = await QRCode.toBuffer(codigo, { width: 300, margin: 2 });

  // Cargar el QR en imagen pureimage
  const qrImg = await PImage.decodePNGFromStream(BufferToStream(qrBuffer));

  // Crear lienzo (un poco más alto para el texto)
  const width = qrImg.width;
  //const height = qrImg.height + 40;
  const height = qrImg.height;
  const img = PImage.make(width, height);
  const ctx = img.getContext("2d");

  // Fondo blanco
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  // Dibujar QR
  ctx.drawImage(qrImg, 0, 0);

  // Texto centrado
  ctx.fillStyle = "black";
  ctx.font = "20pt Arial";
  const textWidth = ctx.measureText(texto).width;
  ctx.fillText(texto, (width - textWidth) / 2, height - 10);

  const pngBuffer = await encodeToBuffer(img);

  return {
    buffer: pngBuffer,
    dataUrl: `data:image/png;base64,${pngBuffer.toString("base64")}`,
    fileName,
  };
}

// Helper: convertir Buffer en ReadableStream
function BufferToStream(buffer: Buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

async function encodeToBuffer(image: PImage.Bitmap) {
  const chunks: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    const passThrough = new PassThrough();

    passThrough.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    passThrough.on("error", reject);
    passThrough.on("end", () => resolve(Buffer.concat(chunks)));

    PImage.encodePNGToStream(image, passThrough)
      .then(() => {
        passThrough.end();
      })
      .catch(reject);
  });
}
