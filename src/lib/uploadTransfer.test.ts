import { describe, expect, it } from 'vitest'

import {
  chunkItems,
  isRetriableTransferError,
  runUploadTransfer,
  withRetry,
  type TransferItem,
} from './uploadTransfer'
import type { PresignFileRequest, PresignUpload } from '../types/api'

/** 테스트용 파일 대역 — node 환경이라 File을 쓰지 않는다 */
type Fake = { id: string }

function items(count: number): TransferItem<Fake>[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `k${i}`,
    file: { id: `k${i}` },
    fileName: `p${i}.jpg`,
    size: 1000 + i,
  }))
}

function presignOf(files: PresignFileRequest[]): PresignUpload[] {
  return files.map((f) => ({
    s3Key: `s3/${f.fileName}`,
    uploadUrl: `https://s3.test/${f.fileName}`,
    contentType: 'image/jpeg',
  }))
}

/** 재시도 대기를 없앤다 — 테스트가 백오프만큼 멈추면 안 된다 */
const noDelay = () => Promise.resolve()

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status })

describe('chunkItems', () => {
  it('마지막 배치는 남는 만큼만 담는다', () => {
    expect(chunkItems([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    expect(chunkItems([], 3)).toEqual([])
  })
})

describe('isRetriableTransferError', () => {
  it('4xx는 다시 보내도 같은 답이라 재시도하지 않는다 — presign URL 만료(403)가 여기다', () => {
    expect(isRetriableTransferError(httpError(403))).toBe(false)
    expect(isRetriableTransferError(httpError(400))).toBe(false)
  })

  it('5xx·429·408과 상태 코드 없는 네트워크 오류는 재시도한다', () => {
    expect(isRetriableTransferError(httpError(500))).toBe(true)
    expect(isRetriableTransferError(httpError(429))).toBe(true)
    expect(isRetriableTransferError(httpError(408))).toBe(true)
    expect(isRetriableTransferError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('중단(AbortError)은 실패가 아니라 취소라 재시도하지 않는다', () => {
    expect(isRetriableTransferError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(
      false,
    )
  })
})

describe('withRetry', () => {
  it('한도까지 다시 시도하고 그 뒤엔 마지막 오류를 던진다', async () => {
    let calls = 0
    const task = async () => {
      calls += 1
      throw httpError(500)
    }
    await expect(withRetry(task, { limit: 2, delay: noDelay })).rejects.toMatchObject({ status: 500 })
    expect(calls).toBe(3) // 최초 1 + 재시도 2
  })

  it('재시도 대상이 아니면 즉시 던진다', async () => {
    let calls = 0
    const task = async () => {
      calls += 1
      throw httpError(403)
    }
    await expect(withRetry(task, { limit: 5, delay: noDelay })).rejects.toMatchObject({ status: 403 })
    expect(calls).toBe(1)
  })
})

describe('runUploadTransfer', () => {
  it('presign을 배치 단위로 끊어 받는다 — 전량 선발급이면 TTL(600초) 안에 못 끝낸다', async () => {
    const calls: number[] = []
    const result = await runUploadTransfer<Fake>({
      items: items(7),
      batchSize: 3,
      delay: noDelay,
      presign: async (files) => {
        calls.push(files.length)
        return presignOf(files)
      },
      put: async () => {},
    })
    expect(calls).toEqual([3, 3, 1])
    expect(result.uploaded.size).toBe(7)
    expect(result.failed).toEqual([])
    expect(result.uploaded.get('k0')).toBe('s3/p0.jpg')
  })

  it('다음 배치 presign이 이번 배치 PUT과 겹쳐 돈다 — 발급 왕복이 전송 뒤에 숨는다', async () => {
    let presignCalls = 0
    let seenDuringFirstBatch = 0
    await runUploadTransfer<Fake>({
      items: items(4),
      batchSize: 2,
      concurrency: 1,
      delay: noDelay,
      presign: async (files) => {
        presignCalls += 1
        return presignOf(files)
      },
      put: async (_upload, file) => {
        // 첫 배치를 올리는 시점에 이미 두 번째 presign이 나가 있어야 한다
        if (file.id === 'k0' || file.id === 'k1') seenDuringFirstBatch = presignCalls
      },
    })
    expect(seenDuringFirstBatch).toBe(2)
  })

  it('한 장이 실패해도 나머지를 계속 올리고 실패분만 돌려준다', async () => {
    const result = await runUploadTransfer<Fake>({
      items: items(5),
      batchSize: 5,
      delay: noDelay,
      presign: async (files) => presignOf(files),
      put: async (_upload, file) => {
        if (file.id === 'k2') throw httpError(500)
      },
    })
    expect(result.uploaded.size).toBe(4)
    expect(result.failed.map((f) => f.key)).toEqual(['k2'])
    expect(result.lastError).toMatchObject({ status: 500 })
    // 성공분 바이트만 센다(계측 기준선)
    expect(result.bytes).toBe(1000 + 1001 + 1003 + 1004)
  })

  it('일시적 실패는 장별로 재시도해 결국 성공시킨다', async () => {
    let attempts = 0
    const result = await runUploadTransfer<Fake>({
      items: items(1),
      delay: noDelay,
      presign: async (files) => presignOf(files),
      put: async () => {
        attempts += 1
        if (attempts < 3) throw httpError(503)
      },
    })
    expect(attempts).toBe(3)
    expect(result.uploaded.size).toBe(1)
    expect(result.failed).toEqual([])
  })

  it('presign 실패는 삼키지 않고 던진다 — 보호자 동의 게이트(428)가 모달이 돼야 한다', async () => {
    await expect(
      runUploadTransfer<Fake>({
        items: items(2),
        delay: noDelay,
        presign: async () => {
          throw httpError(428)
        },
        put: async () => {},
      }),
    ).rejects.toMatchObject({ status: 428 })
  })

  it('진행 콜백은 성공한 장수만 누적한다', async () => {
    const progress: number[] = []
    await runUploadTransfer<Fake>({
      items: items(3),
      batchSize: 2,
      concurrency: 1,
      delay: noDelay,
      presign: async (files) => presignOf(files),
      put: async (_upload, file) => {
        if (file.id === 'k1') throw httpError(500)
      },
      onProgress: (done) => progress.push(done),
    })
    expect(progress).toEqual([1, 2])
  })

  it('중단되면 남은 배치를 새로 시작하지 않는다', async () => {
    const controller = new AbortController()
    let puts = 0
    await expect(
      runUploadTransfer<Fake>({
        items: items(6),
        batchSize: 2,
        concurrency: 1,
        signal: controller.signal,
        delay: noDelay,
        presign: async (files) => presignOf(files),
        put: async () => {
          puts += 1
          if (puts === 2) controller.abort()
        },
      }),
    ).resolves.toMatchObject({ failed: [] })
    expect(puts).toBe(2)
  })
})
