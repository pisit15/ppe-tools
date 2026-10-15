"use client";
import { useRef, useState } from "react";
export default function SignatureInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [error, setError] = useState("");
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget,
      r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ];
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 2_000_000
    ) {
      setError("เลือกภาพ PNG หรือ JPG ไม่เกิน 2 MB");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 180;
      const ctx = c.getContext("2d")!;
      const ratio = Math.min(600 / img.width, 180 / img.height);
      ctx.drawImage(
        img,
        (600 - img.width * ratio) / 2,
        (180 - img.height * ratio) / 2,
        img.width * ratio,
        img.height * ratio,
      );
      const data = c.toDataURL("image/png");
      if (data.length > 150000)
        throw new Error("ภาพซับซ้อนเกินไป กรุณาตัดเฉพาะลายเซ็น");
      onChange(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านภาพไม่สำเร็จ");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return (
    <div className="wp-sign-input">
      <label>
        อัปโหลดภาพลายเซ็นของคุณ
        <input
          aria-label="ภาพลายเซ็น"
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      <p className="wp-muted">หรือเขียนลายเซ็นในช่องด้านล่าง</p>
      <canvas
        ref={canvas}
        width={600}
        height={180}
        aria-label="พื้นที่วาดลายเซ็น"
        onPointerDown={(e) => {
          const c = e.currentTarget,
            ctx = c.getContext("2d")!;
          c.setPointerCapture(e.pointerId);
          drawing.current = true;
          ctx.beginPath();
          const [x, y] = point(e);
          ctx.moveTo(x, y);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#15294b";
          ctx.lineCap = "round";
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = point(e);
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          onChange(e.currentTarget.toDataURL("image/png"));
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <button
        type="button"
        className="wp-link"
        onClick={() => {
          canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 180);
          onChange("");
        }}
      >
        ล้างลายเซ็น
      </button>
      {value && (
        <img
          className="wp-sign-preview"
          src={value}
          alt="ตัวอย่างลายเซ็นที่จะประทับ"
        />
      )}
      {error && (
        <p role="alert" className="wp-error">
          {error}
        </p>
      )}
    </div>
  );
}
