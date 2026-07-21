import type { Album } from '../../types/api'
import { Badge } from './Badge'
import { cx } from '../../lib/cx'

type AlbumCardAlbum = Pick<Album, 'type' | 'name' | 'photoCount' | 'unreviewedPhotoCount'>

interface AlbumCardProps {
  album: AlbumCardAlbum
  /** 커버 썸네일 URL — 없으면 치즈 도트 플레이스홀더 */
  coverUrl?: string
  /** 없으면 순수 표시용 <div>로 렌더 — 무동작 포커스 버튼을 만들지 않는다(14 미리보기, CHMO-346) */
  onClick?: () => void
}

/**
 * 이벤트 상세(08) 앨범 카드 — 검토 테두리 규칙:
 * 갈색 실선 = 검토완료 · 회색 점선 = 미검토. (검토는 사진 단위 — 앨범 표시는 미검토 사진 수(unreviewedPhotoCount)로 파생)
 * 품질 앨범(eyes_closed/blurry)도 같은 검토 테두리를 탄다(피드백 #7 — dc.html §06의 '기본 테두리' 규칙을 대체, CHMO-355) ·
 * uncertain은 검토와 무관하게 항상 점선(재분류 대상) · 검토 배지는 person/common에만.
 */
export function AlbumCard({ album, coverUrl, onClick }: AlbumCardProps) {
  const reviewable = album.type === 'person' || album.type === 'common'
  // 사진 0장이면 unreviewedPhotoCount === 0이 공허하게 참 → '검토완료' 오표시. 사진이 있을 때만 완료로 본다
  const reviewed = album.photoCount > 0 && album.unreviewedPhotoCount === 0
  const borderCls =
    reviewed && album.type !== 'uncertain'
      ? 'border-2 border-accent'
      : 'border-2 border-dashed border-[#C9C2B4]'
  const meta =
    album.type === 'uncertain' ? `${album.photoCount}장 · 재분류 대상` : `${album.photoCount}장`
  const content = (
    <>
      <span className="cheese-dots block h-24 overflow-hidden rounded-[10px] bg-photo">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : album.type === 'uncertain' ? (
          <span className="flex h-full items-center justify-center text-2xl">🤔</span>
        ) : null}
      </span>
      {/* 풀네임 최대 노출(피드백 #6, CHMO-354): 이름이 배지와 폭을 나누지 않게 카드 전폭 + 2줄 클램프.
          break-keep은 쓰지 않는다 — 공백 없는 긴 이름이 줄바꿈 못 하고 수평으로 잘린다 */}
      <span className="mt-2 line-clamp-2 text-sm font-bold text-text">{album.name}</span>
      <span className="mt-0.5 flex items-end justify-between gap-1">
        <span className="text-[11px] text-muted">{meta}</span>
        {reviewable && album.unreviewedPhotoCount !== undefined && (
          <Badge variant={reviewed ? 'reviewed' : 'unreviewed'} size="sm" />
        )}
      </span>
    </>
  )
  const baseCls = cx('w-full rounded-2xl bg-white p-2 text-left', borderCls)
  if (!onClick) return <div className={baseCls}>{content}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(baseCls, 'transition active:scale-[0.99]')}
    >
      {content}
    </button>
  )
}
