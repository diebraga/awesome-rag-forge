import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

const OCR_FALLBACK_CHAR_THRESHOLD = 20;

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  ocrUsed: boolean;
};

export function looksLikePdf(buffer: Buffer) {
  return buffer.subarray(0, 4).toString("latin1") === "%PDF";
}

// Pages with an existing text layer are read directly (fast, exact). Pages
// with little/no extractable text (scanned/photographed pages) are
// rasterized and OCR'd instead — most digital PDFs never hit this path.
export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractedPage[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const needsOcr = textResult.pages.filter((page) => page.text.trim().length < OCR_FALLBACK_CHAR_THRESHOLD);

    const ocrByPage = new Map<number, string>();
    if (needsOcr.length > 0) {
      const screenshotResult = await parser.getScreenshot({
        partial: needsOcr.map((page) => page.num),
        imageBuffer: true,
        imageDataUrl: false,
      });

      const worker = await createWorker("eng");
      try {
        for (const screenshot of screenshotResult.pages) {
          const { data } = await worker.recognize(Buffer.from(screenshot.data));
          ocrByPage.set(screenshot.pageNumber, data.text);
        }
      } finally {
        await worker.terminate();
      }
    }

    return textResult.pages.map((page) => {
      const ocrText = ocrByPage.get(page.num);
      return {
        pageNumber: page.num,
        text: (ocrText ?? page.text).trim(),
        ocrUsed: ocrText !== undefined,
      };
    });
  } finally {
    await parser.destroy();
  }
}
