import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PaperPage, TextBlock, FigureCandidate } from "../types";
import { readingOrder } from "./pdfText";
export { readingOrder, findFigures, validBox } from "./pdfText";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export type PDF = pdfjs.PDFDocumentProxy;
export async function loadPDF(blob: Blob): Promise<PDF> {
  if (blob.size > 20 * 1024 * 1024) throw new Error("PDF 文件不能超过 20 MB。");
  try {
    return await pdfjs.getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useWasm: false,
    }).promise;
  } catch (e) {
    if (String(e).includes("Password"))
      throw new Error("暂不支持加密 PDF，请解密后重新上传。");
    throw new Error("无法读取 PDF，请检查文件是否损坏。");
  }
}
export async function parsePDF(
  pdf: PDF,
  onProgress: (s: string) => void,
): Promise<PaperPage[]> {
  const pages: PaperPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress(`解析论文 ${n} / ${pdf.numPages} 页`);
    const page = await pdf.getPage(n),
      v = page.getViewport({ scale: 1 }),
      content = await page.getTextContent();
    const blocks: TextBlock[] = content.items
      .filter((x: any) => "str" in x && x.str.trim())
      .map((i: any) => {
        const t = pdfjs.Util.transform(v.transform, i.transform);
        return {
          text: i.str,
          x: t[4],
          y: t[5] - Math.hypot(t[2], t[3]),
          width: Math.abs(i.width),
          height: Math.hypot(t[2], t[3]),
        };
      });
    pages.push({
      number: n,
      width: v.width,
      height: v.height,
      blocks,
      text: readingOrder(blocks, v.width)
        .map((b) => b.text)
        .join("\n"),
    });
  }
  const repeated = new Map<string, Set<number>>();
  for (const p of pages)
    for (const b of p.blocks.filter(
      (b) => b.y < p.height * 0.06 || b.y > p.height * 0.94,
    )) {
      const key = b.text.replace(/\d+/g, "#").trim();
      if (key.length > 3) {
        const set = repeated.get(key) || new Set();
        set.add(p.number);
        repeated.set(key, set);
      }
    }
  for (const p of pages) {
    p.blocks = p.blocks.filter(
      (b) =>
        !(
          (b.y < p.height * 0.06 || b.y > p.height * 0.94) &&
          (repeated.get(b.text.replace(/\d+/g, "#").trim())?.size || 0) >=
            Math.max(3, pages.length * 0.5)
        ),
    );
    p.text = readingOrder(p.blocks, p.width)
      .map((b) => b.text)
      .join("\n");
    if (p.text.replace(/\s/g, "").length < 40)
      p.warning = "本页有效文字不足，可能是扫描页或纯图页，请核验。";
  }
  return pages;
}
export async function renderPage(
  pdf: PDF,
  pageNumber: number,
  maxWidth = 1500,
) {
  const page = await pdf.getPage(pageNumber),
    base = page.getViewport({ scale: 1 }),
    v = page.getViewport({ scale: maxWidth / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(v.width);
  canvas.height = Math.round(v.height);
  await page.render({
    canvas,
    canvasContext: canvas.getContext("2d")!,
    viewport: v,
  }).promise;
  return canvas;
}
export async function cropFigure(
  pdf: PDF,
  page: number,
  b: { x: number; y: number; w: number; h: number },
) {
  const c = await renderPage(pdf, page, 2000),
    out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(c.width * b.w));
  out.height = Math.max(1, Math.round(c.height * b.h));
  out
    .getContext("2d")!
    .drawImage(
      c,
      c.width * b.x,
      c.height * b.y,
      c.width * b.w,
      c.height * b.h,
      0,
      0,
      out.width,
      out.height,
    );
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("无法裁剪图片"))),
      "image/png",
    ),
  );
}
