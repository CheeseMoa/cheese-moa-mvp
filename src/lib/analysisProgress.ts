/** 서버가 확인한 최신 진행률까지만 빠르게 따라간다. */
export function advanceAnalysisProgress(displayed: number, latest: number | null): number {
  if (latest == null || latest <= displayed) return displayed
  const gap = latest - displayed
  return Math.min(latest, displayed + Math.max(1, Math.ceil(gap / 3)))
}
