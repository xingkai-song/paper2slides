import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Scissors,
  Check,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { renderPage, type PDF, validBox } from "../lib/pdf";
type Box = { x: number; y: number; w: number; h: number };
export function PdfPanel({
  pdf,
  page,
  onPage,
  box,
  onBox,
  onConfirm,
  cropping = false,
}: {
  pdf: PDF;
  page: number;
  onPage: (n: number) => void;
  box?: Box;
  onBox?: (b: Box) => void;
  onConfirm?: () => void;
  cropping?: boolean;
}) {
  const [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setError("");
    setImage("");
    renderPage(pdf, page, 1400)
      .then((c) => {
        if (active) setImage(c.toDataURL("image/png"));
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [pdf, page]);
  function point(e: React.PointerEvent) {
    const r = area.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  return (
    <div className="pdf-panel">
      <div className="pdf-toolbar">
        <div>
          <button
            title="上一页"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <input
            aria-label="PDF页码"
            type="number"
            min={1}
            max={pdf.numPages}
            value={page}
            onChange={(e) =>
              onPage(
                Math.max(
                  1,
                  Math.min(pdf.numPages, Number(e.target.value) || 1),
                ),
              )
            }
          />
          <span>/ {pdf.numPages}</span>
          <button
            title="下一页"
            disabled={page >= pdf.numPages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div>
          <button
            title="缩小"
            onClick={() => setZoom(Math.max(0.65, zoom - 0.15))}
          >
            <ZoomOut size={16} />
          </button>
          <button
            title="放大"
            onClick={() => setZoom(Math.min(2, zoom + 0.15))}
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
      {cropping && (
        <div className="crop-hint">
          <Scissors size={14} /> 在页面拖动，框选完整图表与图例
        </div>
      )}
      <div className="pdf-scroll">
        <div
          ref={area}
          className={"pdf-page " + (cropping ? "cropping" : "")}
          style={{ width: zoom * 100 + "%" }}
          onPointerDown={(e) => {
            if (!cropping || !image) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = point(e);
          }}
          onPointerMove={(e) => {
            if (!drag.current || !onBox) return;
            const p = point(e),
              a = drag.current;
            onBox({
              x: Math.min(a.x, p.x),
              y: Math.min(a.y, p.y),
              w: Math.abs(p.x - a.x),
              h: Math.abs(p.y - a.y),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {image ? (
            <img src={image} alt={`论文 PDF 第 ${page} 页`} draggable={false} />
          ) : (
            <div className="placeholder">{error || "正在渲染论文页面…"}</div>
          )}
          {cropping && box && (
            <div
              className="crop-box"
              style={{
                left: box.x * 100 + "%",
                top: box.y * 100 + "%",
                width: box.w * 100 + "%",
                height: box.h * 100 + "%",
              }}
            >
              <span>选定区域</span>
            </div>
          )}
        </div>
      </div>
      {cropping && (
        <div className="crop-actions">
          <span>请保留坐标轴、图例与子图标签</span>
          <button
            className="primary"
            disabled={!box || !validBox(box)}
            onClick={onConfirm}
          >
            <Check size={16} />
            确认裁剪并插入
          </button>
        </div>
      )}
    </div>
  );
}
