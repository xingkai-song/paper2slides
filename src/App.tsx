import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  FolderOpen,
  GripVertical,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  Redo2,
  Scissors,
  Settings2,
  Sparkles,
  Square,
  Sun,
  Moon,
  Trash2,
  Type,
  Undo2,
  UploadCloud,
  X,
  AlertCircle,
  PanelRightClose,
  RotateCcw,
  Save,
} from "lucide-react";
import type {
  Platform,
  Project,
  ProjectSummary,
  FigureCandidate,
  Slide,
  SlideElement,
} from "./types";
import { uid, themes } from "./types";
import {
  connectPlatform,
  recoveryGet,
  recoveryDelete,
  saveBlob,
} from "./lib/platform";
import { Repository } from "./lib/repository";
import {
  loadPDF,
  parsePDF,
  cropFigure,
  findFigures,
  type PDF,
} from "./lib/pdf";
import { Generator, checkRange, assertBody } from "./lib/ai";
import { buildPPTX } from "./lib/export";
import { layoutSlide, textElement, slideIssues } from "./lib/layout";
import { useApp } from "./store";
import { PdfPanel } from "./components/PdfPanel";
import { SlideCanvas, SlideThumbnail } from "./components/CanvasEditor";
import "./styles.css";
function message(e: unknown) {
  const text = e instanceof Error ? e.message : String(e);
  if (/quota|额度/i.test(text))
    return "额度不足或达到预算。已保存完成的阶段，请检查 Anna 用量后重试。";
  return text;
}
export default function App() {
  const {
    project: p,
    patch,
    setProject,
    selectedSlide,
    selectSlide,
    selectedElement,
    selectElement,
    editSlides,
    undo,
    redo,
    past,
    future,
  } = useApp();
  const [platform, setPlatform] = useState<Platform | null>(null),
    [repo, setRepo] = useState<Repository | null>(null),
    [initError, setInitError] = useState(""),
    [list, setList] = useState<ProjectSummary[]>([]),
    [pdf, setPdf] = useState<PDF | null>(null),
    [pdfPage, setPdfPage] = useState(1),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState(""),
    [conflict, setConflict] = useState(false),
    [cropping, setCropping] = useState<FigureCandidate | null>(null),
    [cropBusy, setCropBusy] = useState(false),
    [rightTab, setRightTab] = useState<"properties" | "paper">("properties"),
    [rangeNote, setRangeNote] = useState(""),
    [rangeDraft, setRangeDraft] = useState({ start: 1, end: 1 }),
    [usageOpen, setUsageOpen] = useState(false),
    [pendingSlide, setPendingSlide] = useState<Slide | null>(null),
    [exportIssues, setExportIssues] = useState<string[] | null>(null),
    [downloadReady, setDownloadReady] = useState<{
      blob: Blob;
      filename: string;
    } | null>(null),
    [recovery, setRecovery] = useState<Project | null>(null),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    gen = useRef<Generator | null>(null);
  const didConnect = useRef(false);
  useEffect(() => {
    if (didConnect.current) return;
    didConnect.current = true;
    connectPlatform()
      .then(async (f) => {
        setPlatform(f);
        const r = new Repository(f);
        setRepo(r);
        setList(await r.list());
      })
      .catch((e) => setInitError(message(e)));
  }, []);
  useEffect(() => {
    if (!p || !repo) return;
    const project = p;
    setSaveStatus("待保存");
    const timer = setTimeout(() => {
      setSaveStatus("保存中");
      repo
        .save(project)
        .then(() => {
          if (
            useApp.getState().project?.id === project.id &&
            useApp.getState().project?.revision === project.revision
          ) {
            setSaveStatus("已保存");
            setConflict(false);
          }
        })
        .catch((e) => {
          setSaveStatus("保存失败 · 本机已保留");
          if (String(e).includes("SAVE_CONFLICT")) setConflict(true);
          else setError(message(e));
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [p?.revision, p?.id, repo]);
  useEffect(() => {
    if (p?.range) setRangeDraft({ start: p.range.start, end: p.range.end });
  }, [p?.range?.start, p?.range?.end]);
  useEffect(() => {
    function unload(e: BeforeUnloadEvent) {
      if (saveStatus !== "已保存" && p) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [saveStatus, p]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        !p ||
        p.stage !== "editor" ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if (!selectedElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteElement();
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateElement();
      }
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (delta[e.key]) {
        e.preventDefault();
        const [dx, dy] = delta[e.key],
          n = e.shiftKey ? 10 : 1;
        editSlides((ss) => {
          const el = ss[selectedSlide].elements.find(
            (x) => x.id === selectedElement,
          );
          if (el) {
            el.x += dx * n;
            el.y += dy * n;
          }
          return ss;
        });
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [p?.stage, selectedElement, selectedSlide]);
  async function refresh() {
    if (repo) setList(await repo.list());
  }
  async function open(id: string) {
    if (!repo || !platform) return;
    setBusy("打开项目");
    setError("");
    try {
      const project = await repo.load(id),
        local = (await recoveryGet(id)) as Project | undefined;
      if (local && local.updatedAt > project.updatedAt) setRecovery(local);
      const document = await loadPDF(await platform.blob(project.pdfPath));
      setPdf(document);
      setPdfPage(project.range?.start || 1);
      setProject(project);
      setSaveStatus("已保存");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  async function home() {
    if (busy) return;
    try {
      if (p && repo) await repo.save(p);
      await refresh();
      setProject(null);
      setPdf(null);
      setError("");
    } catch (e) {
      setError(message(e));
      if (String(e).includes("SAVE_CONFLICT")) setConflict(true);
    }
  }
  async function upload(file?: File) {
    if (!file || !platform || !repo) return;
    setError("");
    if (file.size > 20 * 1024 * 1024) {
      setError("文件不能超过20MB。");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("请选择 PDF 文件。");
      return;
    }
    setBusy("读取论文");
    try {
      const doc = await loadPDF(file),
        pages = await parsePDF(doc, setBusy);
      if (!pages.some((x) => !x.warning))
        throw new Error("文件没有可提取的正文，暂不支持扫描型 PDF。");
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      const id = uid(),
        path = `projects/${id}/paper.pdf`;
      setBusy("保存原始 PDF");
      await platform.upload(path, file);
      const project: Project = {
        schemaVersion: 1,
        id,
        name: file.name.replace(/\.pdf$/i, ""),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 0,
        stage: "range",
        pdfPath: path,
        pdfName: file.name,
        pdfHash: hash,
        pages,
        settings: {
          scene: "组会汇报",
          minutes: 10,
          language: "中文",
          slideCount: 10,
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
      await repo.save(project);
      setProject(project);
      setPdf(doc);
      setPdfPage(1);
      setSaveStatus("已保存");
      if (platform.kind === "anna") {
        await run((g) => g.identify(), "AI 正在识别正文");
      } else
        setError(
          "PDF 已解析并保存在本机。当前为本地预览，AI 识别需要在 Anna 内运行。",
        );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }
  async function run(
    action: (g: Generator) => Promise<unknown>,
    initial = "正在处理",
  ) {
    if (!platform) return;
    setError("");
    setBusy(initial);
    const g = new Generator(
      platform,
      () => useApp.getState().project!,
      (v) => useApp.getState().patch(v),
      setBusy,
    );
    gen.current = g;
    try {
      await action(g);
    } catch (e) {
      setError(message(e));
    } finally {
      gen.current = null;
      setBusy("");
      const current = useApp.getState().project;
      if (current && repo)
        try {
          await repo.save(current);
          setSaveStatus("已保存");
        } catch (e) {
          setSaveStatus("保存失败 · 本机已保留");
          if (String(e).includes("SAVE_CONFLICT")) setConflict(true);
          else setError(message(e));
        }
    }
  }
  async function confirmRange() {
    if (!p?.range) return;
    setError("");
    try {
      if (
        rangeDraft.start !== p.range.start ||
        rangeDraft.end !== p.range.end
      ) {
        if (!rangeNote.trim())
          throw new Error(
            "请说明识别错误与修正依据；不能裁掉正文以绕过50页限制。",
          );
        await run(async (g) => {
          await g.reviewCorrection(rangeDraft.start, rangeDraft.end, rangeNote);
        }, "核验修正范围");
        const current = useApp.getState().project!;
        if (
          current.range!.start !== rangeDraft.start ||
          current.range!.end !== rangeDraft.end
        )
          return;
      }
      const current = useApp.getState().project!;
      const count = checkRange(current.range!, current.pages.length);
      if (count > 50)
        throw new Error(
          `正文共${count}页，超过50页，暂不支持该论文，请更换文件。`,
        );
      if (
        current.pages
          .slice(current.range!.start - 1, current.range!.end)
          .some((x) => x.warning)
      )
        throw new Error("正文含无法可靠提取文字的页面，暂不支持该论文。");
      patch({
        range: { ...current.range!, confirmed: true },
        figures: findFigures(
          current.pages,
          current.range!.start,
          current.range!.end,
        ),
        stage: "outline",
      });
      setPdfPage(current.range!.start);
    } catch (e) {
      setError(message(e));
    }
  }
  function updateFigure(id: string, v: Partial<FigureCandidate>) {
    const current = useApp.getState().project!;
    patch({
      figures: current.figures.map((f) => (f.id === id ? { ...f, ...v } : f)),
      generated: {},
    });
  }
  async function confirmCrop() {
    if (!cropping || !pdf || !platform || !p) return;
    setCropBusy(true);
    setError("");
    try {
      const blob = await cropFigure(pdf, cropping.page, cropping.bbox),
        path = `projects/${p.id}/figures/${uid()}.png`;
      await platform.upload(path, blob);
      const img = await createImageBitmap(blob);
      const updated = {
        ...cropping,
        assetPath: path,
        aspect: img.width / img.height,
        confirmed: true,
        selected: true,
        slideId:
          cropping.slideId ||
          p.outline[selectedSlide]?.id ||
          p.outline[1]?.id ||
          p.outline[0]?.id,
      };
      img.close();
      const exists = p.figures.some((f) => f.id === updated.id);
      patch({
        figures: exists
          ? p.figures.map((f) => (f.id === updated.id ? updated : f))
          : [...p.figures, updated],
        generated: {},
      });
      if (p.stage === "editor") {
        editSlides((ss) => {
          const s = ss[selectedSlide];
          s.elements.push({
            id: uid(),
            type: "image",
            x: 260,
            y: 170,
            w: Math.min(800, updated.aspect * 420),
            h: Math.min(420, 800 / updated.aspect),
            rotation: 0,
            color: "#172f29",
            assetPath: path,
            figureId: updated.id,
          });
          if (!s.figureIds.includes(updated.id)) s.figureIds.push(updated.id);
          if (!s.sources.includes(updated.page)) s.sources.push(updated.page);
          s.notes += `\n${updated.label} · PDF 第${updated.page}页`;
          const footer = s.elements.find(
            (e) => e.type === "text" && e.themeRole === "muted" && e.y >= 650,
          );
          if (footer)
            footer.text = `来源：PDF 第 ${s.sources.sort((a, b) => a - b).join("、")} 页`;
          return ss;
        });
      }
      setCropping(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setCropBusy(false);
    }
  }
  function manualFigure() {
    if (!p) return;
    setCropping({
      id: uid(),
      label: "图表 " + (p.figures.length + 1),
      caption: "用户从原论文框选",
      page: pdfPage,
      reason: "用户补充",
      bbox: { x: 0.08, y: 0.15, w: 0.84, h: 0.5 },
      located: false,
      confirmed: false,
      selected: true,
      slideId: p.outline[selectedSlide]?.id || p.outline[1]?.id,
    });
  }
  function moveOutline(i: number, dir: number) {
    if (!p || i + dir < 0 || i + dir >= p.outline.length) return;
    const a = [...p.outline];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    patch({ outline: a, generated: {} });
  }
  function editOutline(id: string, v: Partial<Project["outline"][number]>) {
    if (!p) return;
    patch({
      outline: p.outline.map((o) => (o.id === id ? { ...o, ...v } : o)),
      generated: {},
    });
  }
  function elementPatch(v: Partial<SlideElement>) {
    editSlides((ss) => {
      ss[selectedSlide].elements = ss[selectedSlide].elements.map((e) =>
        e.id === selectedElement
          ? {
              ...e,
              ...v,
              themeRole: "color" in v || "fill" in v ? undefined : e.themeRole,
            }
          : e,
      );
      return ss;
    });
  }
  function addElement(type: SlideElement["type"]) {
    if (!p?.slides[selectedSlide]) return;
    const el =
      type === "text"
        ? textElement("输入文字", 100, 220, 700, 150, 32)
        : {
            id: uid(),
            type,
            x: 150,
            y: 220,
            w: 350,
            h: type === "line" ? 2 : 180,
            rotation: 0,
            color: themes[p.theme].accent,
            fill: themes[p.theme].surface,
            themeRole: "accent" as const,
          };
    editSlides((ss) => {
      ss[selectedSlide].elements.push(el);
      return ss;
    });
    selectElement(el.id);
  }
  function deleteElement() {
    editSlides((ss) => {
      ss[selectedSlide].elements = ss[selectedSlide].elements.filter(
        (e) => e.id !== selectedElement,
      );
      return ss;
    });
    selectElement(null);
  }
  function duplicateElement() {
    editSlides((ss) => {
      const e = ss[selectedSlide].elements.find(
        (e) => e.id === selectedElement,
      );
      if (e) {
        const id = uid();
        ss[selectedSlide].elements.push({ ...e, id, x: e.x + 20, y: e.y + 20 });
        selectElement(id);
      }
      return ss;
    });
  }
  function layerElement(dir: number) {
    editSlides((ss) => {
      const els = ss[selectedSlide].elements,
        i = els.findIndex((e) => e.id === selectedElement);
      if (i >= 0 && i + dir >= 0 && i + dir < els.length)
        [els[i], els[i + dir]] = [els[i + dir], els[i]];
      return ss;
    });
  }
  function switchTheme() {
    if (!p) return;
    const theme = p.theme === "light" ? "dark" : "light";
    editSlides((ss) =>
      ss.map((s) => ({
        ...s,
        elements: s.elements.map((e) =>
          e.themeRole
            ? {
                ...e,
                color: themes[theme][e.themeRole],
                ...(e.type === "rect"
                  ? { fill: themes[theme][e.themeRole] }
                  : {}),
              }
            : e,
        ),
      })),
    );
    patch({ theme, exported: undefined });
  }
  function addSlide() {
    if (!p) return;
    const id = uid(),
      outline = {
        id,
        title: "新的幻灯片",
        goal: "",
        evidenceIds: [],
        figureIds: [],
        layout: "bullets" as const,
      };
    const slide = layoutSlide(
      {
        id,
        title: outline.title,
        bullets: ["输入你的内容"],
        notes: "",
        figureIds: [],
      },
      outline,
      [],
      [],
      p.theme,
    );
    editSlides((ss) => {
      ss.splice(selectedSlide + 1, 0, slide);
      return ss;
    });
    patch({ outline: [...useApp.getState().project!.outline, outline] });
    selectSlide(selectedSlide + 1);
  }
  function moveSlide(dir: number) {
    if (!p || selectedSlide + dir < 0 || selectedSlide + dir >= p.slides.length)
      return;
    editSlides((ss) => {
      [ss[selectedSlide], ss[selectedSlide + dir]] = [
        ss[selectedSlide + dir],
        ss[selectedSlide],
      ];
      return ss;
    });
    selectSlide(selectedSlide + dir);
  }
  async function doExport(force = false) {
    if (!p || !platform) return;
    const issues = p.slides.flatMap((s, i) =>
      slideIssues(s).map((x) => `第${i + 1}页：${x}`),
    );
    if (issues.length && !force) {
      setExportIssues(issues);
      return;
    }
    setExportIssues(null);
    setBusy("生成可编辑 PPTX");
    setError("");
    try {
      let path =
        p.exported?.revision === p.revision ? p.exported.path : undefined;
      let outputBlob: Blob | undefined;
      if (!path) {
        const blob = await buildPPTX(p, platform);
        outputBlob = blob;
        path = `projects/${p.id}/exports/${p.revision}.pptx`;
        await platform.upload(path, blob);
        patch({ exported: { revision: p.revision + 1, path } });
      }
      const filename = p.name.replace(/[\\/:*?"<>|]/g, "-") + ".pptx";
      if (platform.kind === "anna")
        setDownloadReady({
          blob: outputBlob || (await platform.blob(path)),
          filename,
        });
      await platform.download(path, filename);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  async function demo() {
    if (!platform || !repo) return;
    setBusy("准备示例项目");
    setError("");
    try {
      const response = await fetch(new URL("./demo.pdf", location.href));
      if (!response.ok) throw new Error("示例文件加载失败");
      const blob = await response.blob(),
        doc = await loadPDF(blob),
        pages = await parsePDF(doc, setBusy),
        id = uid(),
        path = `projects/${id}/paper.pdf`;
      await platform.upload(path, blob);
      const outlines = [
        "让模型只阅读相关证据",
        "为什么长文档需要检索",
        "检索与回答的工作流程",
        "实验设计与评估",
        "实验结果应该如何呈现",
        "局限与下一步",
      ];
      const project: Project = {
        schemaVersion: 1,
        id,
        name: "检索增强问答 · 交互示例",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 0,
        stage: "editor",
        pdfPath: path,
        pdfName: "demo.pdf",
        pdfHash: "synthetic-demo",
        pages,
        range: {
          start: 1,
          end: 3,
          aiStart: 1,
          aiEnd: 3,
          reason: "合成示例，非真实AI识别结果",
          uncertain: false,
          startEvidence: "",
          endEvidence: "",
          confirmed: true,
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
        outline: outlines.map((title, i) => ({
          id: "demo-" + i,
          title,
          goal: "合成示例内容，非真实论文研究结论",
          evidenceIds: [],
          figureIds: [],
          layout: i === 0 ? "title" : "bullets",
        })),
        slides: [],
        generated: {},
        theme: "light",
        usage: [],
        warnings: [
          "这是合成演示文稿，用于体验编辑和导出，没有调用 AI，也不代表真实论文结论。",
        ],
      };
      const bullets = [
        ["PAPER READING, REIMAGINED", "一份用于体验画布与导出的合成示例"],
        [
          "长文档包含大量与当前问题无关的内容",
          "先检索证据，再基于证据组织回答",
          "以下内容仅用于演示产品交互",
        ],
        [
          "将文档分块并保留来源页码",
          "为问题找到相关文本片段",
          "用可追溯证据形成回答",
        ],
        [
          "比较直接回答与基于检索的回答",
          "分别记录准确性、可追溯性和成本",
          "真实研究需要明确数据集与评估方法",
        ],
        [
          "展示原始图表，不重画实验数值",
          "图表需保留完整坐标轴与图例",
          "真实数值应回到论文核对",
        ],
        [
          "检索遗漏可能导致回答缺少上下文",
          "引用存在不等于结论一定正确",
          "人工核验仍然是必要步骤",
        ],
      ];
      project.slides = project.outline.map((o, i) =>
        layoutSlide(
          {
            id: o.id,
            title: o.title,
            bullets: bullets[i],
            notes: "合成示例内容，非真实论文结论。",
            figureIds: [],
          },
          o,
          [],
          [],
          project.theme,
        ),
      );
      const fig: FigureCandidate = {
        id: uid(),
        label: "Demo Figure 1",
        caption: "合成检索流程图",
        page: 2,
        reason: "用于体验原图裁剪与编辑",
        bbox: { x: 0.08, y: 0.25, w: 0.84, h: 0.36 },
        located: true,
        confirmed: true,
        selected: true,
        slideId: "demo-2",
      };
      const crop = await cropFigure(doc, 2, fig.bbox);
      fig.assetPath = `projects/${id}/figures/demo.png`;
      fig.aspect = 2.3;
      await platform.upload(fig.assetPath, crop);
      project.figures = [fig];
      project.slides[2] = layoutSlide(
        {
          id: "demo-2",
          title: outlines[2],
          bullets: bullets[2],
          notes: "合成示例",
          figureIds: [fig.id],
        },
        { ...project.outline[2], layout: "split" },
        [fig],
        [],
        project.theme,
      );
      await repo.save(project);
      setProject(project);
      setPdf(doc);
      setPdfPage(2);
      setSaveStatus("已保存");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  const slide = p?.slides[selectedSlide],
    element = slide?.elements.find((e) => e.id === selectedElement),
    totalCu = p?.usage.reduce((s, u) => s + u.cu, 0) || 0;
  if (initError)
    return (
      <div className="fatal">
        <BookOpen />
        <h1>无法连接 Anna</h1>
        <p>{initError}</p>
        <button className="primary" onClick={() => location.reload()}>
          重新连接
        </button>
        <small>连接失败时不会切换成本地模式，以免误认为云端已保存。</small>
      </div>
    );
  if (!platform || !repo)
    return (
      <div className="fatal">
        <Loader2 className="spin" />
        <p>正在连接工作空间…</p>
      </div>
    );
  return (
    <div className={"app " + (p?.stage === "editor" ? "editing" : "")}>
      <header className="topbar">
        <button className="brand" onClick={() => void home()} disabled={!!busy}>
          <span className="brand-icon">
            <BookOpen size={21} />
          </span>
          <span>
            Paper<span className="brand-two">2</span>Slides
          </span>
        </button>
        <div className="top-center">
          {p ? (
            <>
              <span className="top-divider" />
              <input
                aria-label="项目名称"
                className="project-name"
                value={p.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <span
                className={
                  "save-state " + (saveStatus.includes("失败") ? "warn" : "")
                }
              >
                <span /> {saveStatus || "待保存"}
              </span>
            </>
          ) : (
            <span className="top-subtitle">YOUR RESEARCH, WELL PRESENTED.</span>
          )}
        </div>
        <div className="top-actions">
          <button className="mode-chip" onClick={() => setUsageOpen(true)}>
            <span
              className={
                "status-dot " + (platform.kind === "anna" ? "" : "local")
              }
            />
            {platform.kind === "anna" ? "Anna 已连接" : "本地预览"}
            {p && <span> · {totalCu.toFixed(2)} CU</span>}
          </button>
          {p?.stage === "editor" && (
            <button
              className="primary"
              onClick={() => void doExport()}
              disabled={!!busy}
            >
              <Download size={16} />
              导出 PPTX
            </button>
          )}
          <span className="avatar">P</span>
        </div>
      </header>
      {platform.kind === "local" && (
        <div className="local-banner">
          本地预览 · 文件只保存在此浏览器，真实 AI 和云端存储请从 Anna
          打开应用。示例可体验编辑与导出。
        </div>
      )}
      {busy && (
        <div className="progress-bar">
          <Loader2 size={15} className="spin" />
          <span>{busy}</span>
          {gen.current && (
            <button onClick={() => gen.current?.stop()}>停止后续生成</button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {conflict && (
        <div className="error-banner">
          <span>另一窗口更新了该项目。未覆盖云端内容。</span>
          <button onClick={() => p && void open(p.id)}>加载云端</button>
          <button
            onClick={() =>
              void (async () => {
                if (p) {
                  const copy = await repo.copy(p);
                  setConflict(false);
                  setProject(copy);
                }
              })()
            }
          >
            另存副本
          </button>
        </div>
      )}
      {!p ? (
        <main className="home">
          <div className="home-nav">
            <span className="eyebrow">
              <span /> RESEARCH WORKSPACE
            </span>
            <button
              className="text-button"
              onClick={() => void demo()}
              disabled={!!busy}
            >
              体验示例 <ArrowUpRight size={15} />
            </button>
          </div>
          <section className="hero">
            <div className="hero-copy">
              <div className="hero-tag">
                <Sparkles size={14} /> 为每一次论文分享而设计
              </div>
              <h1>
                让研究，
                <br />被<span className="serif">清晰看见。</span>
                <span className="hero-star">✳</span>
              </h1>
              <p>
                从一篇论文，到一场有据可循的分享。
                <br />
                AI 梳理脉络，你掌握每一个观点。
              </p>
              <div className="hero-meta">
                <span>
                  <CheckCircle2 size={15} /> 关键图表，原样呈现
                </span>
                <span>
                  <CheckCircle2 size={15} /> PPTX，自由编辑
                </span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="visual-grid" />
              <div className="paper-card">
                <div className="paper-cap">
                  RESEARCH PAPER <FileText size={14} />
                </div>
                <h3>
                  Ideas deserve
                  <br />a better stage.
                </h3>
                <i />
                <i />
                <i className="short" />
                <div className="paper-chart">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="paper-bottom">SOURCE → STORY</div>
              </div>
              <div className="visual-arrow">↗</div>
              <div className="deck-card">
                <span className="deck-kicker">01 / RESEARCH OVERVIEW</span>
                <h3>
                  从证据出发
                  <br />
                  讲清一个好想法。
                </h3>
                <div className="deck-rule" />
                <p>问题 · 方法 · 发现</p>
                <div className="deck-footer">
                  <span>Paper2Slides</span>
                  <span>✳</span>
                </div>
              </div>
              <div className="visual-caption">
                <span className="status-dot" /> Built with Anna AI
              </div>
            </div>
          </section>
          <section className="upload-section">
            <div>
              <span className="section-index">01 — START WITH A PAPER</span>
              <h2>你的下一场分享，从这里开始</h2>
            </div>
            <div
              className="upload-zone"
              role="button"
              tabIndex={0}
              aria-label="上传论文PDF"
              onClick={() => !busy && input.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter") input.current?.click();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) void upload(e.dataTransfer.files[0]);
              }}
            >
              <div className="upload-icon">
                <UploadCloud size={28} />
              </div>
              <div>
                <h3>
                  将论文 PDF 拖到这里，或
                  <span>
                    选择文件 <ArrowUpRight size={15} />
                  </span>
                </h3>
                <p>文字型 PDF · 最大 20 MB · AI 识别正文，最多 50 页</p>
              </div>
              <button
                className="upload-cta"
                disabled={!!busy}
                onClick={(e) => {
                  e.stopPropagation();
                  input.current?.click();
                }}
              >
                上传论文 <Plus size={17} />
              </button>
            </div>
            <p className="privacy-note">
              <span>✧</span> 原 PDF 与项目保存在
              Anna；文本和用于识别图表的页面将发送给平台模型。正文范围和图表均由你核验。
            </p>
          </section>
          <section className="projects-section">
            <div className="section-heading">
              <div>
                <span className="section-index">02 — YOUR LIBRARY</span>
                <h2>
                  研究工作台{" "}
                  <span>{list.length.toString().padStart(2, "0")}</span>
                </h2>
              </div>
              <button className="text-button" onClick={() => void refresh()}>
                <RotateCcw size={14} />
                刷新项目
              </button>
            </div>
            {list.length ? (
              <div className="project-grid">
                {list.map((s) => (
                  <article className="project-card" key={s.id}>
                    <button
                      className="project-open"
                      onClick={() => void open(s.id)}
                      disabled={!!busy}
                    >
                      <div className="project-art">
                        <FileText size={35} />
                        <span>
                          {s.slideCount ? `${s.slideCount} SLIDES` : "PAPER"}
                        </span>
                      </div>
                      <h3>{s.name}</h3>
                      <p>
                        {s.pageCount} 页 ·{" "}
                        {s.stage === "editor"
                          ? "可继续编辑"
                          : s.stage === "range"
                            ? "待核验正文"
                            : "大纲与图表"}{" "}
                        · {new Date(s.updatedAt).toLocaleDateString("zh-CN")}
                      </p>
                    </button>
                    <button
                      title="删除项目"
                      className="project-delete"
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="library-empty">
                <FolderOpen size={25} />
                <div>
                  <strong>给下一次灵感，留一个位置。</strong>
                  <p>上传第一篇论文，或打开示例体验编辑器。</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => void demo()}
                  disabled={!!busy}
                >
                  打开示例 <ArrowRight size={15} />
                </button>
              </div>
            )}
          </section>
          <footer className="home-footer">
            <span>从论文到讲台，让研究被看见。</span>
            <span>Paper2Slides / Powered by Anna</span>
          </footer>
        </main>
      ) : (
        <>
          {p.stage !== "editor" && (
            <nav className="stepper">
              <button onClick={() => void home()} disabled={!!busy}>
                <ArrowLeft size={16} />
                工作台
              </button>
              <div>
                {[
                  ["range", "正文核验"],
                  ["outline", "大纲与图表"],
                  ["editor", "编辑与导出"],
                ].map(([key, title], i) => (
                  <span key={key} className={p.stage === key ? "current" : ""}>
                    <b>{i + 1}</b>
                    {title}
                    {i < 2 && <i />}
                  </span>
                ))}
              </div>
              <span className="step-file">
                <FileText size={14} />
                {p.pages.length} 页 PDF
              </span>
            </nav>
          )}
          {p.stage === "range" && (
            <main className="range-layout">
              <section className="range-copy">
                <span className="eyebrow">01 / KNOW YOUR PAPER</span>
                <h1>
                  先确认，
                  <br />
                  我们读的是正文。
                </h1>
                <p className="muted">
                  AI 定位主要研究内容，排除参考文献与附录。你来做最后的核验。
                </p>
                {!p.range ? (
                  <div className="range-pending">
                    <Sparkles size={26} />
                    <h3>让 AI 识别正文边界</h3>
                    <p>识别完成后会展示页码、判断依据与边界预览。</p>
                    <button
                      className="primary"
                      onClick={() => void run((g) => g.identify())}
                      disabled={!!busy || platform.kind === "local"}
                    >
                      识别正文范围 <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className={
                        "range-result " +
                        (p.range.end - p.range.start + 1 > 50
                          ? "over-limit"
                          : "")
                      }
                    >
                      <span className="small-label">
                        AI 识别结果{" "}
                        {p.range.uncertain && "· 边界不确定，请仔细核验"}
                      </span>
                      <div className="range-numbers">
                        <strong>
                          {p.range.start}
                          <span>—</span>
                          {p.range.end}
                        </strong>
                        <span>
                          PDF 页码
                          <br />
                          <b>{p.range.end - p.range.start + 1} 页正文</b>
                        </span>
                      </div>
                      <p>{p.range.reason}</p>
                      {p.range.end - p.range.start + 1 > 50 && (
                        <div className="inline-warning">
                          正文超过50页，暂不支持该论文。只有识别错误可以修正，不支持选择部分正文生成。
                        </div>
                      )}
                    </div>
                    <div className="boundary-links">
                      <button onClick={() => setPdfPage(p.range!.start)}>
                        查看起始页 {p.range.start} <ArrowUpRight size={14} />
                      </button>
                      <button onClick={() => setPdfPage(p.range!.end)}>
                        查看结束页 {p.range.end} <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <details className="range-adjust">
                      <summary>识别有误？修正正文范围</summary>
                      <div className="field-row">
                        <label>
                          起始页
                          <input
                            type="number"
                            min={1}
                            max={p.pages.length}
                            value={rangeDraft.start}
                            onChange={(e) =>
                              setRangeDraft({
                                ...rangeDraft,
                                start: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          结束页
                          <input
                            type="number"
                            min={1}
                            max={p.pages.length}
                            value={rangeDraft.end}
                            onChange={(e) =>
                              setRangeDraft({
                                ...rangeDraft,
                                end: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <textarea
                        placeholder="说明识别错误，例如：第10页已进入附录。修正将由 AI 复核。"
                        value={rangeNote}
                        onChange={(e) => setRangeNote(e.target.value)}
                      />
                    </details>
                    <button
                      className="primary wide"
                      onClick={() => void confirmRange()}
                      disabled={!!busy}
                    >
                      核验并继续 <ArrowRight size={16} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void run((g) => g.identify())}
                      disabled={!!busy}
                    >
                      重新识别
                    </button>
                  </>
                )}
                <div className="source-rule">
                  <BookOpen size={17} />
                  <p>
                    包含正文的首尾混合页各计一页。PDF 页码从 1
                    开始，与印刷页码可能不同。
                  </p>
                </div>
              </section>
              <section className="range-preview">
                <div className="panel-heading">
                  <span>原文预览</span>
                  <span>{p.pdfName}</span>
                </div>
                {pdf && (
                  <PdfPanel pdf={pdf} page={pdfPage} onPage={setPdfPage} />
                )}
                <details className="text-preview">
                  <summary>检查本页提取文字</summary>
                  <textarea
                    aria-label="提取文字"
                    value={p.pages[pdfPage - 1]?.text || ""}
                    onChange={(e) =>
                      patch({
                        pages: p.pages.map((x) =>
                          x.number === pdfPage
                            ? {
                                ...x,
                                text: e.target.value,
                                warning:
                                  e.target.value.replace(/\s/g, "").length < 40
                                    ? "有效文字不足"
                                    : undefined,
                              }
                            : x,
                        ),
                        chunks: {},
                        evidence: [],
                      })
                    }
                  />
                </details>
              </section>
            </main>
          )}
          {p.stage === "outline" && (
            <main className="outline-layout">
              <aside className="settings-panel">
                <span className="eyebrow">02 / SHAPE THE STORY</span>
                <h2>这次，讲给谁听？</h2>
                <p className="muted">以证据为底稿，让观点形成脉络。</p>
                <label>
                  汇报场景
                  <select
                    value={p.settings.scene}
                    disabled={!!busy || !!p.outline.length}
                    onChange={(e) =>
                      patch({
                        settings: { ...p.settings, scene: e.target.value },
                      })
                    }
                  >
                    <option>组会汇报</option>
                    <option>课堂展示</option>
                    <option>快速导读</option>
                  </select>
                </label>
                <div className="field-row">
                  <label>
                    时长
                    <select
                      value={p.settings.minutes}
                      disabled={!!busy || !!p.outline.length}
                      onChange={(e) =>
                        patch({
                          settings: {
                            ...p.settings,
                            minutes: Number(e.target.value),
                            slideCount: ({ 5: 6, 10: 10, 20: 15 } as any)[
                              e.target.value
                            ],
                          },
                        })
                      }
                    >
                      {[5, 10, 20].map((n) => (
                        <option key={n} value={n}>
                          {n} 分钟
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    语言
                    <select
                      value={p.settings.language}
                      disabled={!!busy || !!p.outline.length}
                      onChange={(e) =>
                        patch({
                          settings: {
                            ...p.settings,
                            language: e.target.value as any,
                          },
                        })
                      }
                    >
                      <option>中文</option>
                      <option>English</option>
                    </select>
                  </label>
                </div>
                <label>
                  幻灯片页数
                  <input
                    aria-label="幻灯片页数"
                    type="number"
                    min={5}
                    max={20}
                    value={p.settings.slideCount}
                    disabled={!!busy || !!p.outline.length}
                    onChange={(e) =>
                      patch({
                        settings: {
                          ...p.settings,
                          slideCount: Math.max(
                            5,
                            Math.min(20, Number(e.target.value) || 5),
                          ),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  补充要求 <span className="optional">选填</span>
                  <textarea
                    maxLength={1000}
                    placeholder="例如：听众了解深度学习，重点讲方法与消融实验。"
                    value={p.settings.extra}
                    disabled={!!busy || !!p.outline.length}
                    onChange={(e) =>
                      patch({
                        settings: { ...p.settings, extra: e.target.value },
                      })
                    }
                  />
                </label>
                <div className="paper-summary">
                  <FileText size={20} />
                  <div>
                    <strong>{p.pdfName}</strong>
                    <span>
                      正文 {p.range!.start}–{p.range!.end} 页 · 已核验
                    </span>
                  </div>
                </div>
                {!p.outline.length ? (
                  <button
                    className="primary wide"
                    disabled={!!busy || platform.kind === "local"}
                    onClick={() => void run((g) => g.outline())}
                  >
                    <Sparkles size={16} />
                    生成大纲与图表推荐
                  </button>
                ) : (
                  <>
                    <button
                      className="primary wide"
                      disabled={
                        !!busy ||
                        p.outline.length < 5 ||
                        p.outline.length > 20 ||
                        p.figures.some((f) => f.selected && !f.confirmed)
                      }
                      onClick={() => void run((g) => g.generate())}
                    >
                      生成 {p.outline.length} 页 PPT <ArrowRight size={16} />
                    </button>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => patch({ outline: [], generated: {} })}
                    >
                      调整要求并重新生成大纲
                    </button>
                  </>
                )}
                <small className="settings-foot">
                  每条论点关联论文来源。来源可追溯，不代表自动完成事实核验。
                </small>
              </aside>
              <section className="outline-content">
                <div className="section-heading">
                  <div>
                    <span className="section-index">THE OUTLINE</span>
                    <h2>先理清思路，再走上讲台</h2>
                  </div>
                  {p.outline.length > 0 && (
                    <button
                      className="secondary"
                      disabled={busy !== "" || p.outline.length >= 20}
                      onClick={() =>
                        patch({
                          outline: [
                            ...p.outline,
                            {
                              id: uid(),
                              title: "新的页面",
                              goal: "补充内容",
                              evidenceIds: [],
                              figureIds: [],
                              layout: "bullets",
                            },
                          ],
                          generated: {},
                        })
                      }
                    >
                      <Plus size={15} />
                      添加一页
                    </button>
                  )}
                </div>
                {!p.outline.length ? (
                  <div className="outline-empty">
                    <LayoutTemplate size={44} />
                    <h3>好汇报，从好大纲开始。</h3>
                    <p>
                      设置左侧要求，AI 会提炼正文证据，
                      <br />
                      并为核心论点推荐原论文图表。
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="outline-cards">
                      {p.outline.map((o, i) => (
                        <article className="outline-card" key={o.id}>
                          <div className="outline-no">
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div className="outline-body">
                            <input
                              aria-label={`第${i + 1}页标题`}
                              value={o.title}
                              onChange={(e) =>
                                editOutline(o.id, { title: e.target.value })
                              }
                            />
                            <textarea
                              aria-label={`第${i + 1}页目标`}
                              value={o.goal}
                              onChange={(e) =>
                                editOutline(o.id, { goal: e.target.value })
                              }
                            />
                            <div className="outline-source">
                              {[
                                ...new Set(
                                  p.evidence
                                    .filter((e) => o.evidenceIds.includes(e.id))
                                    .map((e) => e.page),
                                ),
                              ].map((n) => (
                                <button
                                  key={n}
                                  onClick={() => {
                                    setPdfPage(n);
                                    setCropping({
                                      id: uid(),
                                      label: "补充图表",
                                      caption: "",
                                      page: n,
                                      reason: "",
                                      bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.4 },
                                      located: false,
                                      selected: true,
                                      confirmed: false,
                                      slideId: o.id,
                                    });
                                  }}
                                >
                                  PDF p.{n}
                                </button>
                              ))}
                              <select
                                aria-label="页面版式"
                                value={o.layout}
                                onChange={(e) =>
                                  editOutline(o.id, {
                                    layout: e.target.value as any,
                                  })
                                }
                              >
                                <option value="title">封面</option>
                                <option value="bullets">要点</option>
                                <option value="split">图文并排</option>
                                <option value="figure">图表大图</option>
                              </select>
                            </div>
                          </div>
                          <div className="card-actions">
                            <button
                              title="上移"
                              disabled={i === 0 || !!busy}
                              onClick={() => moveOutline(i, -1)}
                            >
                              <ChevronUp size={15} />
                            </button>
                            <button
                              title="下移"
                              disabled={i === p.outline.length - 1 || !!busy}
                              onClick={() => moveOutline(i, 1)}
                            >
                              <ChevronDown size={15} />
                            </button>
                            <button
                              title="删除页面"
                              disabled={p.outline.length <= 5 || !!busy}
                              onClick={() =>
                                patch({
                                  outline: p.outline.filter(
                                    (x) => x.id !== o.id,
                                  ),
                                  figures: p.figures.map((f) =>
                                    f.slideId === o.id
                                      ? {
                                          ...f,
                                          slideId: undefined,
                                          selected: false,
                                          confirmed: false,
                                        }
                                      : f,
                                  ),
                                  generated: {},
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="section-heading figure-heading">
                      <div>
                        <span className="section-index">THE EVIDENCE</span>
                        <h2>让关键图表自己说话</h2>
                      </div>
                      <button
                        className="secondary"
                        disabled={!!busy || !pdf}
                        onClick={() => pdf && void run((g) => g.locate(pdf))}
                      >
                        <Sparkles size={15} />
                        AI 定位选中图表
                      </button>
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={manualFigure}
                      >
                        <Scissors size={15} />
                        手动补充
                      </button>
                    </div>
                    <p className="muted small">
                      勾选后请检查裁剪区域并确认。已确认的图表将保留原图，插入指定页面。
                    </p>
                    {p.figures.length ? (
                      <div className="figure-grid">
                        {p.figures.map((f) => (
                          <article
                            key={f.id}
                            className={
                              "figure-card " + (f.selected ? "selected" : "")
                            }
                          >
                            <div className="figure-top">
                              <label className="check-label">
                                <input
                                  type="checkbox"
                                  checked={f.selected}
                                  disabled={!!busy}
                                  onChange={(e) =>
                                    updateFigure(f.id, {
                                      selected: e.target.checked,
                                      slideId:
                                        f.slideId ||
                                        p.outline[1]?.id ||
                                        p.outline[0]?.id,
                                    })
                                  }
                                />
                                {f.label}
                              </label>
                              <span>PDF p.{f.page}</span>
                            </div>
                            <FigurePreview
                              platform={platform}
                              figure={f}
                              pdf={pdf}
                            />
                            <p className="figure-caption">{f.caption}</p>
                            <p className="figure-reason">{f.reason}</p>
                            {f.selected && (
                              <>
                                <select
                                  aria-label="图表对应页面"
                                  value={f.slideId || ""}
                                  onChange={(e) =>
                                    updateFigure(f.id, {
                                      slideId: e.target.value,
                                    })
                                  }
                                >
                                  {p.outline.map((o, i) => (
                                    <option key={o.id} value={o.id}>
                                      第{i + 1}页 · {o.title}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className={
                                    f.confirmed
                                      ? "confirmed-button"
                                      : "secondary wide"
                                  }
                                  onClick={() => setCropping(f)}
                                >
                                  {f.confirmed ? (
                                    <CheckCircle2 size={15} />
                                  ) : (
                                    <Scissors size={15} />
                                  )}{" "}
                                  {f.confirmed
                                    ? "已确认 · 重新裁剪"
                                    : f.located
                                      ? "检查 AI 裁剪并确认"
                                      : "框选图表并确认"}
                                </button>
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="notice">
                        未找到可自动推荐的图注。可手动补充图表，不能将此视为论文没有图表。
                      </div>
                    )}
                  </>
                )}
                {p.warnings.map((w, i) => (
                  <div className="notice" key={i}>
                    {w}
                  </div>
                ))}
              </section>
            </main>
          )}
          {p.stage === "editor" && (
            <main className="editor-layout">
              <aside className="slide-rail">
                <div className="rail-header">
                  <button
                    title="返回工作台"
                    disabled={!!busy}
                    onClick={() => void home()}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span>
                    幻灯片 <b>{p.slides.length}</b>
                  </span>
                  <button
                    title="新增幻灯片"
                    disabled={!!busy}
                    onClick={addSlide}
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <div className="slide-list">
                  {p.slides.map((s, i) => (
                    <SlideThumbnail
                      key={s.id}
                      index={i}
                      selected={i === selectedSlide}
                      onClick={() => selectSlide(i)}
                    />
                  ))}
                </div>
                <div className="rail-footer">
                  <button
                    title="上移页面"
                    onClick={() => moveSlide(-1)}
                    disabled={selectedSlide === 0 || !!busy}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    title="下移页面"
                    onClick={() => moveSlide(1)}
                    disabled={selectedSlide === p.slides.length - 1 || !!busy}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    title="复制页面"
                    disabled={!!busy}
                    onClick={() => {
                      editSlides((ss) => {
                        const s = structuredClone(ss[selectedSlide]);
                        s.id = uid();
                        s.elements.forEach((e) => (e.id = uid()));
                        ss.splice(selectedSlide + 1, 0, s);
                        return ss;
                      });
                      selectSlide(selectedSlide + 1);
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    title="删除页面"
                    disabled={p.slides.length <= 1 || !!busy}
                    onClick={() => {
                      editSlides((ss) =>
                        ss.filter((_, i) => i !== selectedSlide),
                      );
                      selectSlide(Math.max(0, selectedSlide - 1));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </aside>
              <section className="editor-main">
                <div className="editor-toolbar">
                  <div>
                    <button title="撤销" disabled={!past.length} onClick={undo}>
                      <Undo2 size={17} />
                    </button>
                    <button
                      title="重做"
                      disabled={!future.length}
                      onClick={redo}
                    >
                      <Redo2 size={17} />
                    </button>
                    <span className="toolbar-divider" />
                    <button onClick={() => addElement("text")}>
                      <Type size={17} />
                      文字
                    </button>
                    <button onClick={manualFigure}>
                      <ImagePlus size={17} />
                      论文图表
                    </button>
                    <button title="添加矩形" onClick={() => addElement("rect")}>
                      <Square size={17} />
                    </button>
                    <button title="添加线条" onClick={() => addElement("line")}>
                      <Minus size={17} />
                    </button>
                  </div>
                  <button onClick={switchTheme}>
                    {p.theme === "light" ? (
                      <Moon size={16} />
                    ) : (
                      <Sun size={16} />
                    )}
                    主题
                  </button>
                </div>
                <SlideCanvas platform={platform} />
                <div className="notes-panel">
                  <div>
                    <BookOpen size={14} />
                    <span>讲稿与来源</span>
                    <span className="notes-hint">不会出现在幻灯片正文中</span>
                  </div>
                  <textarea
                    aria-label="讲稿与来源"
                    value={slide?.notes || ""}
                    onChange={(e) =>
                      editSlides((ss) => {
                        ss[selectedSlide].notes = e.target.value;
                        return ss;
                      })
                    }
                  />
                </div>
                <div className="editor-status">
                  <span>
                    {selectedSlide + 1} / {p.slides.length} 页
                  </span>
                  <span>
                    {slide && slideIssues(slide).length
                      ? "⚠ " + slideIssues(slide).join("；")
                      : "内容可编辑 · 图表保留原始证据"}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (slide?.sources[0]) setPdfPage(slide.sources[0]);
                      setRightTab("paper");
                    }}
                  >
                    查看原论文 <ArrowUpRight size={12} />
                  </button>
                </div>
              </section>
              <aside className="inspector">
                <div className="inspector-tabs">
                  <button
                    className={rightTab === "properties" ? "active" : ""}
                    onClick={() => setRightTab("properties")}
                  >
                    <Settings2 size={15} />
                    属性
                  </button>
                  <button
                    className={rightTab === "paper" ? "active" : ""}
                    onClick={() => setRightTab("paper")}
                  >
                    <FileText size={15} />
                    论文
                  </button>
                </div>
                {rightTab === "paper" && pdf ? (
                  <>
                    <PdfPanel pdf={pdf} page={pdfPage} onPage={setPdfPage} />
                    <button
                      className="secondary inspector-crop"
                      onClick={manualFigure}
                    >
                      <Scissors size={15} />
                      框选本页图表
                    </button>
                  </>
                ) : (
                  <div className="properties">
                    {element ? (
                      <>
                        <span className="section-index">
                          ELEMENT PROPERTIES
                        </span>
                        <h3>
                          {
                            {
                              text: "文字",
                              image: "论文图表",
                              rect: "矩形",
                              line: "线条",
                            }[element.type]
                          }
                        </h3>
                        {element.type === "text" && (
                          <>
                            <label>
                              内容
                              <textarea
                                aria-label="元素文字"
                                className="element-text"
                                value={element.text || ""}
                                onChange={(e) =>
                                  elementPatch({ text: e.target.value })
                                }
                              />
                            </label>
                            <div className="field-row">
                              <label>
                                字号
                                <input
                                  type="number"
                                  min={8}
                                  max={180}
                                  value={element.fontSize || 28}
                                  onChange={(e) =>
                                    elementPatch({
                                      fontSize: Math.max(
                                        8,
                                        Number(e.target.value) || 8,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                对齐
                                <select
                                  value={element.align || "left"}
                                  onChange={(e) =>
                                    elementPatch({
                                      align: e.target.value as any,
                                    })
                                  }
                                >
                                  <option value="left">左对齐</option>
                                  <option value="center">居中</option>
                                  <option value="right">右对齐</option>
                                </select>
                              </label>
                            </div>
                            <button
                              className={
                                "secondary " + (element.bold ? "selected" : "")
                              }
                              onClick={() =>
                                elementPatch({ bold: !element.bold })
                              }
                            >
                              <b>B</b> 加粗
                            </button>
                          </>
                        )}
                        <div className="field-row">
                          <label>
                            颜色
                            <input
                              aria-label="元素颜色"
                              type="color"
                              value={element.color}
                              onChange={(e) =>
                                elementPatch({
                                  color: e.target.value,
                                  ...(element.type === "rect"
                                    ? { fill: e.target.value }
                                    : {}),
                                })
                              }
                            />
                          </label>
                          <label>
                            旋转
                            <input
                              type="number"
                              value={Math.round(element.rotation)}
                              onChange={(e) =>
                                elementPatch({
                                  rotation: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="property-grid">
                          {(["x", "y", "w", "h"] as const).map((k) => (
                            <label key={k}>
                              {
                                {
                                  x: "X 位置",
                                  y: "Y 位置",
                                  w: "宽度",
                                  h: "高度",
                                }[k]
                              }
                              <input
                                aria-label={k}
                                type="number"
                                value={Math.round(element[k])}
                                onChange={(e) =>
                                  elementPatch({
                                    [k]:
                                      k === "w" || k === "h"
                                        ? Math.max(1, Number(e.target.value))
                                        : Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <div className="property-actions">
                          <button
                            className="secondary"
                            onClick={() => layerElement(1)}
                          >
                            上移图层
                          </button>
                          <button
                            className="secondary"
                            onClick={() => layerElement(-1)}
                          >
                            下移图层
                          </button>
                          <button
                            className="secondary"
                            onClick={duplicateElement}
                          >
                            <Copy size={14} />
                            复制
                          </button>
                          <button
                            className="secondary danger"
                            onClick={deleteElement}
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                        {element.figureId && (
                          <div className="source-card">
                            <span>来自原论文</span>
                            {p.figures
                              .filter((f) => f.id === element.figureId)
                              .map((f) => (
                                <button
                                  key={f.id}
                                  onClick={() => {
                                    setPdfPage(f.page);
                                    setRightTab("paper");
                                  }}
                                >
                                  {f.label} · PDF p.{f.page}
                                  <ArrowUpRight size={13} />
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="section-index">MAKE IT YOURS</span>
                        <h3>让观点，有自己的位置。</h3>
                        <p className="muted">
                          点击画布元素以编辑。拖动调整位置，使用边框控制尺寸和旋转。
                        </p>
                        <div className="shortcut">
                          <span>撤销</span>
                          <kbd>⌘ Z</kbd>
                          <span>复制元素</span>
                          <kbd>⌘ D</kbd>
                          <span>微调</span>
                          <kbd>↑ ↓ ← →</kbd>
                          <span>快速移动</span>
                          <kbd>Shift + ↑</kbd>
                        </div>
                        <div className="source-card">
                          <span>本页来源</span>
                          {slide?.sources.map((n) => (
                            <button
                              key={n}
                              onClick={() => {
                                setPdfPage(n);
                                setRightTab("paper");
                              }}
                            >
                              PDF 第 {n} 页 <ArrowUpRight size={13} />
                            </button>
                          ))}
                        </div>
                        <button
                          className="secondary wide"
                          disabled={
                            !!busy ||
                            platform.kind === "local" ||
                            !p.outline.some((o) => o.id === slide?.id)
                          }
                          onClick={() =>
                            void run(async (g) => {
                              const next = await g.generate(slide!.id);
                              if (next) setPendingSlide(next);
                            })
                          }
                        >
                          <Sparkles size={15} />
                          重新生成此页
                        </button>
                        <small className="muted">
                          生成后可对比，确认前不会覆盖当前页面。
                        </small>
                      </>
                    )}
                    {p.warnings.map((w, i) => (
                      <div className="notice" key={i}>
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </main>
          )}
        </>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      {cropping && pdf && (
        <div className="modal-backdrop">
          <div className="crop-modal">
            <div className="modal-heading">
              <div>
                <span className="section-index">KEEP THE EVIDENCE INTACT</span>
                <h2>{cropping.label} · 核验裁剪</h2>
              </div>
              <button
                aria-label="关闭裁剪"
                disabled={cropBusy}
                onClick={() => setCropping(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              {cropping.caption ||
                "选择原论文中的图表区域。图像保持原样，不重绘数值。"}
            </p>
            <PdfPanel
              pdf={pdf}
              page={cropping.page}
              onPage={(n) =>
                setCropping({ ...cropping, page: n, confirmed: false })
              }
              box={cropping.bbox}
              onBox={(bbox) => setCropping({ ...cropping, bbox })}
              cropping
              onConfirm={() => !cropBusy && void confirmCrop()}
            />
            {cropBusy && (
              <div className="progress-bar">
                <Loader2 className="spin" size={16} />
                正在保存图表…
              </div>
            )}
          </div>
        </div>
      )}
      {usageOpen && (
        <div className="modal-backdrop">
          <div className="usage-modal">
            <div className="modal-heading">
              <h2>用量与工作空间</h2>
              <button onClick={() => setUsageOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              {platform.kind === "anna"
                ? "模型与项目文件由 Anna 提供。"
                : "当前数据仅保存在本机浏览器，不代表云端保存。"}
            </p>
            <div className="usage-total">
              {totalCu.toFixed(3)} <span>CU / 当前项目</span>
            </div>
            <p className="muted small">
              此处显示接口返回的实际扣费，未报告扣费的调用无法纳入统计。不代表账号余额。
            </p>
            <div className="usage-list">
              {p?.usage.map((u, i) => (
                <div key={i}>
                  <strong>{u.purpose}</strong>
                  <span>
                    {u.model} · {u.inputTokens + u.outputTokens} tokens
                  </span>
                  <b>{u.cu.toFixed(3)} CU</b>
                </div>
              ))}
            </div>
            <button
              className="secondary"
              onClick={() => {
                const blob = new Blob(
                  [JSON.stringify(p?.usage || [], null, 2)],
                  { type: "application/json" },
                );
                void platform
                  .upload(`projects/${p?.id || "workspace"}/usage.json`, blob)
                  .then(() =>
                    platform.download(
                      `projects/${p?.id || "workspace"}/usage.json`,
                      "usage.json",
                    ),
                  )
                  .catch((e) => setError(message(e)));
              }}
            >
              下载用量记录
            </button>
          </div>
        </div>
      )}
      {pendingSlide && (
        <div className="modal-backdrop">
          <div className="dialog">
            <h2>新版本已生成</h2>
            <p>当前页保持不变。采用新版本会替换这一页的内容与布局，可撤销。</p>
            <h3>{pendingSlide.title}</h3>
            <p className="regeneration-preview">
              {pendingSlide.elements
                .filter((e) => e.type === "text")
                .map((e) => e.text)
                .join("\n\n")}
            </p>
            <div className="dialog-actions">
              <button
                className="secondary"
                onClick={() => setPendingSlide(null)}
              >
                保留原页
              </button>
              <button
                className="primary"
                onClick={() => {
                  editSlides((ss) =>
                    ss.map((s) =>
                      s.id === pendingSlide.id ? pendingSlide : s,
                    ),
                  );
                  setPendingSlide(null);
                }}
              >
                采用新版本
              </button>
            </div>
          </div>
        </div>
      )}
      {exportIssues && (
        <div className="modal-backdrop">
          <div className="dialog">
            <h2>导出前检查</h2>
            <p>发现以下布局问题，建议回到画布调整：</p>
            <ul>
              {exportIssues.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button
                className="secondary"
                onClick={() => setExportIssues(null)}
              >
                返回调整
              </button>
              <button className="primary" onClick={() => void doExport(true)}>
                仍然导出
              </button>
            </div>
          </div>
        </div>
      )}
      {downloadReady && (
        <div className="modal-backdrop">
          <div className="dialog">
            <h2>准备好了，带去分享吧。</h2>
            <p>
              演示文稿已生成并保存在项目中。如果浏览器没有自动开始下载，点击下方按钮保存文件。
            </p>
            <div className="dialog-actions">
              <button
                className="secondary"
                onClick={() => setDownloadReady(null)}
              >
                完成
              </button>
              <button
                className="primary"
                onClick={() => {
                  saveBlob(downloadReady.blob, downloadReady.filename);
                  setDownloadReady(null);
                }}
              >
                <Download size={15} />
                保存 PPTX 文件
              </button>
            </div>
          </div>
        </div>
      )}
      {recovery && (
        <div className="modal-backdrop">
          <div className="dialog">
            <h2>找到尚未同步的本机修改</h2>
            <p>
              云端版本已经打开。可以恢复本机内容后继续保存，或保留云端版本。
            </p>
            <div className="dialog-actions">
              <button
                className="secondary"
                onClick={() => {
                  void recoveryDelete(recovery.id);
                  setRecovery(null);
                }}
              >
                保留云端
              </button>
              <button
                className="primary"
                onClick={() => {
                  setProject({
                    ...recovery,
                    revision: recovery.revision + 1,
                    updatedAt: new Date().toISOString(),
                  });
                  setRecovery(null);
                }}
              >
                恢复本机修改
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteId && (
        <div className="modal-backdrop">
          <div className="dialog">
            <h2>删除这个研究项目？</h2>
            <p>
              将删除该项目的
              PDF、图表、快照和导出文件。平台存储使用软删除，但本应用不提供撤销入口。
            </p>
            <div className="dialog-actions">
              <button className="secondary" onClick={() => setDeleteId(null)}>
                取消
              </button>
              <button
                className="primary danger"
                onClick={() =>
                  void (async () => {
                    setBusy("删除项目文件");
                    try {
                      await repo.remove(deleteId);
                      setDeleteId(null);
                      await refresh();
                    } catch (e) {
                      setError(message(e));
                    } finally {
                      setBusy("");
                    }
                  })()
                }
              >
                删除项目
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function FigurePreview({
  platform,
  figure,
  pdf,
}: {
  platform: Platform;
  figure: FigureCandidate;
  pdf: PDF | null;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true,
      src = "";
    const preview = figure.assetPath
      ? platform.blob(figure.assetPath)
      : pdf && figure.selected
        ? cropFigure(pdf, figure.page, figure.bbox)
        : null;
    if (preview)
      preview
        .then((b) => {
          src = URL.createObjectURL(b);
          if (active) setUrl(src);
        })
        .catch(() => setUrl(""));
    return () => {
      active = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [
    figure.assetPath,
    figure.page,
    figure.selected,
    figure.bbox.x,
    figure.bbox.y,
    figure.bbox.w,
    figure.bbox.h,
    pdf,
    platform,
  ]);
  return (
    <div className="figure-preview">
      {url ? (
        <img src={url} alt={figure.label} />
      ) : (
        <>
          <FileText size={28} />
          <span>
            {figure.located
              ? "AI 已定位 · 等待裁剪核验"
              : "原论文图表 · 待框选确认"}
          </span>
        </>
      )}
    </div>
  );
}
