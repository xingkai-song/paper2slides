export type StageName = "range" | "outline" | "editor";
export type Theme = "light" | "dark";
export interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PaperPage {
  number: number;
  width: number;
  height: number;
  text: string;
  blocks: TextBlock[];
  warning?: string;
}
export interface BodyRange {
  start: number;
  end: number;
  reason: string;
  uncertain: boolean;
  startEvidence: string;
  endEvidence: string;
  confirmed: boolean;
  aiStart: number;
  aiEnd: number;
  reviewNote?: string;
}
export interface Evidence {
  id: string;
  page: number;
  quote: string;
  claim: string;
  kind: "paper" | "discussion";
}
export interface FigureCandidate {
  id: string;
  label: string;
  caption: string;
  page: number;
  reason: string;
  bbox: { x: number; y: number; w: number; h: number };
  located: boolean;
  confirmed: boolean;
  selected: boolean;
  assetPath?: string;
  aspect?: number;
  slideId?: string;
}
export interface OutlineSlide {
  id: string;
  title: string;
  goal: string;
  evidenceIds: string[];
  figureIds: string[];
  layout: "title" | "bullets" | "figure" | "split";
}
export interface SlideElement {
  id: string;
  type: "text" | "image" | "rect" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text?: string;
  fontSize?: number;
  bold?: boolean;
  color: string;
  fill?: string;
  align?: "left" | "center" | "right";
  assetPath?: string;
  themeRole?: "text" | "muted" | "accent" | "surface";
  figureId?: string;
}
export interface Slide {
  id: string;
  title: string;
  elements: SlideElement[];
  notes: string;
  sources: number[];
  figureIds: string[];
}
export interface Usage {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cu: number;
  latencyMs: number;
  at: string;
}
export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  stage: StageName;
  pdfPath: string;
  pdfName: string;
  pdfHash: string;
  pages: PaperPage[];
  range?: BodyRange;
  settings: {
    scene: string;
    minutes: number;
    language: "中文" | "English";
    slideCount: number;
    extra: string;
  };
  evidence: Evidence[];
  chunks: Record<string, Evidence[]>;
  figures: FigureCandidate[];
  outline: OutlineSlide[];
  slides: Slide[];
  generated: Record<string, Slide>;
  theme: Theme;
  usage: Usage[];
  warnings: string[];
  exported?: { revision: number; path: string };
  previousSnapshot?: string;
}
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  stage: StageName;
  pageCount: number;
  slideCount: number;
  cu: number;
  etag?: string;
  path: string;
  previousPath?: string;
}
export interface CompletionRequest {
  purpose: string;
  system: string;
  prompt: string;
  maxTokens: number;
  images?: string[];
}
export interface Platform {
  kind: "anna" | "local";
  complete(req: CompletionRequest): Promise<{ text: string; usage: Usage }>;
  get(key: string): Promise<{ exists: boolean; value: unknown; etag?: string }>;
  set(key: string, value: unknown, etag?: string): Promise<{ etag?: string }>;
  list(prefix: string): Promise<{ key: string }[]>;
  remove(key: string, etag?: string): Promise<void>;
  upload(path: string, blob: Blob): Promise<void>;
  blob(path: string): Promise<Blob>;
  download(path: string, filename: string): Promise<void>;
  listFiles(prefix: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
}
export const uid = () => crypto.randomUUID();
export const themes = {
  light: {
    bg: "#ffffff",
    text: "#172f29",
    muted: "#78857c",
    accent: "#3e705d",
    surface: "#edf2ed",
  },
  dark: {
    bg: "#182d27",
    text: "#f5f5ed",
    muted: "#b3c1b5",
    accent: "#b5d7a4",
    surface: "#29463b",
  },
};
