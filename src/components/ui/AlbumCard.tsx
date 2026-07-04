import type { Album } from '../../types/api'
import { Badge } from './Badge'
import { cx } from '../../lib/cx'

type AlbumCardAlbum = Pick<Album, 'type' | 'name' | 'photoCount' | 'unreviewedPhotoCount'>

interface AlbumCardProps {
  album: AlbumCardAlbum
  /** 커버 썸네일 URL — 없으면 치즈 도트 플레이스홀더 */
  coverUrl?: string
  onClick?: () => void
}

/**
 * 이벤트 상세(08) 앨범 카드 — 검토 테두리 규칙 (dc.html §06 · 고정):
 * 갈색 실선 = 검토완료 · 회색 점선 = 미검토. (검토는 사진 단위 — 앨범 표시는 미검토 사진 수(unreviewedPhotoCount)로 파생)
 * person/common은 검토 배지 노출 · uncertain은 배지 없이 점선(재분류 대상) ·
 * 품질 앨범(eyes_closed/blurry)은 기본 테두리·배지 없음.
 */
export function AlbumCard({ album, coverUrl, onClick }: AlbumCardProps) {
  const reviewable = album.type === 'person' || album.type === 'common'
  const reviewed = album.unreviewedPhotoCount === 0
  const borderCls =
    reviewable || album.type === 'uncertain'
      ? reviewable && reviewed
        ? 'border-2 border-accent'
        : 'border-2 border-dashed border-[#C9C2B4]'
      : 'border border-border'
  const meta =
    album.type === 'uncertain' ? `${album.photoCount}장 · 재분류 대상` : `${album.photoCount}장`
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full rounded-2xl bg-white p-2 text-left transition active:scale-[0.99]',
        borderCls,
      )}
    >
      <span className="cheese-dots block h-24 overflow-hidden rounded-[10px] bg-photo">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : album.type === 'uncertain' ? (
          <span className="flex h-full items-center justify-center text-2xl">🤔</span>
        ) : null}
      </span>
      <span className="mt-2 flex items-end justify-between gap-1">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-text">{album.name}</span>
          <span className="mt-0.5 block text-[11px] text-muted">{meta}</span>
        </span>
        {reviewable && album.unreviewedPhotoCount !== undefined && (
          <Badge variant={reviewed ? 'reviewed' : 'unreviewed'} size="sm" />
        )}
      </span>
    </button>
  )
}
