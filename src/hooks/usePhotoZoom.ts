import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'

/** 최대 배율 — 더 키워 봐야 원본에 없는 해상도라 뭉개진 픽셀만 커진다 */
const MAX_SCALE = 4
/** 더블탭 한 번에 가는 배율(사진 앱 관용) */
const DOUBLE_TAP_SCALE = 2
/** 두 탭을 한 동작으로 묶는 간격·거리 */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 28
/** 이만큼 움직이면 탭이 아니라 끌기로 본다 */
const TAP_MOVE_MAX = 10
/** 1x 판정 여유 — 부동소수 오차로 확대 상태가 남지 않게 */
const EPS = 0.01
/** 더블탭·복귀에만 쓰는 짧은 전환(제스처 중에는 손가락을 그대로 따라간다) */
const ANIM_MS = 200

/** 프레임 안에서 사진이 실제로 그려진 영역(1x 기준, object-contain 레터박스 제외) */
export interface PhotoFitRect {
  left: number
  top: number
  width: number
  height: number
}

interface Options {
  /** 제스처 활성 — 위에 다른 오버레이가 떠 있으면(disabled) false */
  enabled: boolean
  /** 이 값이 바뀌면 배율·위치를 되돌린다(사진 전환) */
  resetKey: unknown
  /** 없으면 프레임 전체를 사진으로 본다(원본 크기 도착 전) */
  fit: PhotoFitRect | null
}

/**
 * 확대된 사진이 프레임을 덮으면 가장자리 밖으로 못 나가게 잡고,
 * 덜 덮으면(축소·세로 여백) 가운데로 되돌린다 — 흰 여백이 끌려 들어오지 않는다.
 */
