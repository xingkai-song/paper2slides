import { describe, it, expect, vi } from "vitest";
vi.mock("./pdf", () => ({
  renderPage: vi.fn(),
  validBox: (b: any) =>
    b.x >= 0 &&
    b.y >= 0 &&
    b.w > 0 &&
    b.h > 0 &&
    b.x + b.w <= 1 &&
    b.y + b.h <= 1,
}));
import {
  checkRange,
  assertBody,
  splitBody,
  validateEvidence,
  parseJSON,
  Generator,
} from "./ai";
import { layoutSlide, slideIssues } from "./layout";
import type { Project, Platform } from "../types";
function project(n = 50): Project {
  return {
    schemaVersion: 1,
    id: "p",
    name: "test",
    createdAt: "",
    updatedAt: "",
    revision: 1,
    stage: "outline",
    pdfPath: "paper",
    pdfName: "paper.pdf",
    pdfHash: "x",
    pages: Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      width: 612,
      height: 792,
      text: "A verified source sentence on this page. " + "x".repeat(12000),
      blocks: [],
    })),
    range: {
      start: 1,
      end: n,
      aiStart: 1,
      aiEnd: n,
      confirmed: true,
      reason: "",
      uncertain: false,
      startEvidence: "",
      endEvidence: "",
    },
    settings: {
      scene: "组会汇报",
      minutes: 10,
      language: "中文",
      slideCount: 6,
      extra: "",
    },
    evidence: [],
    chunks: {},
    figures: [],
    outline: [],
    slides: [],
    generated: {},
    theme: "light",
    usage: [],
    warnings: [],
  };
}
describe("body boundary and evidence safety", () => {
  it("allows exactly50body pages in a longer PDF", () => {
    const p = project(80);
    p.range!.end = 50;
    expect(() => assertBody(p)).not.toThrow();
  });
  it("rejects51body pages and invalid/unconfirmed boundaries", () => {
    expect(() => assertBody(project(51))).toThrow("超过50");
    const p = project();
    p.range!.confirmed = false;
    expect(() => assertBody(p)).toThrow("核验");
    expect(() => checkRange({ start: 0, end: 5 }, 10)).toThrow();
    expect(() => checkRange({ start: 4, end: 3 }, 10)).toThrow();
  });
  it("does not silently ignore unextractable body pages", () => {
    const p = project(2);
    p.pages[1].warning = "scan";
    expect(() => assertBody(p)).toThrow("无法可靠");
  });
  it("chunks every character without truncating long pages", () => {
    const p = project(3),
      chunks = splitBody(p);
    expect(
      chunks
        .flat()
        .map((x) => x.text)
        .join(""),
    ).toBe(p.pages.map((x) => x.text).join(""));
    expect(
      chunks.every((c) => c.reduce((n, x) => n + x.text.length, 0) <= 10000),
    ).toBe(true);
  });
  it("accepts normalized actual evidence, rejects invented quotes and appendix references", () => {
    const p = project(3);
    p.range!.end = 2;
    expect(
      validateEvidence({ page: 1, quote: "A verified source sentence" }, p),
    ).toBe(true);
    expect(validateEvidence({ page: 1, quote: "invented result" }, p)).toBe(
      false,
    );
    expect(
      validateEvidence({ page: 3, quote: "A verified source sentence" }, p),
    ).toBe(false);
  });
  it("does not accept malformed generated JSON", () => {
    expect(parseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJSON("not JSON")).toThrow("有效 JSON");
  });
});
describe("figure and layout integrity", () => {
  it("includes every confirmed assigned figure as an independent image", () => {
    const p = project(3),
      figs = Array.from({ length: 2 }, (_, i) => ({
        id: "f" + i,
        label: "Figure " + i,
        caption: "caption",
        page: i + 1,
        reason: "",
        bbox: { x: 0, y: 0, w: 1, h: 1 },
        located: true,
        selected: true,
        confirmed: true,
        assetPath: "fig" + i,
        aspect: 1.5,
      }));
    const s = layoutSlide(
      {
        id: "s",
        title: "Main result",
        bullets: ["Evidence"],
        notes: "notes",
        figureIds: ["f0", "f1"],
      },
      {
        id: "s",
        title: "",
        goal: "",
        evidenceIds: [],
        figureIds: ["f0", "f1"],
        layout: "figure",
      },
      figs,
      [],
      p.theme,
    );
    expect(s.elements.filter((e) => e.type === "image")).toHaveLength(2);
    expect(s.sources).toEqual([1, 2]);
    expect(
      s.elements
        .filter((e) => e.type === "text")
        .some((e) => e.text?.includes("PDF 第 1、2 页")),
    ).toBe(true);
  });
  it("reports overflow and out-of-bounds elements", () => {
    const s = layoutSlide(
      { id: "s", title: "Title", bullets: ["a"], notes: "", figureIds: [] },
      {
        id: "s",
        title: "",
        goal: "",
        evidenceIds: [],
        figureIds: [],
        layout: "bullets",
      },
      [],
      [],
      "light",
    );
    s.elements[0].x = -20;
    s.elements[1].h = 10;
    expect(slideIssues(s)).toContain("元素超出画布");
    expect(slideIssues(s)).toContain("文字可能溢出，请减少内容或扩大文本框");
  });
});
describe("generation checkpoint and accounting", () => {
  it("records charged usage even when output cannot be parsed", async () => {
    let p = project(1);
    const fake = {
      kind: "anna",
      complete: async () => ({
        text: "invalid json",
        usage: {
          purpose: "test",
          model: "test",
          inputTokens: 5,
          outputTokens: 5,
          cu: 1.25,
          latencyMs: 1,
          at: "",
        },
      }),
    } as unknown as Platform;
    const g = new Generator(
      fake,
      () => p,
      (v) => {
        p = { ...p, ...v };
      },
      () => {},
    );
    await expect(g.identify()).rejects.toThrow();
    expect(p.usage).toHaveLength(1);
    expect(p.usage[0].cu).toBe(1.25);
  });
  it("does not start another request after stop", async () => {
    let calls = 0;
    const p = project(1),
      fake = {
        kind: "anna",
        complete: async () => {
          calls++;
          throw Error("unexpected");
        },
      } as unknown as Platform;
    const g = new Generator(
      fake,
      () => p,
      () => {},
      () => {},
    );
    g.stop();
    await expect(g.identify()).rejects.toThrow("停止");
    expect(calls).toBe(0);
  });
});

