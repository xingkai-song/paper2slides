import pptxgen from "pptxgenjs";
import type { Project, Platform } from "../types";
import { themes } from "../types";
export async function toDataURL(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}
export async function buildPPTX(p: Project, platform: Platform) {
  if (!p.slides.length) throw new Error("请先生成幻灯片");
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Paper2Slides";
  pptx.subject = p.pdfName;
  pptx.title = p.name;
  pptx.company = "Anna App";
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial" };
  const t = themes[p.theme],
    scale = 1 / 96;
  const images = new Map<string, string>();
  for (const s of p.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: t.bg.slice(1) };
    for (const e of s.elements) {
      const box = {
        x: e.x * scale,
        y: e.y * scale,
        w: e.w * scale,
        h: e.h * scale,
        rotate: e.rotation,
      };
      if (e.type === "text")
        slide.addText(e.text || "", {
          ...box,
          fontFace:
            p.settings.language === "中文" ? "Arial Unicode MS" : "Arial",
          fontSize: (e.fontSize || 28) * 0.75,
          lang: p.settings.language === "中文" ? "zh-CN" : "en-US",
          bold: e.bold,
          color: e.color.replace("#", ""),
          align: e.align || "left",
          margin: 0,
          breakLine: false,
          paraSpaceAfter: 0,
          lineSpacingMultiple: 1.15,
          valign: "top",
        });
      else if (e.type === "image") {
        if (!e.assetPath) throw new Error("图片文件缺失");
        if (!images.has(e.assetPath))
          images.set(
            e.assetPath,
            await toDataURL(await platform.blob(e.assetPath)),
          );
        slide.addImage({ ...box, data: images.get(e.assetPath)! });
      } else if (e.type === "line")
        slide.addShape(pptx.ShapeType.line, {
          ...box,
          line: { color: e.color.replace("#", ""), width: 2 },
        });
      else
        slide.addShape(pptx.ShapeType.rect, {
          ...box,
          fill: { color: (e.fill || e.color).replace("#", "") },
          line: {
            color: (e.fill || e.color).replace("#", ""),
            transparency: 100,
          },
        });
    }
    slide.addNotes(s.notes + "\nPDF来源页：" + s.sources.join(", "));
  }
  return (await pptx.write({ outputType: "blob" })) as Blob;
}
