import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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

/** 슬라이드 사이 간격 — 끌 때 두 사진이 맞붙어 한 장처럼 보이지 않게 */
const SLIDE_GAP = 16
/** 놓았을 때 제자리를 찾아가는 시간 — 끝에서 감속하는 곡선(사진 앱 관용) */
const SLIDE_MS = 300
const SLIDE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
/** 이동 확정 — 화면 폭의 이만큼 끌었으면 넘긴다 */
const COMMIT_RATIO = 0.22
/** 짧게 끌었어도 이 속도(px/ms)로 튕겼으면 넘긴다 — 손목만 튕기는 관용 제스처 */
const FLICK_SPEED = 0.45
const FLICK_MIN_X = 24
/** 가로/세로 어느 제스처인지 정하는 문턱 — 이 전에는 트랙을 움직이지 않는다 */
const AXIS_LOCK = 10
/** 첫 장·끝 장에서 더 끌 때 따라오는 비율(고무줄 — 끝이라는 걸 손끝으로 알린다) */
const EDGE_RESISTANCE = 0.35

/**
 * 트랙 위치 — 슬라이드는 자기 인덱스 자리에 고정이고 트랙이 통째로 움직인다.
 * 퍼센트는 트랙 자기 폭(=프레임 폭) 기준이라 화면 크기를 JS로 재지 않아도 첫 프레임부터 맞다.
 */
const trackTransform = (index: number, dx: number) =>
  `translate3d(calc((100% + ${SLIDE_GAP}px) * ${-index} + ${dx}px), 0, 0)`

/** 모션 최소화를 켠 기기에서는 미끄러지지 않고 즉시 바뀐다 */
const slideDuration = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : SLIDE_MS

