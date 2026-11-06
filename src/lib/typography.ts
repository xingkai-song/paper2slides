import type { SlideElement } from "../types";
export const SLIDE_FONT = "Arial Unicode MS";
export const LINE_HEIGHT = 1.25;
function advance(c: string) {
  if (/\s/.test(c)) return 0.34;
  if (/[\u2e80-\uffff]/.test(c)) return 1.06;
  if (/[MW@%]/.test(c)) return 0.95;
  if (/[ilI.,:;'!|]/.test(c)) return 0.32;
  return 0.66;
}
// Deterministic soft wrap shared by canvas, layout checks and PPTX. No browser-only
// font measurement: reopening/exporting on another environment keeps the same lines.
export function wrapText(text: string, width: number, size: number) {
  const limit = Math.max(1, (width - 8) / size);
  return text
    .split("\n")
    .flatMap((paragraph) => {
      if (!paragraph) return [""];
      const lines: string[] = [];
      let line = "",
        units = 0;
      const words =
        paragraph.match(/[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*|\s+|[^\s]/gu) || [];
      for (const token of words) {
        const widthUnits = [...token].reduce((sum, c) => sum + advance(c), 0);
        const pieces = widthUnits > limit ? [...token] : [token];
        for (const piece of pieces) {
          const n = [...piece].reduce((sum, c) => sum + advance(c), 0);
          if (units + n > limit && line) {
            lines.push(line.trimEnd());
            line = "";
            units = 0;
          }
          if (!line && /^\s+$/.test(piece)) continue;
          line += piece;
          units += n;
        }
      }
      if (line) lines.push(line.trimEnd());
      return lines;
    })
    .join("\n");
}
export function elementText(e: Pick<SlideElement, "text" | "w" | "fontSize">) {
  return wrapText(e.text || "", e.w, e.fontSize || 28);
}
export function textHeight(text: string, width: number, size: number) {
  return wrapText(text, width, size).split("\n").length * size * LINE_HEIGHT;
}
export function fitsText(
  text: string,
  width: number,
  height: number,
  size: number,
) {
  return textHeight(text, width, size) <= height - 8;
}
