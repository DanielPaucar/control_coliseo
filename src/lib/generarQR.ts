import QRCode from "qrcode";
import * as PImage from "pureimage";
import fs from "fs";
import path from "path";

/**
 * Genera un QR PNG con texto debajo.
 * @param codigo - El código único para el QR
 * @param texto - La leyenda a mostrar debajo
 * @param fileName - Nombre del archivo PNG
 * @returns Ruta relativa donde se guarda el PNG
 */
export async function generarQRpng(codigo: string, texto: string, fileName: string): Promise<string> {
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

  // Guardar en /public/qrcodes
  const qrDir = path.join(process.cwd(), "public", "qrcodes");
  if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
  const outputPath = path.join(qrDir, fileName);

  await PImage.encodePNGToStream(img, fs.createWriteStream(outputPath));

  // Retornar ruta relativa para servir desde /public
  return `/qrcodes/${fileName}`;
}

// Helper: convertir Buffer en ReadableStream
import { Readable } from "stream";
function BufferToStream(buffer: Buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}