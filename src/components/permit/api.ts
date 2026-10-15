export async function permitApi<T = Record<string, unknown>>(
  resource: string,
  company: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(
    `/api/permit/${resource}?company_id=${encodeURIComponent(company)}`,
    {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "ดำเนินการไม่สำเร็จ");
  return d as T;
}
export const dateTime = (v: string) =>
  new Date(v).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
export const localTime = (v: string) => {
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export type DirectoryEntry = {
  actor_key: string;
  display_name: string;
  role: string;
};
