import type {
  Slide,
  SlideElement,
  OutlineSlide,
  FigureCandidate,
  Evidence,
  Theme,
} from "../types";
import { uid, themes } from "../types";
export function textElement(
  text: string,
  x = 80,
  y = 170,
  w = 1100,
  h = 180,
  fontSize = 32,
): SlideElement {
  return {
    id: uid(),
    type: "text",
    text,
    x,
    y,
    w,
    h,
    fontSize,
    rotation: 0,
    color: themes.light.text,
    align: "left",
    themeRole: "text",
  };
}
export function layoutSlide(
  s: {
    id: string;
    title: string;
    bullets: string[];
    notes: string;
    figureIds: string[];
  },
  outline: OutlineSlide,
  figures: FigureCandidate[],
  evidence: Evidence[],
  theme: Theme,
): Slide {
  const t = themes[theme];
  const els: SlideElement[] = [];
  const title = textElement(s.title, 72, 55, 1136, 105, 42);
  title.bold = true;
  els.push(title);
  const selected = figures.filter(
    (f) => s.figureIds.includes(f.id) && f.assetPath,
  );
  if (outline.layout === "title" && !selected.length) {
    title.y = 200;
    title.h = 160;
    title.fontSize = 56;
    els.push(
      textElement(s.bullets.slice(0, 2).join("\n"), 76, 390, 1090, 160, 28),
    );
  } else if (selected.length) {
    const portrait = selected.length === 1 && (selected[0].aspect || 1) < 0.9;
    const full = outline.layout === "figure" || selected.length > 1 || portrait;
    const area = {
      x: full ? 72 : 590,
      y: portrait ? 160 : 180,
      w: full ? 1136 : 618,
      h: portrait ? 435 : full ? 360 : 400,
    };
    selected.forEach((f, i) => {
      const slot = area.w / selected.length;
      const ratio = f.aspect || 1.4;
      const w = Math.min(slot - 20, area.h * ratio),
        h = w / ratio;
      els.push({
        id: uid(),
        type: "image",
        x: area.x + i * slot + (slot - w) / 2,
        y: area.y + (area.h - h) / 2,
        w,
        h,
        rotation: 0,
        color: t.text,
        assetPath: f.assetPath,
        figureId: f.id,
      });
    });
    els.push(
      textElement(
        s.bullets
          .slice(0, portrait ? 1 : full ? 2 : 4)
          .map((x) => "• " + x)
          .join(full ? "\n" : "\n\n"),
        72,
        portrait ? 600 : full ? 565 : 195,
        full ? 1136 : 465,
        portrait ? 50 : full ? 80 : 400,
        portrait ? 20 : full ? 24 : 28,
      ),
    );
  } else {
    els.push(
      textElement(
        s.bullets.map((x) => "• " + x).join("\n\n"),
        80,
        190,
        1110,
        405,
        32,
      ),
    );
  }
  const sources = [
    ...new Set([
      ...evidence.map((e) => e.page),
      ...selected.map((f) => f.page),
    ]),
  ].sort((a, b) => a - b);
  const footer = textElement(
    sources.length
      ? `来源：PDF 第 ${sources.join("、")} 页${selected.length ? " · " + selected.map((f) => f.label).join(" / ") : ""}`
      : "讨论与总结 · 请核对原文",
    72,
    665,
    1110,
    30,
    16,
  );
  footer.themeRole = "muted";
  els.push(footer);
  for (const el of els) if (el.themeRole) el.color = t[el.themeRole];
  return {
    id: s.id,
    title: s.title,
    elements: els,
    notes:
      s.notes +
      "\n\n页面要点：\n" +
      s.bullets.join("\n") +
      "\n\n" +
      evidence.map((e) => `[PDF 第${e.page}页] ${e.quote}`).join("\n"),
    sources,
    figureIds: selected.map((f) => f.id),
  };
}
export function slideIssues(s: Slide) {
  const issues: string[] = [];
  for (const e of s.elements) {
    if (e.x < 0 || e.y < 0 || e.x + e.w > 1281 || e.y + e.h > 721)
      issues.push("元素超出画布");
    if (e.type === "image" && !e.assetPath) issues.push("图片文件缺失");
    if (e.type === "text") {
      const font = e.fontSize || 28;
      const lines = (e.text || "")
        .split("\n")
        .reduce(
          (n, line) =>
            n +
            Math.max(
              1,
              Math.ceil(
                [...line].reduce(
                  (sum, c) => sum + (/[\u2e80-\uffff]/.test(c) ? 1 : 0.55),
                  0,
                ) /
                  (e.w / font),
              ),
            ),
          0,
        );
      if (lines * font * 1.25 > e.h + 5)
        issues.push("文字可能溢出，请减少内容或扩大文本框");
    }
  }
  return [...new Set(issues)];
}