/**
 * 사진 크게 보기 공용 라이트박스(09 제작자 검수 · 16 뷰어, CHMO-242) — iOS 사진 앱풍
 * 라이트 크롬: 흰 배경 풀블리드 + 상단 ✕/카운터·하단 아이콘 툴바(반투명 blur 바).
 * 좌우 스와이프·←/→ 키로 이동(끝에서 고무줄), 핀치·더블탭으로 확대(usePhotoZoom, CHMO-671 —
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

  // 트랙(사진 3장이 나란히 놓인 띠) 위치는 DOM style로 직접 쓴다 — 손가락당 60fps 리렌더 회피
  const trackRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{
    x0: number
    y0: number
    /** 가로(사진 이동)로 확정됐는지 — 정하기 전에는 트랙을 건드리지 않는다 */
    axis: 'none' | 'x' | 'y'
    /** 실제로 트랙에 반영한 이동량(끝에서는 고무줄이 걸려 손가락보다 덜 간다) */
    dx: number
    lastX: number
    lastT: number
    /** px/ms — 놓는 순간의 속도(튕김 판정) */
    speed: number
  } | null>(null)
  const applyTrack = useCallback((at: number, dx: number, animate: boolean) => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = animate ? `transform ${slideDuration()}ms ${SLIDE_EASE}` : 'none'
    el.style.transform = trackTransform(at, dx)
  }, [])

  // index가 바뀌면 트랙이 새 자리로 미끄러진다 — 스와이프·화살표·외부 변경이 모두 같은 길을 탄다.
  // 열자마자(첫 렌더)는 애니메이션 없이 그 자리에서 시작한다.
  const opened = useRef(false)
  useLayoutEffect(() => {
    applyTrack(index, 0, opened.current)
    opened.current = true
  }, [index, applyTrack])

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

  if (!photo) return null

  // 좌우 스와이프로 사진 이동 — 손가락을 그대로 따라오고, 놓으면 넘어가거나 제자리로 돌아온다.
  // 손가락이 둘 이상이거나 확대 중이면 줌 제스처의 몫이다(확대 중 같은 끌기는 팬).
  const cancelDrag = () => {
    const d = drag.current
    drag.current = null
    if (d?.axis === 'x') applyTrack(index, 0, true)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || e.touches.length !== 1 || zoom.isZoomed() || photos.length < 2) {
      cancelDrag()
      return
    }
    const t = e.touches[0]
    drag.current = {
      x0: t.clientX,
      y0: t.clientY,
      axis: 'none',
      dx: 0,
      lastX: t.clientX,
      lastT: e.timeStamp,
      speed: 0,
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const d = drag.current
    if (!d) return
    if (disabled || e.touches.length > 1 || zoom.isZoomed()) {
      cancelDrag()
      return
    }
    const t = e.touches[0]
    const dx = t.clientX - d.x0
    const dy = t.clientY - d.y0
    // 축을 한 번 정하면 끝까지 유지한다 — 비스듬히 끌어도 사진이 흔들리지 않는다
    if (d.axis === 'none') {
      if (Math.abs(dx) > AXIS_LOCK && Math.abs(dx) > Math.abs(dy)) d.axis = 'x'
      else if (Math.abs(dy) > AXIS_LOCK) d.axis = 'y'
    }
    if (d.axis !== 'x') return
    // 마지막 구간의 속도만 본다 — 천천히 끌다 튕겨도 튕김으로 잡힌다
    const dt = e.timeStamp - d.lastT
    if (dt > 0) {
      d.speed = (t.clientX - d.lastX) / dt
      d.lastX = t.clientX
      d.lastT = e.timeStamp
    }
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === photos.length - 1)
    d.dx = atEdge ? dx * EDGE_RESISTANCE : dx
    applyTrack(index, d.dx, false)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const d = drag.current
    if (!d) return
    // 손가락이 남아 있으면 아직 제스처 중(핀치에서 하나만 뗐다) — 끌던 자리는 되돌린다
    if (e.touches.length > 0) {
      cancelDrag()
      return
    }
    drag.current = null
    if (d.axis !== 'x') return
    const width = trackRef.current?.clientWidth ?? 0
    const dir = d.dx < 0 ? 1 : -1
    const far = Math.abs(d.dx) > Math.max(FLICK_MIN_X, width * COMMIT_RATIO)
    const flick =
      Math.abs(d.speed) > FLICK_SPEED &&
      Math.abs(d.dx) > FLICK_MIN_X &&
      Math.sign(d.speed) === -dir // 끌던 방향 그대로 튕겼을 때만(되돌리는 손짓은 취소다)
    const next = index + dir
    // 확정이면 index가 바뀌며 위 레이아웃 이펙트가 새 자리로 이어 달린다(끊김 없이)
    if ((far || flick) && next >= 0 && next < photos.length) onIndexChange(next)
    else applyTrack(index, 0, true)
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
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={cancelDrag}
      className="absolute inset-0 z-40 bg-white"
    >
      {/* 긴 화면에서 프레임이 뷰포트보다 자라도 현재 뷰포트에 붙도록 sticky 앵커(Modal 선례) */}
      <div className="sticky top-0 h-dvh max-h-full">
        {/* 사진 — 풀블리드 contain, 상/하단 바 높이만큼 패딩으로 비켜난다 */}
        <div onClick={(e) => e.stopPropagation()} className="absolute inset-0 pb-24 pt-12">
          {/* 줌 제스처의 기준 박스 — touch-none이라야 브라우저가 페이지 줌으로 먼저 가져가지 않는다.
              확대된 사진은 이 박스 안에 갇혀 상·하단 바를 침범하지 않는다.
              옆 사진은 이 박스 밖에 서 있다가 트랙이 움직이며 들어온다(overflow-hidden) */}
          <div
            ref={zoom.frameRef}
            {...zoom.handlers}
            className="relative h-full w-full touch-none overflow-hidden"
          >
            {/* 슬라이드 트랙 — 현재 사진과 양옆 한 장만 그린다(이동 중 다음 장이 이미 붙어 있어
                빈 화면이 없고, 인접 원본 프리로드도 이 렌더가 겸한다) */}
            <div ref={trackRef} className="absolute inset-0 will-change-transform">
              {[index - 1, index, index + 1].map((slot) => {
                const p = photos[slot] as T | undefined
                if (!p) return null
                const current = slot === index
                return (
                  // 슬라이드는 자기 인덱스 자리에 고정 — 움직이는 건 트랙뿐이다
                  <div
                    key={p.id}
                    className="absolute inset-y-0 w-full"
                    style={{ left: `calc((100% + ${SLIDE_GAP}px) * ${slot})` }}
                  >
                    {/* 사진과 bbox를 한 래퍼에 담아 함께 확대·이동한다(원점은 좌상단 — 훅 계산 전제).
                        슬라이드마다 같은 구조라 넘어갈 때 <img>가 새로 만들어지지 않는다(깜빡임 방지) */}
                    <div
                      ref={current ? zoom.contentRef : undefined}
                      // 옆으로 물러난 장에는 확대 흔적이 남지 않게 되돌린다
                      style={current ? undefined : { transform: 'none' }}
                      className="relative h-full w-full origin-top-left will-change-transform"
                    >
                      <img
                        ref={current ? imgRef : undefined}
                        src={p.url}
                        alt=""
                        draggable={false}
                        onLoad={(e) => {
                          if (current)
                            setNatural({
                              w: e.currentTarget.naturalWidth,
                              h: e.currentTarget.naturalHeight,
                            })
                        }}
                        className="h-full w-full object-contain"
                      />
                      {/* 애매 얼굴 bbox 오버레이 — 원본 px → 그려진 이미지 영역 비율로 환산(CHMO-412) */}
                      {current && fit && natural && !!boxes?.length && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute overflow-hidden"
                          style={fit}
                        >
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
                )
              })}
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
      {/* 앱 저장 권한 안내(CHMO-540) — 스크림 탭이 라이트박스 onClose로 번지지 않게 막는다.
          터치도 함께 막는다 — 다이얼로그 위를 쓸었다고 뒤에서 사진이 넘어가면 안 된다 */}
      <div onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
        {save.dialog}
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
