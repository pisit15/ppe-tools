// Which tools.eashe.org company (site) a PR belongs to for the per-person summary.
// Odoo companies are legal entities that span several sites, so the operating unit decides;
// when the unit is a shared/head-office unit, the PR belongs to the requester's own site(s).

const UNIT_SITE: [RegExp, string][] = [
  [/^D9_/, 'aab'],
  [/^D8_/, 'amt'],
  [/^D7_/, 'mmc'],
  [/^D4_/, 'ebi'],
  [/^D1_/, 'ea-kabin'],
  [/^(EW_HNM|EM_POM)$/, 'hnm'],
  [/^EW_HGH$/, 'ewhk'],
  [/^ES_ESP$/, 'esp'],
  [/^(ES_ESL|D0_ESL0)$/, 'esl'],
  [/^ES_ESLO$/, 'eslo'],
  [/^(ES_ESN|D0_ESN)$/, 'esn'],
];
const CENTER_COMPANY_SITE: [RegExp, string][] = [
  [/^Green Technology Research/i, 'gtr'],
  [/^Smart Waste Management/i, 'swm'],
  [/^(Banchuan|Benjarat|Nayangklak|Pongnok)/i, 'hnm'],
];

export function unitCode(operatingUnit: string) {
  return /^\[([^\]]+)\]/.exec(operatingUnit)?.[1] ?? '';
}

/** Site from the PR's operating unit, or null when the unit is shared (head office, center, accounting…). */
export function unitSite(operatingUnit: string, company: string): string | null {
  const code = unitCode(operatingUnit);
  for (const [re, site] of UNIT_SITE) if (re.test(code)) return site;
  if (code === 'ZZ_ZZZZ') for (const [re, site] of CENTER_COMPANY_SITE) if (re.test(company)) return site;
  return null;
}

/** Sites of a PR: its unit's site, else every site of the requester's login accounts. */
export function prSites(pr: { operating_unit: string; company: string; requester: string }, requesterSites: Map<string, string[]>) {
  const site = unitSite(pr.operating_unit, pr.company);
  return site ? [site] : requesterSites.get(pr.requester) ?? [];
}

export type ActorScope = { all: boolean; sites: string[]; requester: string | null };
/** Summary membership depends only on assigned sites, never on who opened the PR. */
export const canSee = (scope: ActorScope, sites: string[]) =>
  scope.all || sites.some(s => scope.sites.includes(s));
