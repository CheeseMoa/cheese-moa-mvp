import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconClose, IconDownload } from './ui'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { usePhotoSave } from '../hooks/usePhotoSave'
import { usePhotoZoom } from '../hooks/usePhotoZoom'
import { cx } from '../lib/cx'
import type { FaceBbox, ID } from '../types/api'

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
  /**
   * 사진 위에 강조할 얼굴 bbox들(원본 px 좌표) — '분류가 어려워요' 사유 표시(CHMO-412).
   * 노출 여부는 호출부가 소유한다(09가 uncertain 앨범에서만 넘긴다) — 뷰어(16)는 미사용.
   * 좌표는 로드된 원본의 naturalWidth/Height 기준으로 화면 크기에 맞춰 환산해 그린다.
   */
  faceBboxes?: (photo: T) => FaceBbox[] | undefined
  /** 잠금 — 뮤테이션 진행 중이거나 위에 다른 오버레이(확인 다이얼로그·시트)가 떠 있을 때.
      ESC·배경 닫기와 이동(스와이프·화살표)까지 멈춰 아래 화면이 몰래 바뀌는 것을 막는다 */
  disabled?: boolean
}

/** 수평 우세 + 최소 이동 거리 — 세로 스크롤·무심탭을 페이지 이동으로 오인하지 않는다 */
const SWIPE_MIN_X = 48

/**
 * 사진 크게 보기 공용 라이트박스(09 제작자 검수 · 16 뷰어, CHMO-242) — iOS 사진 앱풍
 * 라이트 크롬: 흰 배경 풀블리드 + 상단 ✕/카운터·하단 아이콘 툴바(반투명 blur 바).
 * 좌우 스와이프·←/→ 키로 이동(끝에서 멈춤), 핀치·더블탭으로 확대(usePhotoZoom, CHMO-671 —
 * 확대 중에는 손가락 끌기가 팬이라 사진 이동이 멈춘다), [저장]은 앨범 저장 파이프라인(usePhotoSave,
 * CHMO-473 — iOS는 공유 시트 '이미지 저장', 그 외는 blob 다운로드). 확인 다이얼로그 등
 * z-40 오버레이를 위에 띄우려면 호출부 JSX에서 라이트박스보다 뒤에 두면 된다(DOM 순서).
 */
export function PhotoLightbox<T extends LightboxPhoto>({
  photos,
  index,
  onIndexChange,
  onClose,
  info,
  actions,
  faceBboxes,
  disabled = false,
}: PhotoLightboxProps<T>) {
  const save = usePhotoSave()
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const photo = photos[index] as T | undefined
  const photoId = photo?.id

  // 사진 전환 시 준비물 폐기 — 이전 사진의 파일로 [사진 앱에 저장]이 이어지지 않게
  useEffect(() => {
    save.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId])

  // 그려진 사진 영역 환산 재료 — 원본 자연 크기(naturalWidth/Height)와 프레임 크기.
  // bbox 오버레이(CHMO-412)와 줌 팬 한계(CHMO-671)가 같은 사각형을 쓴다.
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null)

  useEscapeKey(!disabled, onClose)

  // 사진 전환 시 자연 크기 갱신 — 캐시된 이미지는 onLoad 전에 이미 complete일 수 있어 직접 읽는다
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    } else {
      setNatural(null)
    }
  }, [photo?.id])

  // object-contain으로 그려진 실제 이미지 영역(레터박스 제외)을 프레임 안에서 역산한다
  const fit = useMemo(() => {
    if (!natural || !frame || natural.w <= 0 || natural.h <= 0) return null
    const scale = Math.min(frame.w / natural.w, frame.h / natural.h)
    const width = natural.w * scale
    const height = natural.h * scale
    return { left: (frame.w - width) / 2, top: (frame.h - height) / 2, width, height }
  }, [natural, frame])

  const zoom = usePhotoZoom({ enabled: !disabled, resetKey: photoId, fit })

  // 프레임 크기 추적 — 데스크톱 창 리사이즈에도 bbox·확대 위치가 사진에 붙어 있게
  useEffect(() => {
    const el = zoom.frameRef.current
    if (!el) return
    const update = () =>
      setFrame((prev) =>
        prev?.w === el.clientWidth && prev?.h === el.clientHeight
          ? prev
          : { w: el.clientWidth, h: el.clientHeight },
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [zoom.frameRef])

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

  // 좌우 스와이프로 사진 이동 — 손가락이 둘 이상이거나 확대 중이면 줌 제스처의 몫이다.
  // 확대 중에 같은 손가락 끌기는 팬이고, 1x로 돌아오면 이동이 그대로 살아난다.
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || zoom.isZoomed()) {
      touchStart.current = null
      return
    }
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || disabled || e.touches.length > 0 || zoom.isZoomed()) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * 1.5) return
    go(dx < 0 ? 1 : -1)
  }

  // iOS 2단계: 첫 탭 = 준비 시작(빠르면 시트까지 직행), ready면 재탭이 공유 시트를 연다
  const handleSave = () => {
    if (save.busy || disabled) return
    if (save.state.phase === 'ready') save.shareNext()
    else void save.start([{ url: photo.downloadUrl ?? photo.url, filename: `${photo.id}.jpg` }])
  }

  const saveLabel =
    save.state.phase === 'preparing'
      ? '준비 중…'
      : save.state.phase === 'downloading'
        ? '저장 중…'
        : save.state.phase === 'ready'
          ? '사진 앱에 저장'
          : '저장'

  const boxes = faceBboxes?.(photo)

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
        <div onClick={(e) => e.stopPropagation()} className="absolute inset-0 pb-24 pt-12">
          {/* 줌 제스처의 기준 박스 — touch-none이라야 브라우저가 페이지 줌으로 먼저 가져가지 않는다.
              확대된 사진은 이 박스 안에 갇혀 상·하단 바를 침범하지 않는다 */}
          <div
            ref={zoom.frameRef}
            {...zoom.handlers}
            className="relative h-full w-full touch-none overflow-hidden"
          >
            {/* 사진과 bbox를 한 래퍼에 담아 함께 확대·이동한다(원점은 좌상단 — 훅 계산 전제) */}
            <div
              ref={zoom.contentRef}
              className="relative h-full w-full origin-top-left will-change-transform"
            >
              <img
                key={photo.id}
                ref={imgRef}
                src={photo.url}
                alt=""
                draggable={false}
                onLoad={(e) =>
                  setNatural({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                className="h-full w-full object-contain"
              />
              {/* 애매 얼굴 bbox 오버레이 — 원본 px → 그려진 이미지 영역 비율로 환산(CHMO-412) */}
              {fit && natural && !!boxes?.length && (
                <div aria-hidden className="pointer-events-none absolute overflow-hidden" style={fit}>
                  {boxes.map((box, i) => (
                    <div
                      key={i}
                      className="absolute rounded-md border-2 border-primary shadow-[0_0_0_1.5px_rgba(255,255,255,0.75)]"
                      style={{
                        left: `${(box.x / natural.w) * 100}%`,
                        top: `${(box.y / natural.h) * 100}%`,
                        width: `${(box.w / natural.w) * 100}%`,
                        height: `${(box.h / natural.h) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

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
            label={saveLabel}
            disabled={save.busy || disabled}
            onClick={handleSave}
          />
          {actions?.(photo)}
        </div>
      </div>
      {/* 앱 저장 권한 안내(CHMO-540) — 스크림 탭이 라이트박스 onClose로 번지지 않게 막는다 */}
      <div onClick={(e) => e.stopPropagation()}>{save.dialog}</div>
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
