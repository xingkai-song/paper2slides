import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Image as KImage,
  Line,
  Transformer,
} from "react-konva";
import Konva from "konva";
import { useApp } from "../store";
import { themes, type Platform, type SlideElement } from "../types";
export function SlideCanvas({ platform }: { platform: Platform }) {
  const {
    project: p,
    selectedSlide: index,
    selectedElement,
    selectElement,
    editSlides,
  } = useApp();
  const s = p?.slides[index];
  const wrapper = useRef<HTMLDivElement>(null),
    tr = useRef<Konva.Transformer>(null),
    layer = useRef<Konva.Layer>(null);
  const [scale, setScale] = useState(0.6),
    [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  useEffect(() => {
    const ob = new ResizeObserver(([e]) =>
      setScale(
        Math.max(
          0.15,
          Math.min(
            (e.contentRect.width - 48) / 1280,
            (e.contentRect.height - 48) / 720,
          ),
        ),
      ),
    );
    if (wrapper.current) ob.observe(wrapper.current);
    return () => ob.disconnect();
  }, []);
  const paths =
    s?.elements
      .filter((e) => e.type === "image" && e.assetPath)
      .map((e) => e.assetPath!)
      .join("|") || "";
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const next: Record<string, HTMLImageElement> = {};
    Promise.all(
      paths
        .split("|")
        .filter(Boolean)
        .map(async (path) => {
          const url = URL.createObjectURL(await platform.blob(path));
          urls.push(url);
          const img = new window.Image();
          img.src = url;
          await img.decode();
          next[path] = img;
        }),
    )
      .then(() => {
        if (active) setImages(next);
      })
      .catch(() => {
        if (active) setImages({});
      });
    return () => {
      active = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [paths, platform]);
  useEffect(() => {
    if (!tr.current) return;
    const node = layer.current?.findOne("#el-" + selectedElement);
    tr.current.nodes(node ? [node] : []);
    tr.current.getLayer()?.batchDraw();
  }, [selectedElement, s]);
  function change(id: string, v: Partial<SlideElement>) {
    editSlides((slides) => {
      slides[index].elements = slides[index].elements.map((e) =>
        e.id === id ? { ...e, ...v } : e,
      );
      return slides;
    });
  }
  function common(e: SlideElement) {
    return {
      id: "el-" + e.id,
      x: e.x,
      y: e.y,
      width: e.w,
      height: e.h,
      rotation: e.rotation,
      draggable: true,
      onClick: () => selectElement(e.id),
      onTap: () => selectElement(e.id),
      onDragEnd: (ev: any) =>
        change(e.id, { x: ev.target.x(), y: ev.target.y() }),
      onTransformEnd: (ev: any) => {
        const n = ev.target;
        const w = Math.max(20, e.w * n.scaleX()),
          h = Math.max(8, e.h * n.scaleY());
        n.scaleX(1);
        n.scaleY(1);
        change(e.id, { x: n.x(), y: n.y(), w, h, rotation: n.rotation() });
      },
    };
  }
  return (
    <div ref={wrapper} className="canvas-workspace">
      {s && p ? (
        <div
          className="canvas-paper"
          style={{ width: 1280 * scale, height: 720 * scale }}
        >
          <Stage
            width={1280 * scale}
            height={720 * scale}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={(e) => {
              if (
                e.target === e.target.getStage() ||
                e.target.id() === "background"
              )
                selectElement(null);
            }}
          >
            <Layer ref={layer}>
              <Rect
                id="background"
                width={1280}
                height={720}
                fill={themes[p.theme].bg}
              />
              {s.elements.map((e) =>
                e.type === "text" ? (
                  <Text
                    key={e.id}
                    {...common(e)}
                    text={e.text}
                    fill={e.color}
                    fontFamily="Arial, Microsoft YaHei, sans-serif"
                    fontSize={e.fontSize || 28}
                    fontStyle={e.bold ? "bold" : "normal"}
                    align={e.align}
                    lineHeight={1.25}
                    wrap="word"
                  />
                ) : e.type === "image" ? (
                  <KImage
                    key={e.id}
                    {...common(e)}
                    image={images[e.assetPath || ""]}
                  />
                ) : e.type === "line" ? (
                  <Line
                    key={e.id}
                    {...common(e)}
                    points={[0, 0, e.w, e.h]}
                    stroke={e.color}
                    strokeWidth={3}
                    hitStrokeWidth={16}
                  />
                ) : (
                  <Rect key={e.id} {...common(e)} fill={e.fill || e.color} />
                ),
              )}
              <Transformer
                ref={tr}
                flipEnabled={false}
                rotateEnabled
                enabledAnchors={[
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                  "middle-left",
                  "middle-right",
                ]}
                boundBoxFunc={(old, next) =>
                  Math.abs(next.width) < 20 || Math.abs(next.height) < 8
                    ? old
                    : next
                }
              />
            </Layer>
          </Stage>
        </div>
      ) : (
        <div className="empty-state">还没有幻灯片</div>
      )}
      <span className="canvas-scale">{Math.round(scale * 100)}% · 16:9</span>
    </div>
  );
}
export function SlideThumbnail({
  index,
  selected,
  onClick,
}: {
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const p = useApp((s) => s.project)!;
  const slide = p.slides[index],
    t = themes[p.theme];
  return (
    <button
      className={"slide-thumb " + (selected ? "active" : "")}
      onClick={onClick}
    >
      <span className="thumb-number">{String(index + 1).padStart(2, "0")}</span>
      <div className="thumb-paper" style={{ background: t.bg, color: t.text }}>
        <div className="thumb-title">{slide.title}</div>
        {slide.elements.some((e) => e.type === "image") ? (
          <div className="thumb-figure">▧</div>
        ) : (
          <div className="thumb-lines">
            <i />
            <i />
            <i />
          </div>
        )}
        <small>Paper2Slides</small>
      </div>
    </button>
  );
}
