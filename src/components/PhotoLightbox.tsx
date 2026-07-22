import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconClose, IconDownload, useToast } from './ui'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { cx } from '../lib/cx'
import { downloadViaBlob } from '../lib/download'
import type { ID } from '../types/api'

/** 라이트박스가 필요로 하는 최소 사진 형태 — Photo(제작자)·ViewerPhoto(뷰어) 공통부 */
export interface LightboxPhoto {
  id: ID
  /** 원본 표시 URL */
  url: string
  /** 저장용 URL — 없으면 url로 저장(제작자 Photo는 optional) */
  downloadUrl?: string
}

interface PhotoLightboxProps<T extends LightboxPhoto> {
  /** 좌우 이동 대상 전체 목록 — 그리드와 같은 순서 */
  photos: T[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /** 상단 바 아래 정보 영역(09 검수 배지 등) */
  info?: (photo: T) => ReactNode
  /** 하단 툴바의 [저장] 뒤에 붙는 추가 액션(09 옮기기/삭제) — LightboxToolbarButton으로 조합 */
  actions?: (photo: T) => ReactNode
  /** 잠금 — 뮤테이션 진행 중이거나 위에 다른 오버레이(확인 다이얼로그·시트)가 떠 있을 때.
      ESC·배경 닫기와 이동(스와이프·화살표)까지 멈춰 아래 화면이 몰래 바뀌는 것을 막는다 */
  disabled?: boolean
}

/** 수평 우세 + 최소 이동 거리 — 세로 스크롤·무심탭을 페이지 이동으로 오인하지 않는다 */
const SWIPE_MIN_X = 48

/**
 * 사진 크게 보기 공용 라이트박스(09 제작자 검수 · 16 뷰어, CHMO-242) — iOS 사진 앱풍
 * 라이트 크롬: 흰 배경 풀블리드 + 상단 ✕/카운터·하단 아이콘 툴바(반투명 blur 바).
 * 좌우 스와이프·←/→ 키로 이동(끝에서 멈춤), [저장]은 blob 저장. 확인 다이얼로그 등
 * z-40 오버레이를 위에 띄우려면 호출부 JSX에서 라이트박스보다 뒤에 두면 된다(DOM 순서).
 */
export function PhotoLightbox<T extends LightboxPhoto>({
  photos,
  index,
  onIndexChange,
  onClose,
  info,
  actions,
  disabled = false,
}: PhotoLightboxProps<T>) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const photo = photos[index] as T | undefined

  useEscapeKey(!disabled, onClose)

  const go = (delta: number) => {
    const next = index + delta
    if (next >= 0 && next < photos.length) onIndexChange(next)
  }

  // 모바일웹이 기준이지만 검수는 데스크톱에서도 한다 — ←/→ 키 이동 지원
  useEffect(() => {
    if (disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 인접 사진 프리로드 — 스와이프 직후 빈 화면(원본 로딩) 최소화
  useEffect(() => {
    ;[photos[index - 1], photos[index + 1]].forEach((p) => {
      if (p) new Image().src = p.url
    })
  }, [photos, index])

  if (!photo) return null

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || disabled) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * 1.5) return
    go(dx < 0 ? 1 : -1)
  }

  const handleSave = async () => {
    if (saving || disabled) return
    setSaving(true)
    const ok = await downloadViaBlob(photo.downloadUrl ?? photo.url, `${photo.id}.jpg`)
    setSaving(false)
    // 성공 피드백은 브라우저 저장 동작 자체 — 실패만 알린다
    if (!ok) toast.show('저장하지 못했어요. 다시 시도해 주세요.')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      onClick={disabled ? undefined : onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="absolute inset-0 z-40 bg-white"
    >
      {/* 긴 화면에서 프레임이 뷰포트보다 자라도 현재 뷰포트에 붙도록 sticky 앵커(Modal 선례) */}
      <div className="sticky top-0 h-dvh max-h-full">
        {/* 사진 — 풀블리드 contain, 상/하단 바 높이만큼 패딩으로 비켜난다.
            key=사진 id — 이동 시 이전 원본이 그대로 보이는 잔상 방지(새 img로 교체) */}
        <img
          key={photo.id}
          src={photo.url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 h-full w-full object-contain pb-24 pt-12"
        />

        {/* 상단 바 — ✕ · n/N 카운터 (반투명 blur + 헤어라인) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 top-0 flex h-12 items-center justify-between border-b border-border/70 bg-white/[.88] px-1.5 backdrop-blur"
        >
          <button
            type="button"
            aria-label="닫기"
            disabled={disabled}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text disabled:opacity-40"
          >
            <IconClose size={20} />
          </button>
          {photos.length > 1 && (
            <span className="text-[13px] font-semibold text-text">
              {index + 1} <span className="font-medium text-muted">/ {photos.length}</span>
            </span>
          )}
          {/* 좌우 균형 스페이서 — 카운터를 정중앙에 */}
          <span className="h-9 w-9" />
        </div>

        {info && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 top-[60px] flex flex-wrap items-center justify-center gap-2 px-5"
          >
            {info(photo)}
          </div>
        )}

        {/* 하단 아이콘 툴바 — iOS 사진 앱처럼 균등 배치(저장 · 호출부 액션들) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 flex items-start justify-around border-t border-border/70 bg-white/[.88] px-4 pb-safe-7 pt-2.5 backdrop-blur"
        >
          <LightboxToolbarButton
            icon={<IconDownload />}
            label={saving ? '저장 중…' : '저장'}
            disabled={saving || disabled}
            onClick={handleSave}
          />
          {actions?.(photo)}
        </div>
      </div>
    </div>
  )
}

interface LightboxToolbarButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  /** 파괴적 액션(삭제) — iOS 사진 앱 휴지통처럼 warn 색 */
  tone?: 'default' | 'warn'
}

/** 하단 툴바 아이콘 버튼 — 아이콘 위 + 10px 라벨 아래. 09가 actions 슬롯에서 조합한다 */
export function LightboxToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  tone = 'default',
}: LightboxToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-w-[64px] flex-col items-center gap-1 disabled:opacity-40',
        tone === 'warn' ? 'text-warn' : 'text-accent',
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