function clampAxis(offset: number, scale: number, start: number, size: number, viewport: number) {
  const painted = scale * size
  if (painted <= viewport) return (viewport - painted) / 2 - scale * start
  return Math.min(-scale * start, Math.max(viewport - scale * (start + size), offset))
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * 라이트박스 사진의 핀치 줌·팬·더블탭(CHMO-671).
 *
 * `frameRef`(기준 박스)와 `contentRef`(사진+오버레이 래퍼)를 각각 붙이고 `handlers`를
 * 프레임에 스프레드한다. 프레임에는 `touch-action: none`이 필요하다 — 안 그러면 브라우저가
 * 페이지 줌·스크롤로 제스처를 먼저 가로챈다.
 *
 * 제스처 중에는 React state 대신 **DOM style을 직접 쓴다**(손가락당 60fps 리렌더를 피한다).
 * 리액트로 나가는 값은 `zoomed` 하나뿐이고, 그마저 1x 경계를 넘을 때만 바뀐다 —
 * 호출부는 이걸로 좌우 스와이프(사진 이동)를 켜고 끈다.
 */
export function usePhotoZoom({ enabled, resetKey, fit }: Options) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  /** transform-origin이 좌상단이라 화면좌표 = 오프셋 + 배율 × 콘텐츠좌표 */
  const view = useRef({ scale: 1, x: 0, y: 0 })
  const fitRef = useRef(fit)
  const [zoomed, setZoomed] = useState(false)
  const zoomedRef = useRef(false)

  const apply = useCallback((animate: boolean) => {
    const el = contentRef.current
    if (!el) return
    const { scale, x, y } = view.current
    el.style.transition = animate ? `transform ${ANIM_MS}ms ease-out` : 'none'
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    const next = scale > 1 + EPS
    if (zoomedRef.current !== next) {
      zoomedRef.current = next
      setZoomed(next)
    }
  }, [])

  /** 배율·오프셋을 한 번에 확정 — 범위를 벗어난 값은 여기서 전부 잡힌다 */
  const setView = useCallback(
    (scale: number, x: number, y: number, animate = false) => {
      const s = Math.min(MAX_SCALE, Math.max(1, scale))
      const frame = frameRef.current
      if (frame) {
        const w = frame.clientWidth
        const h = frame.clientHeight
        const f = fitRef.current ?? { left: 0, top: 0, width: w, height: h }
        x = clampAxis(x, s, f.left, f.width, w)
        y = clampAxis(y, s, f.top, f.height, h)
      }
      view.current = { scale: s, x, y }
      apply(animate)
    },
    [apply],
  )

  /** 집은 지점(프레임 기준 좌표)이 화면에서 안 튀도록 배율을 바꾼다 */
  const zoomAt = useCallback(
    (scale: number, fx: number, fy: number, animate = false) => {
      const { scale: s0, x, y } = view.current
      const k = Math.min(MAX_SCALE, Math.max(1, scale)) / s0
      setView(s0 * k, fx - k * (fx - x), fy - k * (fy - y), animate)
    },
    [setView],
  )

  // 사진 전환 — 배율·위치를 1x 원점으로(이전 사진에서 확대해 둔 자리가 따라오지 않게)
  useEffect(() => {
    view.current = { scale: 1, x: 0, y: 0 }
    apply(false)
  }, [resetKey, apply])

  // 원본 크기 도착·창 리사이즈로 사진이 그려지는 영역이 바뀌면 현재 위치를 다시 잡는다
  useEffect(() => {
    fitRef.current = fit
    const { scale, x, y } = view.current
    setView(scale, x, y)
  }, [fit, setView])

  const touch = useRef<{
    mode: 'pan' | 'pinch'
    startDist: number
    startScale: number
    /** 시작 시점의 기준점(핀치는 두 손가락 중점, 팬은 손가락 위치) */
    from: { x: number; y: number }
    /** 시작 시점의 오프셋 */
    origin: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null)

  const pointIn = useCallback((t: { clientX: number; clientY: number }) => {
    const rect = frameRef.current?.getBoundingClientRect()
    return { x: t.clientX - (rect?.left ?? 0), y: t.clientY - (rect?.top ?? 0) }
  }, [])

  const beginPan = useCallback(
    (t: { clientX: number; clientY: number }, moved: boolean) => {
      touch.current = {
        mode: 'pan',
        startDist: 0,
        startScale: view.current.scale,
        from: pointIn(t),
        origin: { x: view.current.x, y: view.current.y },
        moved,
      }
    },
    [pointIn],
  )

  // 트랙패드 핀치(ctrl+wheel)와 Safari 제스처 — React 합성 이벤트는 passive라 preventDefault가
  // 안 먹어 네이티브로 붙인다. iOS Safari는 user-scalable=no를 무시해 페이지가 통째로
  // 확대되는데, 이 프레임 위에서만큼은 우리가 제스처를 가진다.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !enabled) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // 일반 휠 스크롤은 건드리지 않는다
      e.preventDefault()
      const rect = frame.getBoundingClientRect()
      zoomAt(view.current.scale * Math.exp(-e.deltaY / 120), e.clientX - rect.left, e.clientY - rect.top)
    }
    const block = (e: Event) => e.preventDefault()
    frame.addEventListener('wheel', onWheel, { passive: false })
    frame.addEventListener('gesturestart', block, { passive: false })
    frame.addEventListener('gesturechange', block, { passive: false })
    return () => {
      frame.removeEventListener('wheel', onWheel)
      frame.removeEventListener('gesturestart', block)
      frame.removeEventListener('gesturechange', block)
    }
  }, [enabled, zoomAt])

  const handlers = {
    onTouchStart: (e: React.TouchEvent) => {
      if (!enabled) return
      if (e.touches.length >= 2) {
        const a = pointIn(e.touches[0])
        const b = pointIn(e.touches[1])
        touch.current = {
          mode: 'pinch',
          startDist: Math.max(1, distance(a, b)),
          startScale: view.current.scale,
          from: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          origin: { x: view.current.x, y: view.current.y },
          moved: true,
        }
        return
      }
      beginPan(e.touches[0], false)
    },

    onTouchMove: (e: React.TouchEvent) => {
      const g = touch.current
      if (!g || !enabled) return
      if (g.mode === 'pinch') {
        if (e.touches.length < 2) return
        const a = pointIn(e.touches[0])
        const b = pointIn(e.touches[1])
        // 두 손가락 중점을 따라가므로 벌리기·오므리기와 두 손가락 끌기가 한 동작으로 이어진다
        const s = g.startScale * (distance(a, b) / g.startDist)
        const k = Math.min(MAX_SCALE, Math.max(1, s)) / g.startScale
        setView(
          g.startScale * k,
          (a.x + b.x) / 2 - k * (g.from.x - g.origin.x),
          (a.y + b.y) / 2 - k * (g.from.y - g.origin.y),
        )
        return
      }
      const p = pointIn(e.touches[0])
      const dx = p.x - g.from.x
      const dy = p.y - g.from.y
      if (Math.abs(dx) > TAP_MOVE_MAX || Math.abs(dy) > TAP_MOVE_MAX) g.moved = true
      // 1x에서는 손가락을 좌우 스와이프(사진 이동)에 넘긴다 — 확대했을 때만 팬이다
      if (view.current.scale <= 1 + EPS) return
      setView(view.current.scale, g.origin.x + dx, g.origin.y + dy)
    },

    onTouchEnd: (e: React.TouchEvent) => {
      const g = touch.current
      if (!g) return
      // 핀치에서 손가락 하나가 떨어졌다 — 남은 손가락이 팬을 이어받는다
      if (e.touches.length >= 1) {
        beginPan(e.touches[0], true)
        return
      }
      touch.current = null
      if (!enabled || g.mode !== 'pan' || g.moved) return

      const now = Date.now()
      const p = pointIn(e.changedTouches[0])
      const prev = lastTap.current
      if (prev && now - prev.at < DOUBLE_TAP_MS && distance(p, prev) < DOUBLE_TAP_SLOP) {
        lastTap.current = null
        if (view.current.scale > 1 + EPS) setView(1, 0, 0, true)
        else zoomAt(DOUBLE_TAP_SCALE, p.x, p.y, true)
        return
      }
      lastTap.current = { at: now, x: p.x, y: p.y }
    },

    onTouchCancel: () => {
      touch.current = null
    },
  }

  return {
    /** 제스처 기준 박스 — `touch-action: none`(tailwind `touch-none`)과 함께 쓴다 */
    frameRef,
    /** transform을 입는 래퍼 — `transform-origin: 0 0`(tailwind `origin-top-left`) 필수 */
    contentRef,
    /** 확대 중인가 — 호출부가 좌우 스와이프(사진 이동)를 끄는 데 쓴다 */
    zoomed,
    /** 이벤트 핸들러 안에서 최신 값을 읽을 때(state는 한 박자 늦다) */
    isZoomed: useCallback(() => zoomedRef.current, []),
    handlers,
  }
}
