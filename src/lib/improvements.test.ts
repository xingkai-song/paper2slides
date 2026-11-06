import { describe, it, expect, vi, afterEach } from "vitest";
import { findFigures, mergeFigureCandidates } from "./pdfText";
import { layoutSlide, slideIssues } from "./layout";
import { wrapText, elementText } from "./typography";
import { Generator } from "./ai";
import { uploadWithRetry, deadline } from "./upload";
import type { Project, Platform, PaperPage, FigureCandidate } from "../types";
const block = (text: string, y: number, height = 10) => ({
  text,
  x: 70,
  y,
  width: 180,
  height,
});
const page = (number: number, blocks: any[]): PaperPage => ({
  number,
  width: 600,
  height: 800,
  blocks,
  text: blocks.map((b) => b.text).join(" "),
});
function fixture(): Project {
  return {
    schemaVersion: 1,
    id: "qa",
    name: "test",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    pdfPath: "paper",
    pdfName: "paper.pdf",
    pdfHash: "test",
    stage: "outline",
    pages: [
      page(1, [
        block("verified original evidence", 50),
        block("Figure 2", 500),
        block("| AIME curve", 514),
        block("Table 2", 200),
        block("| Model comparison", 214),
      ]),
    ],
    range: {
      start: 1,
      end: 1,
      aiStart: 1,
      aiEnd: 1,
      confirmed: true,
      uncertain: false,
      reason: "",
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
const figure = (id = "real-figure"): FigureCandidate => ({
  id,
  label: "Figure 2",
  caption: "AIME accuracy curve",
  page: 1,
  bbox: { x: 0, y: 0, w: 1, h: 1 },
  reason: "",
  located: false,
  selected: true,
  confirmed: false,
});
const outline = () => ({
  slides: Array.from({ length: 6 }, (_, i) => ({
    title: "Slide " + i,
    goal: "goal",
    evidenceIds: ["E1"],
    figureIds: [],
    layout: "bullets",
  })),
  recommendations: [],
});
function generator(
  p: Project,
  complete: any,
  render: any = async () => ({ toDataURL: () => "data:image/png;base64,test" }),
) {
  return new Generator(
    { kind: "anna", complete } as Platform,
    () => p,
    (v) => Object.assign(p, v),
    () => {},
    render,
  );
}
const response = (text: unknown) => ({
  text: JSON.stringify(text),
  usage: {
    purpose: "test",
    model: "test",
    inputTokens: 1,
    outputTokens: 1,
    cu: 0.1,
    latencyMs: 1,
    at: "",
  },
});
describe("caption identity regression", () => {
  it("uses number-only caption on true page, rejecting prose references", () => {
    const pages = [
      page(6, [
        block("Figure 2 depicts the performance trajectory", 300),
        block("Table 2 provides a comparison", 330),
      ]),
      page(7, [
        block("Table 2", 80),
        block("| Comparison across reasoning benchmarks", 92),
        block("Figure 2", 420),
        block("| AIME accuracy during training", 432),
      ]),
    ];
    const found = findFigures(pages, 6, 7);
    expect(found.map((f) => [f.label, f.page])).toEqual([
      ["Figure 2", 7],
      ["Table 2", 7],
    ]);
    expect(found.find((f) => f.label === "Figure 2")!.caption).toContain(
      "AIME",
    );
  });
  it("prefers actual RoFormer caption over earlier text reference and deduplicates", () => {
    const pages = [
      page(5, [
        block("Fig. 3. Compare to vanilla BERT, convergence is faster", 300),
      ]),
      page(6, [
        block("Fig. 3.", 100, 8),
        block("Evaluation of position embeddings", 100, 8),
      ]),
      page(7, [block("Fig. 5 in (a) and (b), respectively", 300)]),
      page(8, [block("Fig. 5.", 100, 8)]),
    ];
    expect(findFigures(pages, 5, 8).map((f) => [f.label, f.page])).toEqual([
      ["Fig. 3", 6],
      ["Fig. 5", 8],
    ]);
  });
  it("rescans unconfirmed figures while preserving confirmed user work", () => {
    const old = figure();
    const confirmed = {
      ...figure("kept"),
      label: "Table 1",
      confirmed: true,
      assetPath: "existing",
    };
    const scanned = { ...figure("new"), page: 7 };
    const merged = mergeFigureCandidates([scanned], [old, confirmed]);
    expect(merged.find((f) => f.id === old.id)!.page).toBe(7);
    expect(merged.find((f) => f.id === "kept")).toEqual(confirmed);
  });
});
describe("visual localization review", () => {
  it("uses independently reviewed expanded coordinates, never initial tight box", async () => {
    const p = fixture();
    p.figures = [figure()];
    let n = 0;
    const g = generator(p, async () =>
      response({
        figures: [
          {
            id: "F1",
            found: true,
            complete: true,
            reason: "complete table",
            x: n++ ? 0.1 : 0.2,
            y: 0.2,
            w: n === 2 ? 0.8 : 0.4,
            h: 0.3,
          },
        ],
      }),
    );
    await g.locate({} as any);
    expect(n).toBe(2);
    expect(p.figures[0].bbox.x).toBeLessThan(0.1);
    expect(p.figures[0].bbox.w).toBeGreaterThan(0.8);
    expect(p.figures[0].locationStatus).toBe("reviewed");
  });
  it("keeps missing or incomplete targets explicitly manual", async () => {
    for (const rows of [
      [],
      [
        {
          id: "F1",
          found: true,
          complete: false,
          reason: "last row missing",
          x: 0.1,
          y: 0.2,
          w: 0.8,
          h: 0.2,
        },
      ],
    ]) {
      const p = fixture();
      p.figures = [figure()];
      await generator(p, async () => response({ figures: rows })).locate(
        {} as any,
      );
      expect(p.figures[0].located).toBe(false);
      expect(p.figures[0].locationStatus).toBe("manual");
      expect(p.figures[0].confirmed).toBe(false);
    }
  });
  it("rejects identical regions for two different targets", async () => {
    const p = fixture();
    p.figures = [figure("a"), { ...figure("b"), label: "Table 2" }];
    await generator(p, async () =>
      response({
        figures: ["F1", "F2"].map((id) => ({
          id,
          found: true,
          complete: true,
          reason: "same",
          x: 0.1,
          y: 0.2,
          w: 0.8,
          h: 0.2,
        })),
      }),
    ).locate({} as any);
    expect(
      p.figures.every((f) => !f.located && f.locationStatus === "manual"),
    ).toBe(true);
  });
});
describe("readable layout and shared wrapping", () => {
  it("avoids the narrow-column overflow while preserving all detail in notes", () => {
    const bullets = Array.from(
      { length: 4 },
      (_, i) => String(i) + "研究实验结论".repeat(10),
    );
    const f = { ...figure(), confirmed: true, assetPath: "img", aspect: 1.8 };
    const slide = layoutSlide(
      {
        id: "s",
        title: "关键实验结果",
        bullets,
        notes: "notes",
        figureIds: [f.id],
      },
      {
        id: "s",
        title: "",
        goal: "",
        evidenceIds: [],
        figureIds: [f.id],
        layout: "split",
      },
      [f],
      [],
      "light",
    );
    expect(slideIssues(slide)).toEqual([]);
    for (const point of bullets) expect(slide.notes).toContain(point);
    expect(slide.elements.find((e) => e.type === "image")!.w).toBeGreaterThan(
      618,
    );
  });
  it("fits long pure-text bullets without making type unreadably small", () => {
    const bullets = Array.from({ length: 4 }, () => "中文研究方法".repeat(10));
    const slide = layoutSlide(
      { id: "s", title: "方法", bullets, notes: "", figureIds: [] },
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
    expect(slideIssues(slide)).toEqual([]);
    expect(
      slide.elements
        .filter((e) => e.type === "text" && e.y < 650)
        .every((e) => e.fontSize! >= 28),
    ).toBe(true);
  });
  it("keeps explicit line breaks stable between repeated layout and export", () => {
    const e = {
      text: "中文与 English words 混排说明。".repeat(6),
      w: 400,
      fontSize: 28,
    };
    const wrapped = elementText(e);
    expect(wrapped).toContain("\n");
    expect(wrapText(wrapped, 400, 28)).toBe(wrapped);
  });
});
describe("bounded evidence concurrency", () => {
  it("keeps both concurrent results, stable ordering and cache IDs", async () => {
    const p = fixture();
    p.pages[0].text = "verified original evidence " + "x".repeat(25000);
    let active = 0,
      maxActive = 0,
      evidenceCalls = 0;
    const complete = async (req: any) => {
      if (req.purpose.startsWith("提炼")) {
        evidenceCalls++;
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, evidenceCalls === 1 ? 20 : 2));
        active--;
        return response({
          evidence: [
            {
              page: 1,
              quote: "verified original evidence",
              claim: req.purpose,
              kind: "paper",
            },
          ],
        });
      }
      return response(outline());
    };
    const g = generator(p, complete);
    await g.outline();
    expect(maxActive).toBe(2);
    expect(p.evidence).toHaveLength(3);
    expect(Object.keys(p.chunks)).toHaveLength(3);
    const ids = p.evidence.map((e) => e.id);
    await g.outline();
    expect(evidenceCalls).toBe(3);
    expect(p.evidence.map((e) => e.id)).toEqual(ids);
  });
  it("rejects multiple confirmed figures assigned to one slide", async () => {
    const p = fixture();
    p.outline = [
      {
        id: "s",
        title: "method",
        goal: "",
        evidenceIds: [],
        figureIds: [],
        layout: "figure",
      },
    ];
    p.figures = ["a", "b"].map((id) => ({
      ...figure(id),
      confirmed: true,
      assetPath: id,
      slideId: "s",
    }));
    const complete = vi.fn();
    await expect(generator(p, complete).generate()).rejects.toThrow("不同页面");
    expect(complete).not.toHaveBeenCalled();
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("file-only recovery", () => {
  it("retries a transient transfer with a fresh upload URL", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(
        new Response("", { status: 200, headers: { etag: "abc" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    const api = {
      init: vi.fn(async () => ({ put_url: "https://example.invalid/put" })),
      finalize: vi.fn(async () => ({})),
    };
    await uploadWithRetry(api, "test", new Blob(["pptx"]));
    expect(api.init).toHaveBeenCalledTimes(2);
    expect(api.finalize).toHaveBeenCalledTimes(1);
  });
  it("does not retry a permission failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 403 })),
    );
    const api = {
      init: vi.fn(async () => ({ put_url: "https://example.invalid/put" })),
      finalize: vi.fn(),
    };
    await expect(
      uploadWithRetry(api, "test", new Blob(["pptx"])),
    ).rejects.toThrow("403");
    expect(api.init).toHaveBeenCalledTimes(1);
  });
  it("bounds a stalled upload initialization", async () => {
    vi.useFakeTimers();
    const work = deadline(new Promise(() => {}), 15000, "申请上传地址");
    const check = expect(work).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(15001);
    await check;
  });
});

describe("caption anchored crop boundaries", () => {
  it("limits following prose and includes the full caption width", async () => {
    const { refineCrop } = await import("./crop");
    const f = { ...figure(), captionBox: { x: 0.1, y: 0.5, w: 0.8, h: 0.03 } };
    const b = refineCrop(f, { x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
    expect(b.x).toBeLessThan(0.1);
    expect(b.x + b.w).toBeGreaterThan(0.9);
    expect(b.y + b.h).toBeLessThan(0.55);
  });
  it("removes the preceding table caption from a later table crop", async () => {
    const { refineCrop } = await import("./crop");
    const f = {
      ...figure("target"),
      label: "Table 9",
      captionBox: { x: 0.1, y: 0.4, w: 0.8, h: 0.03 },
    };
    const prior = {
      ...figure("prior"),
      label: "Table 8",
      captionBox: { x: 0.1, y: 0.27, w: 0.8, h: 0.02 },
    };
    const b = refineCrop(f, { x: 0.2, y: 0.21, w: 0.6, h: 0.25 }, undefined, [
      prior,
      f,
    ]);
    expect(b.y).toBeGreaterThan(0.29);
    expect(b.y + b.h).toBeGreaterThan(0.43);
  });
});
