import { runWithConcurrency } from './concurrency'
import { downloadViaBlob } from './download'
import {
  BridgeError,
  hasCapability,
  newOpId,
  savePhotos,
  subscribeBridgeProgress,
} from '../native/bridge'

/**
 * 사진 앨범 저장 경로 단일 원천 (CHMO-473 — ZIP 폐지).
 *
 * 웹에서 사진을 기기 앨범(사진 앱·갤러리)에 넣는 표준 경로는 플랫폼마다 다르다:
 * - iOS: 공유 시트의 시스템 '이미지 저장'만 사진 앱에 직행한다 — `navigator.share({ files })`.
 *   앵커 다운로드는 파일 앱 '다운로드' 폴더로만 가서 앨범에 절대 안 들어간다.
 * - Android: 공유 시트에 시스템 '갤러리 저장' 액션이 없다(앱 대상 공유뿐). 대신 장별
 *   다운로드가 Download 폴더에 쌓이면 미디어 색인으로 갤러리 앱에 자동 노출된다.
 * - 데스크탑·미지원: 장별 다운로드(다운로드 폴더행) 폴백.
 */
export interface PhotoSaveItem {
  /** 저장용 원본 URL */
  url: string
  /** 다운로드 경로에서 쓰는 파일명 — 공유 경로는 blob MIME에 맞춰 확장자를 바로잡는다 */
  filename: string
}

/**
 * 공유 시트 1회에 싣는 최대 장수. 훅(usePhotoSave)이 File도 배치 단위로 받으므로
 * 메모리 피크 역시 이 상한(프리페치 포함 최대 2배치)을 따른다 — 총량이 아니다.
 * 20장 × 원본 ~4MB ≈ 80MB 수준. 실기기(구형 포함) 검증에서 조정한다.
 */
export const SHARE_BATCH_MAX = 20

/** blob fetch·다운로드 동시 실행 수 — 커넥션 고갈 방지(09 선택 저장 선례) */
const SAVE_CONCURRENCY = 3

/** 업로드 허용 포맷(src/lib/upload.ts)과 같은 집합 — 확장자를 blob MIME에 정렬할 때 쓴다 */
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

/** iOS 판별 — iPadOS 13+는 Mac UA로 위장하므로 터치 지점 수로 가른다(실 Mac은 0) */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  )
}

/**
 * 공유 시트 저장 경로를 쓸지 — iOS + 파일 공유 지원일 때만.
 * Android도 파일 공유는 되지만 시트에 '갤러리 저장'이 없어 앨범 직행이 안 되므로
 * 다운로드 경로(갤러리 자동 색인)가 정공법이다.
 */
export function shareSaveSupported(): boolean {
  if (!isIOS() || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({
      files: [new File([new Uint8Array(1)], 'probe.jpg', { type: 'image/jpeg' })],
    })
  } catch {
    return false
  }
}

/** blob MIME에 맞춰 확장자를 바로잡은 File — 공유 시트는 타입으로 '이미지 저장' 노출을 정한다 */
function toFile(blob: Blob, filename: string): File {
  const ext = EXT_BY_TYPE[blob.type]
  const name = ext ? filename.replace(/\.[^.]+$/, `.${ext}`) : filename
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

/**
 * 공유용 선요청 — 원본을 blob으로 받아 File 배열로 만든다(동시 3장, 원본 순서 유지).
 * `cache: 'no-store'`는 downloadViaBlob과 같은 이유로 필수(CHMO-326 — `<img>`가 오염시킨
 * CORS 헤더 없는 캐시 재사용 차단). 실패는 장수만 세서 돌려준다 — 성공분만으로도 공유는 간다.
 */
export async function fetchAsFiles(
  items: PhotoSaveItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: File[]; failed: number }> {
  const slots: (File | null)[] = new Array(items.length).fill(null)
  let done = 0
  await runWithConcurrency(items, SAVE_CONCURRENCY, async (item, index) => {
    try {
      const res = await fetch(item.url, { cache: 'no-store' })
      if (res.ok) slots[index] = toFile(await res.blob(), item.filename)
    } catch {
      // 개별 실패는 집계만 — 아래 filter가 거른다
    }
    done += 1
    onProgress?.(done, items.length)
  })
  const files = slots.filter((f): f is File => f !== null)
  return { files, failed: items.length - files.length }
}

/** 시트 1회 상한(SHARE_BATCH_MAX)으로 나눈다 — 훅이 아이템을 나눈 뒤 배치 단위로 받는다 */
export function splitIntoBatches<T>(list: T[]): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < list.length; i += SHARE_BATCH_MAX) {
    batches.push(list.slice(i, i + SHARE_BATCH_MAX))
  }
  return batches
}

