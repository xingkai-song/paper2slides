import type { PaperPage, TextBlock, FigureCandidate } from "../types";
import { uid } from "../types";
export function readingOrder(blocks: TextBlock[], width: number): TextBlock[] {
  const mid = width / 2;
  const left = blocks.filter((b) => b.x < mid - 20 && b.x + b.width < mid + 15);
  const right = blocks.filter((b) => b.x > mid + 5);
  const dual = left.length > 8 && right.length > 8;
  const sorted = (a: TextBlock, b: TextBlock) =>
    Math.abs(a.y - b.y) < 3 ? a.x - b.x : a.y - b.y;
  if (!dual) return [...blocks].sort(sorted);
  const spans = blocks
    .filter(
      (b) => b.x < mid && b.x + b.width > mid + 20 && b.width > width * 0.5,
    )
    .sort(sorted);
  const result: TextBlock[] = [];
  let y = -Infinity;
  for (const span of [...spans, { y: Infinity } as TextBlock]) {
    const band = blocks.filter(
      (b) => !spans.includes(b) && b.y >= y && b.y < span.y,
    );
    result.push(
      ...band.filter((b) => b.x < mid).sort(sorted),
      ...band.filter((b) => b.x >= mid).sort(sorted),
    );
    if (span.y !== Infinity) result.push(span);
    y = span.y + 0.1;
  }
  return result;
}
export function findFigures(
  pages: PaperPage[],
  start: number,
  end: number,
): FigureCandidate[] {
  const out: FigureCandidate[] = [];
  for (const p of pages.filter((p) => p.number >= start && p.number <= end)) {
    const ordered = readingOrder(p.blocks, p.width);
    for (let i = 0; i < ordered.length; i++) {
      const b = ordered[i];
      const m = b.text.match(
        /^\s*((?:Figure|Fig\.?|Table|图|表)\s*[\d一二三四五六七八九十]+[a-z]?)\s*[:：.\s]/i,
      );
      if (!m) continue;
      const caption = ordered
        .slice(i, i + 6)
        .map((x) => x.text)
        .join(" ")
        .slice(0, 650);
      if (out.some((f) => f.page === p.number && f.label === m[1])) continue;
      const table = /table|表/i.test(m[1]);
      const x = b.x > p.width * 0.48 ? 0.5 : 0.04;
      const w = b.width > p.width * 0.65 ? 0.92 : 0.46;
      const y = table
        ? b.y / p.height + 0.025
        : Math.max(0.04, b.y / p.height - 0.32);
      out.push({
        id: uid(),
        label: m[1],
        caption,
        page: p.number,
        reason: "待 AI 推荐",
        bbox: { x, y, w: Math.min(w, 1 - x), h: Math.min(0.29, 1 - y) },
        located: false,
        confirmed: false,
        selected: false,
      });
    }
  }
  return out;
}
export function validBox(b: { x: number; y: number; w: number; h: number }) {
  return (
    [b.x, b.y, b.w, b.h].every(Number.isFinite) &&
    b.x >= 0 &&
    b.y >= 0 &&
    b.w > 0.01 &&
    b.h > 0.01 &&
    b.x + b.w <= 1.001 &&
    b.y + b.h <= 1.001
  );
}