describe("outline reference repair", () => {
  function fixture(responses: (object | Error)[], stopAfterFirst = false) {
    let p = project(1);
    const evidence = {
      id: "internal-evidence",
      page: 1,
      quote: "A verified source sentence",
      claim: "Verified claim",
      kind: "paper" as const,
    };
    p.evidence = [evidence];
    p.chunks = { "1-1-0": [evidence], "1-1-1": [evidence] };
    p.figures = [
      {
        id: "internal-figure",
        page: 1,
        label: "Figure 1",
        caption: "Original method",
        reason: "",
        bbox: { x: 0, y: 0, w: 1, h: 1 },
        selected: false,
        confirmed: false,
        located: false,
      },
    ];
    const prompts: any[] = [];
    let g: Generator;
    const fake = {
      kind: "anna",
      complete: async (req: any) => {
        prompts.push(JSON.parse(req.prompt));
        const response = responses[prompts.length - 1];
        if (response instanceof Error) throw response;
        if (stopAfterFirst) g.stop();
        return {
          text: JSON.stringify(response),
          usage: {
            purpose: req.purpose,
            model: "test",
            inputTokens: 1,
            outputTokens: 1,
            cu: 0.25,
            latencyMs: 1,
            at: "",
          },
        };
      },
    } as unknown as Platform;
    g = new Generator(
      fake,
      () => p,
      (patch) => {
        p = { ...p, ...patch };
      },
      () => {},
    );
    return { g, prompts, get: () => p };
  }
  function outline(evidenceId = "E1", figureId = "F1") {
    return {
      slides: Array.from({ length: 6 }, (_, i) => ({
        title: `Slide ${i + 1}`,
        goal: "goal",
        evidenceIds: [evidenceId],
        figureIds: [figureId],
        layout: "figure",
      })),
      recommendations: [{ figureId, reason: "method" }],
    };
  }
  it("repairs once with original output and explicit errors, maps references and reuses evidence", async () => {
    const f = fixture([outline("E99", "F99"), outline()]);
    await f.g.outline();
    expect(f.prompts).toHaveLength(2);
    expect(f.prompts[1].repair.errors[0]).toContain("第1页");
    expect(f.prompts[1].repair.originalOutline.slides[0].evidenceIds).toEqual([
      "E99",
    ]);
    expect(f.prompts[1].repair.allowedEvidenceIds).toEqual(["E1"]);
    expect(f.get().outline[0].evidenceIds).toEqual(["internal-evidence"]);
    expect(f.get().outline[0].figureIds).toEqual(["internal-figure"]);
    expect(f.get().usage.reduce((n, u) => n + u.cu, 0)).toBe(0.5);
    expect(f.get().evidence).toHaveLength(1);
  });
  it("does not retry a valid outline", async () => {
    const f = fixture([outline()]);
    await f.g.outline();
    expect(f.prompts).toHaveLength(1);
  });
  it("stops after one failed repair without committing invalid output", async () => {
    const f = fixture([outline("E99"), outline("E98")]);
    await expect(f.g.outline()).rejects.toThrow("自动修复后仍有无效引用");
    expect(f.prompts).toHaveLength(2);
    expect(f.get().outline).toEqual([]);
    expect(f.get().evidence).toHaveLength(1);
    expect(f.get().usage).toHaveLength(2);
  });
  it("does not retry transport, permission or quota failures", async () => {
    for (const message of [
      "network failed",
      "permission denied",
      "quota exhausted",
    ]) {
      const f = fixture([new Error(message)]);
      await expect(f.g.outline()).rejects.toThrow(message);
      expect(f.prompts).toHaveLength(1);
    }
  });
  it("does not issue a repair after user cancellation", async () => {
    const f = fixture([outline("E99")], true);
    await expect(f.g.outline()).rejects.toThrow("停止");
    expect(f.prompts).toHaveLength(1);
    expect(f.get().usage).toHaveLength(1);
  });
});
