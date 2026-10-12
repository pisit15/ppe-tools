export const AMT_SDS_QR = { x: 54, y: 114, size: 16 };

/** Fit the largest legible pictograms around the QR without reducing text. */
export function amtGhsLayout(count: number, top: number, hasQr: boolean) {
  const gap = 1;
  for (let size = 18; size >= 10; size -= 0.5) {
    const positions: { x: number; y: number }[] = [];
    for (let y = top; y + size <= 128; y += size + gap) {
      for (let x = 13; x + size <= 72; x += size + gap) {
        const hitsQr =
          hasQr &&
          x < AMT_SDS_QR.x + AMT_SDS_QR.size + gap &&
          x + size > AMT_SDS_QR.x - gap &&
          y < AMT_SDS_QR.y + AMT_SDS_QR.size + gap &&
          y + size > AMT_SDS_QR.y - gap;
        if (!hitsQr) positions.push({ x, y });
      }
    }
    if (positions.length >= count)
      return { size, positions: positions.slice(0, count) };
  }
  return null;
}
