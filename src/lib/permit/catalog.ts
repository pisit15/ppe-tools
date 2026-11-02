import type { Permit } from "./types";
import { PERMIT_SEEDS } from "./legacy-catalog";
import { AMT_V2_SEEDS } from "./amt-forms";
export { PERMIT_SEEDS } from "./legacy-catalog";
function stable(v: unknown): string {
 return JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
}
export function supportsOriginalPdf(p: Permit): boolean {
 return p.company_id === "amt" && p.data.forms.length>0 && p.data.forms.every(f=>{
  const seed=PERMIT_SEEDS.find(s=>s.source_code===f.template.source_code);
  if(!seed||seed.revision!==f.template.revision)return false;
  if(!f.template.config.layoutVersion)return !f.template.config.fields.some(x=>x.print);
  const reviewed=AMT_V2_SEEDS.find(t=>t.source_code===f.template.source_code);
  return reviewed?.config.layoutVersion===f.template.config.layoutVersion && reviewed.config.sourceSha256===f.template.config.sourceSha256 && stable(reviewed.config.fields)===stable(f.template.config.fields);
 });
}
