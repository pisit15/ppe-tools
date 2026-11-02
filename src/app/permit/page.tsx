import { Suspense } from "react";
import localFont from "next/font/local";
import PermitApp from "@/components/permit/PermitApp";
import "./permit.css";
import "./permit-workspace.css";
import "./permit-detail.css";
const permitFont = localFont({ src: "../../../public/fonts/NotoSansThai.ttf", variable: "--font-permit", display: "swap", weight: "100 900" });
export default function PermitPage() {
  return (
    <div className={permitFont.variable} lang="th">
      <Suspense fallback={<div className="wp-loading" role="status"><span className="wp-loading-symbol" />กำลังเปิด Work Permit…</div>}>
        <PermitApp />
      </Suspense>
    </div>
  );
}
