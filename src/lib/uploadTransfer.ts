import { runWithConcurrency } from './concurrency'
import type { PresignFileRequest, PresignUpload } from '../types/api'

/**
 * 06-U 전송 구간(② presign → ③ S3 PUT)의 오케스트레이션(CHMO-693).
 *
 * 화면에서 떼어낸 이유는 둘이다 — 재시도·배치 경계 규칙을 node 테스트로 고정할 수 있고,
 * 네이티브 업로드 이전(CHMO-496·544) 때 갈아 끼울 지점이 한 곳으로 모인다.
 *
 * **여기서 하지 않는 것**: 총 전송량 줄이기. 사진을 축소하면 5배 빨라지지만 원본·EXIF가
 * 사라져 "원본 보존"(CHMO-544·686)과 부딪힌다 — 2026-08-14 원본 유지로 결정했다.
 * 그래서 이 모듈이 줄이는 건 시간이 아니라 **낭비**다(만료로 버려지는 업로드·전량 재시도).
 */

/**
 * presign을 끊어 받는 단위.
 *
 * 전량을 미리 발급하면 **presign URL TTL(600초, CHMO-499)** 안에 전송을 끝내야 하는데,
 * 선택 상한이 200장이라 느린 업링크에서는 10분을 넘긴다 — 뒤쪽 URL이 403으로 죽는다.
 * 배치로 끊으면 URL은 자기 배치를 올리는 동안만 살아 있으면 되고, 첫 PUT도 더 빨리 시작된다.
 */
export const PRESIGN_BATCH_SIZE = 30

/**
 * S3 PUT 동시 실행 수 — 브라우저의 호스트당 커넥션 한도(≈6)에 맞춘다.
 * S3 REST 엔드포인트는 HTTP/1.1이라 이 수를 더 올려도 초과분은 브라우저 큐에서 대기만 한다.
 */
export const UPLOAD_CONCURRENCY = 6

/** 장별 재시도 횟수(최초 시도 제외) */
export const UPLOAD_RETRY_LIMIT = 2

/** 재시도 대기 — 400ms → 1200ms */
const RETRY_BASE_DELAY_MS = 400

/** 업로드 대상 한 장. `F`로 열어 둔 건 node 테스트에서 File 없이 돌리기 위해서다 */
export interface TransferItem<F> {
  key: string
  file: F
  /** presign에 보낼 이름(확장자 보정본 — CHMO-597) */
  fileName: string
  size: number
}

export interface UploadTransferOptions<F> {
  items: TransferItem<F>[]
  /** presign 1회 — 응답 길이 검증은 호출부 몫(에러 문구를 화면이 소유한다) */
  presign: (files: PresignFileRequest[]) => Promise<PresignUpload[]>
  put: (upload: PresignUpload, file: F, signal?: AbortSignal) => Promise<void>
  /** 한 장 성공마다 — 호출부는 모아 뒀다 한꺼번에 반영한다(장수만큼의 리렌더 방지) */
  onUploaded?: (item: TransferItem<F>, s3Key: string) => void
  /** 누적 성공 장수 — 호출부가 throttle한다 */
  onProgress?: (done: number) => void
  signal?: AbortSignal
  batchSize?: number
  concurrency?: number
  retryLimit?: number
  /** 재시도 대기(테스트에서 즉시 반환으로 갈아 끼운다) */
  delay?: (ms: number) => Promise<void>
}

export interface UploadTransferResult<F> {
  /** 성공한 장의 key → s3Key */
  uploaded: Map<string, string>
  /** 재시도까지 실패해 이번 회차에서 빠진 장 */
  failed: TransferItem<F>[]
  /** 마지막 실패 원인 — 전량 실패일 때 호출부가 그대로 던진다 */
  lastError: unknown
  /** 올라간 바이트 합(계측용) */
  bytes: number
  presignMs: number
  putMs: number
}

/** 중단은 실패가 아니다 — 재시도하지 않고 그대로 위로 던진다 */
function isAbortError(err: unknown): boolean {
  return (err as { name?: unknown })?.name === 'AbortError'
}

/**
 * 다시 해 볼 값어치가 있는 실패인가.
 *
 * 4xx는 같은 요청을 다시 보내도 같은 답이 온다 — presign URL 만료(403)·서명 불일치가 여기고,
 * 재시도하면 장당 1.6초를 버리기만 한다. 상태 코드가 없는 실패(fetch의 네트워크 오류)는
 * 대부분 일시적이라 재시도한다.
 *
 * `ApiRequestError`를 import하지 않고 `status`만 덕타이핑하는 건 lib이 api를 향해 의존하지
 * 않기 위해서다(의존 방향은 api → lib).
 */
