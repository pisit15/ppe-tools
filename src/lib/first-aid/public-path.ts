/** A QR bearer link grants only the public collection surface, never staff APIs. */
export function isPublicFirstAidPath(pathname: string): boolean {
  return /^\/first-aid\/take\/[a-f0-9]{64}$/.test(pathname)
    || /^\/api\/first-aid\/public\/[a-f0-9]{64}$/.test(pathname);
}
