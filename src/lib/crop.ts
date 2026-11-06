import type { FigureCandidate } from "../types";
import { paddedBox, validBox } from "./pdfText";
type Box = { x: number; y: number; w: number; h: number };
export function refineCrop(
  figure: FigureCandidate,
  proposed: Box,
  canvas?: any,
  neighbors: FigureCandidate[] = [],
): Box {
  let b = { x: proposed.x, y: proposed.y, w: proposed.w, h: proposed.h };
  const c = figure.captionBox;
  if (c) {
    // The real caption is a reliable page anchor. Retain the whole caption and
    // width, and prevent a below-figure caption from dragging following prose in.
    const left = Math.min(b.x, c.x),
      right = Math.max(b.x + b.w, c.x + c.w);
    const center = b.y + b.h / 2;
    const bottom =
      c.y >= center ? Math.min(b.y + b.h, c.y + c.h + 0.004) : b.y + b.h;
    let top = c.y < center ? Math.min(b.y, c.y) : b.y;
    if (c.y >= center) {
      const previous = neighbors
        .filter(
          (f) =>
            f.id !== figure.id &&
            f.page === figure.page &&
            f.captionBox &&
            f.captionBox.y + f.captionBox.h < c.y &&
            f.captionBox.y > top &&
            f.captionBox.x < right &&
            f.captionBox.x + f.captionBox.w > left,
        )
        .map((f) => f.captionBox!);
      if (previous.length)
        top = Math.max(top, ...previous.map((a) => a.y + a.h + 0.006));
    }
    b = { x: left, y: top, w: right - left, h: bottom - top };
    if (c.y >= center && canvas?.getContext) {
      // Remove material above the figure only at a substantial horizontal white
      // gutter near the proposed top. Never cut through ink or search below 30%.
      const ctx = canvas.getContext("2d"),
        W = canvas.width,
        H = canvas.height;
      const x0 = Math.max(0, Math.floor(b.x * W)),
        x1 = Math.min(W, Math.ceil((b.x + b.w) * W));
      const y0 = Math.max(0, Math.floor(b.y * H)),
        y1 = Math.min(H, Math.floor((b.y + b.h * 0.3) * H));
      if (y1 > y0 && x1 > x0) {
        const pixels = ctx.getImageData(x0, y0, x1 - x0, y1 - y0),
          width = x1 - x0;
        let runStart = -1,
          bestStart = -1,
          bestEnd = -1;
        for (let y = 0; y < pixels.height; y++) {
          let ink = 0;
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (
              Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) <
              230
            )
              ink++;
          }
          const blank = ink === 0;
          if (blank && runStart < 0) runStart = y;
          if ((!blank || y === pixels.height - 1) && runStart >= 0) {
            const end = blank ? y + 1 : y;
            if (end - runStart > bestEnd - bestStart) {
              bestStart = runStart;
              bestEnd = end;
            }
            runStart = -1;
          }
        }
        if (bestEnd - bestStart >= H * 0.008) {
          const top = (y0 + (bestStart + bestEnd) / 2) / H;
          if (top > b.y) {
            b.h -= top - b.y;
            b.y = top;
          }
        }
      }
    }
  }
  return validBox(b) ? paddedBox(b) : paddedBox(proposed);
}
