import PDFDocument from "pdfkit";
import type { PDFDocumentOptions } from "pdfkit";
import { getRobotoRegularBuffer } from "@/lib/fonts";

const DEFAULT_FONT_NAME = "Roboto";

class EmbeddedFontPDFDocument extends PDFDocument {
  constructor(options?: PDFDocumentOptions) {
    super(options);
  }

  // pdfkit llama a initFonts en el constructor; sobreescribimos para evitar
  // dependencias de fuentes estándar en disco.
  override initFonts(defaultFont = DEFAULT_FONT_NAME, defaultFontFamily: string | null = null, defaultFontSize = 12): void {
    const fontName = DEFAULT_FONT_NAME;

    const self = this as unknown as {
      _fontFamilies: Record<string, unknown>;
      _fontCount: number;
      _fontSource: unknown;
      _fontFamily: string | null;
      _fontSize: number;
      _font: unknown;
      _remSize: number;
      _registeredFonts: Record<string, { src: unknown; family: unknown }>;
    };

    self._fontFamilies = {};
    self._fontCount = 0;
    self._fontSource = fontName;
    self._fontFamily = defaultFontFamily ?? null;
    self._fontSize = defaultFontSize;
    self._font = null;
    self._remSize = defaultFontSize;
    self._registeredFonts = {};

    this.registerFont(fontName, getRobotoRegularBuffer());
    this.font(fontName, self._fontFamily ?? undefined, defaultFontSize);
  }
}

export function createPdfDocument(options?: PDFDocumentOptions) {
  return new EmbeddedFontPDFDocument(options);
}
