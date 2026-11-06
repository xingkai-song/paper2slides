import { fitsText, textHeight } from "./typography";
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
  const title = textElement(s.title, 72, 48, 1136, 112, 42);
  if (!fitsText(s.title, 1136, 112, 42)) title.fontSize = 36;
  title.bold = true;
  els.push(title);
  const selected = figures.filter(
    (f) => s.figureIds.includes(f.id) && f.assetPath,
  );
  if (outline.layout === "title" && !selected.length) {
    title.y = 200;
    title.h = 175;
    title.fontSize = fitsText(s.title, 1136, 175, 56) ? 56 : 46;
    els.push(
      textElement(s.bullets.slice(0, 2).join("\n"), 76, 390, 1090, 160, 28),
    );
  } else if (selected.length) {
    const portrait = selected.length === 1 && (selected[0].aspect || 1) < 0.9;
    const denseTable =
      selected.length === 1 &&
      /^(table|表)/i.test(selected[0].label) &&
      (selected[0].aspect || 1) < 1.6;
    const bodyText = s.bullets.map((x) => "• " + x).join("\n\n");
    const splitFits = fitsText(bodyText, 465, 400, 28);
    const full =
      outline.layout === "figure" ||
      selected.length > 1 ||
      portrait ||
      denseTable ||
      !splitFits;
    const area = {
      x: full ? 72 : 590,
      y: denseTable ? 145 : portrait ? 160 : 180,
      w: full ? 1136 : 618,
      h: denseTable ? 480 : portrait ? 435 : full ? 360 : 400,
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
    if (denseTable) {
      const note = textElement(
        "完整大表 · 分析见讲稿；汇报时建议拆分关键区域",
        72,
        635,
        1136,
        24,
        16,
      );
      note.themeRole = "muted";
      els.push(note);
    } else if (full) {
      // A figure slide has room for two short findings; retain full detail in notes.
      const available = portrait ? 58 : 80,
        y = portrait ? 595 : 550;
      const lines: string[] = [];
      for (const point of s.bullets) {
        const next = [...lines, "• " + point].join("\n");
        if (lines.length >= 2 || !fitsText(next, 1136, available, 24)) break;
        lines.push("• " + point);
      }
      if (lines.length)
        els.push(textElement(lines.join("\n"), 72, y, 1136, available, 24));
      if (lines.length < s.bullets.length && !portrait) {
        const note = textElement("更多分析见讲稿", 72, 635, 1136, 24, 16);
        note.themeRole = "muted";
        els.push(note);
      }
    } else {
      els.push(textElement(bodyText, 72, 190, 465, 410, 28));
    }
  } else {
    const content = s.bullets.map((x) => "• " + x).join("\n\n");
    let font = 32;
    while (font > 28 && !fitsText(content, 1110, 440, font)) font -= 2;
    if (fitsText(content, 1110, 440, font))
      els.push(textElement(content, 80, 185, 1110, 440, font));
    else {
      // Use two columns before reducing type below the readable minimum.
      let cut = 1,
        best = Infinity;
      for (let i = 1; i < s.bullets.length; i++) {
        const heights = [s.bullets.slice(0, i), s.bullets.slice(i)].map((xs) =>
          textHeight(xs.map((x) => "• " + x).join("\n\n"), 535, 28),
        );
        const score = Math.max(...heights);
        if (score < best) {
          best = score;
          cut = i;
        }
      }
      [s.bullets.slice(0, cut), s.bullets.slice(cut)].forEach((xs, i) =>
        els.push(
          textElement(
            xs.map((x) => "• " + x).join("\n\n"),
            72 + i * 590,
            185,
            535,
            440,
            28,
          ),
        ),
      );
    }
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
      if (textHeight(e.text || "", e.w, font) > e.h + 1)
        issues.push("文字可能溢出，请减少内容或扩大文本框");
    }
  }
  return [...new Set(issues)];
}