export function isRetriableTransferError(err: unknown): boolean {
  if (isAbortError(err)) return false
  const status = (err as { status?: unknown })?.status
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500
  return true
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

/** 지수 백오프 재시도 — 중단·비재시도 오류는 즉시 던진다 */
export async function withRetry<T>(
  task: () => Promise<T>,
  options: {
    limit: number
    signal?: AbortSignal
    delay?: (ms: number) => Promise<void>
    isRetriable?: (err: unknown) => boolean
  },
): Promise<T> {
  const isRetriable = options.isRetriable ?? isRetriableTransferError
  const delay = options.delay ?? wait
  let attempt = 0
  for (;;) {
    try {
      return await task()
    } catch (err) {
      if (options.signal?.aborted || attempt >= options.limit || !isRetriable(err)) throw err
      await delay(RETRY_BASE_DELAY_MS * 3 ** attempt)
      attempt += 1
    }
  }
}

/**
 * presign·PUT을 배치로 겹쳐 돌린다.
 *
 * 배치 k를 올리는 동안 배치 k+1의 presign을 미리 받아 둔다 — 발급 왕복이 전송 뒤에 숨는다.
 *
 * **실패 정책이 종전과 다르다**: 한 장이 실패해도 나머지를 계속 올린다(종전엔 전체 abort라
 * 네트워크가 한 번 튀면 이미 올린 것까지 버렸다). 끝내 실패한 장은 `failed`로 돌려주고,
 * 호출부가 성공분만 등록한 뒤 남은 장을 안내한다.
 *
 * presign 실패는 그대로 던진다 — 보호자 동의 게이트(AGREEMENT428, CHMO-516)가 이 경로로
 * 올라와 확인 모달이 돼야 하고, 여기서 삼키면 화면이 "일부만 올라감"으로 굳는다.
 */
export async function runUploadTransfer<F>(
  options: UploadTransferOptions<F>,
): Promise<UploadTransferResult<F>> {
  const { items, presign, put, onUploaded, onProgress, signal } = options
  const batches = chunkItems(items, options.batchSize ?? PRESIGN_BATCH_SIZE)
  const concurrency = options.concurrency ?? UPLOAD_CONCURRENCY
  const retryLimit = options.retryLimit ?? UPLOAD_RETRY_LIMIT
  const delay = options.delay

  const uploaded = new Map<string, string>()
  const failed: TransferItem<F>[] = []
  let lastError: unknown = null
  let bytes = 0
  let presignMs = 0
  let putMs = 0
  let done = 0

  const presignBatch = async (batch: TransferItem<F>[]): Promise<PresignUpload[]> => {
    const startedAt = now()
    try {
      return await withRetry(
        () => presign(batch.map((i) => ({ fileName: i.fileName, size: i.size }))),
        { limit: retryLimit, signal, delay },
      )
    } finally {
      presignMs += now() - startedAt
    }
  }

  // 첫 배치는 지금 발급하고, 이후 배치는 직전 배치 PUT이 시작될 때 미리 띄운다.
  // 미리 띄운 promise는 await까지 시간이 있어 catch를 붙여 둔다 — 안 붙이면 그 사이
  // 거부가 unhandledrejection으로 샌다(정작 던지는 건 아래 await 지점이다).
  let inflight: Promise<PresignUpload[]> | null = null
  if (batches.length > 0) {
    inflight = presignBatch(batches[0])
    inflight.catch(() => {})
  }

  for (let i = 0; i < batches.length; i += 1) {
    if (signal?.aborted) break
    const uploads = await inflight!
    inflight = i + 1 < batches.length ? presignBatch(batches[i + 1]) : null
    inflight?.catch(() => {})

    const batch = batches[i]
    const startedAt = now()
    await runWithConcurrency(
      uploads,
      concurrency,
      async (upload, index) => {
        const item = batch[index]
        try {
          await withRetry(() => put(upload, item.file, signal), { limit: retryLimit, signal, delay })
        } catch (err) {
          if (isAbortError(err)) throw err // 중단은 전체를 끊는다
          lastError = err
          failed.push(item)
          return
        }
        uploaded.set(item.key, upload.s3Key)
        bytes += item.size
        done += 1
        onUploaded?.(item, upload.s3Key)
        onProgress?.(done)
      },
      signal,
    )
    putMs += now() - startedAt
  }

  return { uploaded, failed, lastError, bytes, presignMs, putMs }
}
