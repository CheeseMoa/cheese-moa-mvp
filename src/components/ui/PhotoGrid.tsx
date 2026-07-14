import type { ReactNode } from 'react'

interface PhotoGridProps {
  children: ReactNode
}

/** 사진 그리드 — 3열 · gap 9 (dc.html §07). PhotoTile을 자식으로 배치한다. */
export function PhotoGrid({ children }: PhotoGridProps) {
  return <div className="grid grid-cols-3 gap-[9px]">{children}</div>
}
