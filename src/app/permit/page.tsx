import { Suspense } from "react";
import PermitApp from "@/components/permit/PermitApp";
import "./permit.css";
export default function PermitPage() {
  return (
    <Suspense fallback={<p>กำลังโหลด Work Permit…</p>}>
      <PermitApp />
    </Suspense>
  );
}
