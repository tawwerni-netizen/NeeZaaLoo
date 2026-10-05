"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./ImageCropperModal.module.css";

type Props = {
  imageSrc: string;
  onCropComplete: (base64: string) => Promise<void>;
  onCancel: () => void;
};

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 512;

export function ImageCropperModal({ imageSrc, onCropComplete, onCancel }: Props) {
  const { locale } = useI18n();
  const isAr = locale === "ar";

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load image dimensions to center appropriately
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      // Determine initial zoom so the image covers the viewport
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const initialScale = Math.max(1, (VIEWPORT_SIZE * 1.1) / minDim);
      setZoom(Number(initialScale.toFixed(2)));
    };
    img.src = imageSrc;
    imgRef.current = img;
  }, [imageSrc]);

  // Handle pointer drag (mouse & touch)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    offsetStartRef.current = { ...offset };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: offsetStartRef.current.x + dx,
      y: offsetStartRef.current.y + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignored if capture already lost
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setZoom((prev) => Math.min(4, Math.max(0.6, Number((prev + delta).toFixed(2)))));
  };

  // Rotate 90 degrees
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Reset to initial
  const handleReset = () => {
    if (!naturalSize) return;
    const minDim = Math.min(naturalSize.width, naturalSize.height);
    const initialScale = Math.max(1, (VIEWPORT_SIZE * 1.1) / minDim);
    setZoom(Number(initialScale.toFixed(2)));
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  };

  // Export cropped image via Canvas
  const handleSave = async () => {
    if (!imgRef.current || !naturalSize) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // Fill with smooth background
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Ratio between canvas export and preview viewport
      const scaleToCanvas = OUTPUT_SIZE / VIEWPORT_SIZE;

      // Translate to canvas center
      ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      // Total scale applied
      const totalScale = zoom * scaleToCanvas;
      ctx.scale(totalScale, totalScale);

      // Account for offset (in canvas coordinates, inverted rotation)
      const rad = (-rotation * Math.PI) / 180;
      const unrotatedOffsetX = offset.x * Math.cos(rad) - offset.y * Math.sin(rad);
      const unrotatedOffsetY = offset.x * Math.sin(rad) + offset.y * Math.cos(rad);

      const drawX = (unrotatedOffsetX * scaleToCanvas) / totalScale - naturalSize.width / 2;
      const drawY = (unrotatedOffsetY * scaleToCanvas) / totalScale - naturalSize.height / 2;

      ctx.drawImage(imgRef.current, drawX, drawY);

      // Export as JPEG with optimal quality (~100KB-180KB, perfect for avatar storage)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const base64 = dataUrl.split(",")[1] ?? "";

      await onCropComplete(base64);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal} dir={isAr ? "rtl" : "ltr"}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isAr ? "تعديل وقص صورة الملف الشخصي" : "Crop Profile Picture"}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onCancel}
            disabled={saving}
            aria-label={isAr ? "إغلاق" : "Close"}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* Viewport */}
          <div
            ref={containerRef}
            className={styles.viewportContainer}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            {/* The circular crop guide mask */}
            <div className={styles.maskHole} />

            {/* Rendered Image with pan, zoom, rotation */}
            <img
              src={imageSrc}
              alt="Avatar Crop Preview"
              className={styles.imageLayer}
              style={{
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                maxWidth: "none",
                maxHeight: "none",
              }}
              draggable={false}
            />
          </div>

          {/* Controls */}
          <div className={styles.controlsRow}>
            {/* Zoom Slider */}
            <div className={styles.sliderGroup}>
              <span className={styles.sliderIcon} title={isAr ? "تصغير" : "Zoom out"}>🔍-</span>
              <input
                type="range"
                min="0.6"
                max="3.5"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className={styles.zoomSlider}
                aria-label={isAr ? "مستوى التكبير" : "Zoom level"}
              />
              <span className={styles.sliderIcon} title={isAr ? "تكبير" : "Zoom in"}>🔍+</span>
            </div>

            {/* Utility Buttons */}
            <div className={styles.actionsRow}>
              <button type="button" className={styles.toolBtn} onClick={handleRotate} title={isAr ? "تدوير 90 درجة" : "Rotate 90°"}>
                🔄 {isAr ? "تدوير" : "Rotate"}
              </button>
              <button type="button" className={styles.toolBtn} onClick={handleReset} title={isAr ? "إعادة ضبط" : "Reset"}>
                ⚡ {isAr ? "إعادة ضبط" : "Reset"}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={saving}>
            {isAr ? "إلغاء" : "Cancel"}
          </button>
          <button type="button" className={styles.saveBtn} onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <>
                <span className={styles.spinner} />
                {isAr ? "جارِ الحفظ والرفع..." : "Saving..."}
              </>
            ) : (
              <>✓ {isAr ? "قص وحفظ الصورة" : "Save & Upload"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