export type ShareFilesOutcome = 'shared' | 'canceled' | 'blocked' | 'failed'

/**
 * 파일 공유 시트 열기.
 * - 'canceled' = 사용자가 시트를 닫음 — 정상 흐름이라 호출부가 토스트를 띄우면 안 된다.
 * - 'blocked' = 사용자 제스처(transient activation) 만료 — Safari는 탭과 같은 틱 수준으로
 *   엄격해서 선요청이 길면 필연이다. 호출부가 [사진 앱에 저장] 재탭으로 잇는다.
 */
export async function shareFiles(files: File[]): Promise<ShareFilesOutcome> {
  try {
    await navigator.share({ files })
    return 'shared'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'canceled'
    if (err instanceof DOMException && err.name === 'NotAllowedError') return 'blocked'
    return 'failed'
  }
}

/**
 * 이미 받아둔 File을 재요청 없이 다운로드로 흘린다 — 공유가 막힌 환경의 폴백(iOS 파일 앱행).
 * 클릭이 몰리면 브라우저가 뒷 장을 버릴 수 있어 장 사이 간격을 둔다.
 */
export async function downloadPreparedFiles(files: File[], onEach?: () => void): Promise<void> {
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 즉시 revoke하면 일부 브라우저가 시작 전 저장을 취소한다 — 지연 해제(download.ts 선례)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    onEach?.()
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

/**
 * 다운로드 경로 — 장마다 blob 다운로드를 트리거한다(Android: Download 폴더 → 갤러리 자동
 * 색인, 데스크탑: 다운로드 폴더). 실패 장수를 돌려준다.
 */
export async function downloadEach(
  items: PhotoSaveItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let failed = 0
  let done = 0
  await runWithConcurrency(items, SAVE_CONCURRENCY, async (item) => {
    const ok = await downloadViaBlob(item.url, item.filename)
    if (!ok) failed += 1
    done += 1
    onProgress?.(done, items.length)
  })
  return failed
}

// ── 앱(웹뷰) 경로 (CHMO-540) ────────────────────────────────────────────────
// 웹뷰에는 Web Share API도 blob 다운로드도 없다(앱 리포 app-shell-spec §3) — 앱에서는
// 브리지 savePhotos(다운로드·갤러리 저장·권한 전부 셸 소관)가 유일하게 동작하는 저장
// 경로다. 공유 시트 제약이던 2단계 UX(재탭)·20장 배치(SHARE_BATCH_MAX)도 앱 경로엔 없다.

/** 앱 경로를 쓸지 — 앱 감지 + capability 유무(구버전 앱은 자동 제외, 계약 §1-6) */
export function bridgeSaveSupported(): Promise<boolean> {
  return hasCapability('savePhotos')
}

/** 브리지 저장의 결과 — 훅(usePhotoSave)이 토스트·권한 안내 UX로 옮긴다 */
export type BridgeSaveOutcome =
  | { kind: 'done'; saved: number; failed: number }
  | { kind: 'permission'; canOpenSettings: boolean }
  | { kind: 'cancelled' }
  | { kind: 'error' }

/**
 * 브리지 savePhotos 실행 — 셸의 진행 이벤트를 onProgress로 흘리고, 계약 에러(§2.4)를
 * UX 결정에 필요한 최소 형태로 접는다. 던지지 않는다(개별 실패는 failed 장수로만).
 */
export async function saveViaBridge(
  items: PhotoSaveItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<BridgeSaveOutcome> {
  const opId = newOpId()
  const unsubscribe = subscribeBridgeProgress(opId, ({ done, total }) => onProgress?.(done, total))
  try {
    const { saved, failed } = await savePhotos({
      opId,
      photos: items.map((item) => ({ url: item.url, fileName: item.filename })),
    })
    return { kind: 'done', saved, failed: failed.length }
  } catch (err) {
    if (err instanceof BridgeError && err.code === 'CANCELLED') {
      // 사용자 취소 — 공유 시트 닫기(AbortError)와 같은 무토스트 관용(계약 §2.4)
      return { kind: 'cancelled' }
    }
    if (err instanceof BridgeError && err.code === 'PERMISSION_DENIED') {
      const detail = err.detail as { canOpenSettings?: unknown } | null | undefined
      return { kind: 'permission', canOpenSettings: detail?.canOpenSettings === true }
    }
    return { kind: 'error' }
  } finally {
    unsubscribe()
  }
}
