"use client";
import { useEffect, useRef, useState } from "react";
import type { ChemCompanySettings, ChemSubstance } from "@/lib/types";
import {
  posterDraft,
  templateSnapshot,
  type PosterSnapshot,
  type PosterHistory,
  type PosterVersion,
  type PosterTemplate,
} from "./poster";
export async function posterRead<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
  return b;
}
export function usePosterVersions(
  substance: ChemSubstance,
  history: PosterHistory,
  templates: PosterTemplate[],
  settings: ChemCompanySettings | null,
) {
  const url = `/api/chemical/substances/${substance.id}`;
  const defaultTemplate =
    templates.find((t) => t.config.layout === "summary") || templates[0];
  const initial = history.latest?.snapshot || {
    schema: 1 as const,
    template: templateSnapshot(defaultTemplate),
    draft: posterDraft(substance, defaultTemplate, settings),
    fontSize: 9,
  };
  const [snapshot, setSnapshot] = useState<PosterSnapshot>(initial),
    [source, setSource] = useState(substance);
  const [title, setTitle] = useState(history.latest?.title || ""),
    [selected, setSelected] = useState<PosterVersion | null>(history.latest);
  const [versions, setVersions] = useState(history.versions),
    [hasMore, setHasMore] = useState(history.hasMore);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const fingerprint = JSON.stringify({ snapshot, title: title.trim() });
  const [baseline, setBaseline] = useState(fingerprint);
  const dirty = fingerprint !== baseline;
  const lock = useRef(false),
    attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function discardOK() {
    return (
      !dirty ||
      window.confirm(
        "มีข้อความที่ยังไม่บันทึก ต้องการละทิ้งการแก้ไขนี้หรือไม่?",
      )
    );
  }
  async function perform(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function apply(
    v: PosterVersion | null,
    next: PosterSnapshot,
    fresh: ChemSubstance,
  ) {
    setSnapshot(next);
    setTitle(v?.title || "");
    setSelected(v);
    setSource(fresh);
    setBaseline(JSON.stringify({ snapshot: next, title: v?.title || "" }));
    attempt.current = null;
  }
  function save() {
    return perform(async () => {
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, id: crypto.randomUUID() };
      const { data } = await posterRead<{ data: PosterVersion }>(
        `${url}/posters`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot,
            title,
            request_id: attempt.current.id,
            base_version: selected?.version,
          }),
        },
      );
      setVersions((list) =>
        [data, ...list.filter((v) => v.id !== data.id)].sort(
          (a, b) => b.version - a.version,
        ),
      );
      apply(data, data.snapshot, source);
      setMessage(
        `บันทึก Rev${data.version} แล้ว เปิดครั้งถัดไปจะใช้ Rev ล่าสุด`,
      );
    });
  }
  function choose(version: number) {
    if (!discardOK()) return;
    return perform(async () => {
      const [{ data }, { data: fresh }] = await Promise.all([
        posterRead<{ data: PosterVersion }>(
          `${url}/posters?version=${version}`,
        ),
        posterRead<{ data: ChemSubstance }>(url),
      ]);
      apply(data, data.snapshot, fresh);
      setMessage(`เปิด Rev${version} แล้ว แก้ไขและบันทึกเป็น Rev ใหม่ได้`);
    });
  }
  function chooseTemplate(t: PosterTemplate) {
    setSnapshot((s) => ({
      ...s,
      template: templateSnapshot(t),
      draft: {
        ...s.draft,
        company:
          s.draft.company === s.template.config.subtitle ||
          s.draft.company === source.company_id.toUpperCase()
            ? t.config.subtitle || source.company_id.toUpperCase()
            : s.draft.company,
        formCode:
          s.draft.formCode === s.template.config.formCode
            ? t.config.formCode
            : s.draft.formCode,
        formRevision:
          s.draft.formRevision === s.template.config.formRevision
            ? t.config.formRevision
            : s.draft.formRevision,
      },
    }));
    setMessage(
      "เปลี่ยนแม่แบบแล้ว ข้อความที่กรอกยังอยู่ กดบันทึกเพื่อเก็บเป็น Rev ใหม่",
    );
  }
  function reset() {
    if (
      !window.confirm(
        "เริ่มใหม่จากทะเบียนล่าสุดในแม่แบบที่เลือก? ข้อความที่ยังไม่บันทึกจะถูกแทนที่ แต่ทุก Rev ที่บันทึกไว้ยังอยู่",
      )
    )
      return;
    return perform(async () => {
      const [{ data: fresh }, { data: cfg }] = await Promise.all([
        posterRead<{ data: ChemSubstance }>(url),
        posterRead<{ data: ChemCompanySettings }>(
          `/api/chemical/settings?company_id=${source.company_id}`,
        ),
      ]);
      const next = {
        ...snapshot,
        draft: posterDraft(fresh, snapshot.template, cfg),
      };
      apply(selected, next, fresh);
      setBaseline("");
      setMessage(
        "ดึงข้อมูลทะเบียนล่าสุดแล้ว กดบันทึกเป็น Rev ใหม่เพื่อเก็บแบบนี้",
      );
    });
  }
  function loadMore() {
    return perform(async () => {
      const older = await posterRead<PosterHistory>(
        `${url}/posters?before=${versions[versions.length - 1].version}`,
      );
      setVersions((list) => [
        ...list,
        ...older.versions.filter((v) => !list.some((i) => i.id === v.id)),
      ]);
      setHasMore(older.hasMore);
    });
  }
  return {
    snapshot,
    setSnapshot,
    source,
    title,
    setTitle,
    selected,
    versions,
    hasMore,
    pending,
    error,
    message,
    dirty,
    save,
    choose,
    chooseTemplate,
    reset,
    loadMore,
    discardOK,
  };
}
