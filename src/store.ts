import { create } from "zustand";
import type { Project, Slide, Theme } from "./types";
import { recoveryPut } from "./lib/platform";
interface Snapshot {
  slides: Slide[];
  theme: Theme;
}
interface State {
  project: Project | null;
  selectedSlide: number;
  selectedElement: string | null;
  past: Snapshot[];
  future: Snapshot[];
  setProject: (p: Project | null) => void;
  patch: (v: Partial<Project>) => void;
  editSlides: (f: (s: Slide[]) => Slide[]) => void;
  selectSlide: (n: number) => void;
  selectElement: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
}
export const useApp = create<State>((set, get) => ({
  project: null,
  selectedSlide: 0,
  selectedElement: null,
  past: [],
  future: [],
  setProject: (p) =>
    set({
      project: p,
      selectedSlide: 0,
      selectedElement: null,
      past: [],
      future: [],
    }),
  patch: (v) => {
    const p = get().project;
    if (!p) return;
    const next = {
      ...p,
      ...v,
      revision: p.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    set({ project: next });
    void recoveryPut(p.id, next);
  },
  editSlides: (f) => {
    const p = get().project;
    if (!p) return;
    set({
      past: [...get().past, { slides: p.slides, theme: p.theme }].slice(-50),
      future: [],
    });
    get().patch({ slides: f(structuredClone(p.slides)), exported: undefined });
  },
  selectSlide: (n) => set({ selectedSlide: n, selectedElement: null }),
  selectElement: (id) => set({ selectedElement: id }),
  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    set({
      past: past.slice(0, -1),
      future: [{ slides: project.slides, theme: project.theme }, ...future],
    });
    get().patch({ ...past[past.length - 1], exported: undefined });
    set({
      selectedSlide: Math.min(
        get().selectedSlide,
        get().project!.slides.length - 1,
      ),
      selectedElement: get().project!.slides[
        get().selectedSlide
      ]?.elements.some((e) => e.id === get().selectedElement)
        ? get().selectedElement
        : null,
    });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    set({
      past: [...past, { slides: project.slides, theme: project.theme }].slice(
        -50,
      ),
      future: future.slice(1),
    });
    get().patch({ ...future[0], exported: undefined });
    set({
      selectedSlide: Math.min(
        get().selectedSlide,
        get().project!.slides.length - 1,
      ),
      selectedElement: get().project!.slides[
        get().selectedSlide
      ]?.elements.some((e) => e.id === get().selectedElement)
        ? get().selectedElement
        : null,
    });
  },
}));
