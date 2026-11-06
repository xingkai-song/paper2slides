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
export function figureKey(label: string) {
  return label
    .toLowerCase()
    .replace(/figure|fig\.?|图/g, "figure")
    .replace(/table|表/g, "table")
    .replace(/[^a-z0-9一二三四五六七八九十]/g, "");
}
export function findFigures(
  pages: PaperPage[],
  start: number,
  end: number,
): FigureCandidate[] {
  const best = new Map<string, { figure: FigureCandidate; score: number }>();
  for (const p of pages.filter((p) => p.number >= start && p.number <= end)) {
    const blocks = [...p.blocks].sort((a, b) => a.y - b.y || a.x - b.x);
    const heights = blocks
      .map((b) => b.height)
      .filter((h) => h > 0)
      .sort((a, b) => a - b);
    const bodyHeight = heights[Math.floor(heights.length / 2)] || 10;
    for (const b of blocks) {
      const m = b.text.match(
        /^\s*((?:Figure|Fig\.?|Table|图|表)\s*[\d一二三四五六七八九十]+[a-z]?)(?=$|[\s:：.|｜])([\s\S]*)$/i,
      );
      if (!m) continue;
      const tail = m[2].trim();
      const standalone = /^[.:：|｜]?$/.test(tail);
      // A prose reference is not a caption. Number-only blocks are valid captions.
      if (!standalone && !/^[.:：|｜]/.test(tail)) continue;
      if (
        !standalone &&
        /^(?:[.:：|｜]\s*)?(?:depicts?|provides?|presents?|demonstrates?|shows?|in\b|compared? to)/i.test(
          tail,
        )
      )
        continue;
      const small = b.height < bodyHeight * 0.94;
      const score = (standalone ? 5 : 2) + (small ? 2 : 0);
      const sameRow = blocks.filter(
        (x) =>
          x !== b &&
          Math.abs(x.y - b.y) < b.height * 0.5 &&
          x.x >= b.x + b.width - 2,
      );
      const fullWidth =
        b.width > p.width * 0.55 ||
        sameRow.some((x) => x.x + x.width > p.width * 0.65);
      const columnLeft = b.x > p.width * 0.5 ? p.width * 0.48 : 0;
      const columnRight = fullWidth || columnLeft ? p.width : p.width * 0.53;
      const captionBlocks = blocks.filter(
        (x) =>
          x.y >= b.y - b.height * 0.4 &&
          x.y <= b.y + b.height * 5.5 &&
          x.x >= columnLeft &&
          x.x < columnRight &&
          Math.abs(x.height - b.height) <= Math.max(0.6, b.height * 0.15),
      );
      const nextLabel = captionBlocks.find(
        (x) =>
          x !== b &&
          x.y > b.y + b.height &&
          /^\s*(?:Figure|Fig\.?|Table|图|表)\s*\d/i.test(x.text),
      );
      const possible = captionBlocks.filter(
        (x) => !nextLabel || x.y < nextLabel.y,
      );
      const nearby: TextBlock[] = [];
      let lastY = b.y;
      for (const x of possible) {
        if (x.y - lastY > b.height * 1.8) break;
        nearby.push(x);
        lastY = Math.max(lastY, x.y);
      }
      const text = nearby
        .map((x) => x.text)
        .join(" ")
        .slice(0, 650);
      const x1 = Math.min(b.x, ...nearby.map((x) => x.x)),
        y1 = Math.min(b.y, ...nearby.map((x) => x.y));
      const x2 = Math.max(b.x + b.width, ...nearby.map((x) => x.x + x.width)),
        y2 = Math.max(b.y + b.height, ...nearby.map((x) => x.y + x.height));
      const figure: FigureCandidate = {
        id: uid(),
        label: m[1].trim(),
        caption: text || b.text,
        page: p.number,
        reason: "待 AI 推荐",
        captionBox: {
          x: Math.max(0, x1 / p.width),
          y: Math.max(0, y1 / p.height),
          w: Math.min(1, (x2 - x1) / p.width),
          h: Math.min(1, (y2 - y1) / p.height),
        },
        bbox: { x: 0.04, y: 0.05, w: 0.92, h: 0.9 },
        located: false,
        confirmed: false,
        selected: false,
        locationStatus: "pending",
      };
      const key = figureKey(figure.label);
      if (!best.has(key) || best.get(key)!.score < score)
        best.set(key, { figure, score });
    }
  }
  return [...best.values()]
    .map((x) => x.figure)
    .sort((a, b) => a.page - b.page || a.label.localeCompare(b.label));
}
export function mergeFigureCandidates(
  found: FigureCandidate[],
  existing: FigureCandidate[],
) {
  const confirmed = existing.filter(
    (f) => f.confirmed || f.reason === "用户补充",
  );
  return [
    ...confirmed,
    ...found
      .filter(
        (f) =>
          !confirmed.some((old) => figureKey(old.label) === figureKey(f.label)),
      )
      .map((f) => {
        const old = existing.find(
          (x) => figureKey(x.label) === figureKey(f.label),
        );
        return old
          ? {
              ...f,
              id: old.id,
              selected: old.selected,
              slideId: old.slideId,
              reason: old.reason,
            }
          : f;
      }),
  ];
}
export function paddedBox(b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(0, b.x - 0.009),
    y = Math.max(0, b.y - 0.006);
  return {
    x,
    y,
    w: Math.min(1, b.x + b.w + 0.009) - x,
    h: Math.min(1, b.y + b.h + 0.006) - y,
  };
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
