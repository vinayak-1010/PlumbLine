import mammoth from "mammoth";
import { HttpError } from "./docs";

export async function fileToText(file: { originalname: string; buffer: Buffer }): Promise<string> {
  const name = file.originalname.toLowerCase();
  try {
    if (name.endsWith(".docx")) return (await mammoth.extractRawText({ buffer: file.buffer })).value.trim();
    if (name.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
      try { return String((await parser.getText()).text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim(); }
      finally { await parser.destroy(); }
    }
    if (/\.(txt|md|markdown|csv|html?)$/.test(name) || true) return file.buffer.toString("utf8").trim();
  } catch (e: any) {
    throw new HttpError(422, `Could not read ${file.originalname}: ${e.message}`);
  }
  return "";
}
