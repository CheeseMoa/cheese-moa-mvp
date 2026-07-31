import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SHARE_BATCH_MAX,
  bridgeSaveSupported,
  fetchAsFiles,
  saveViaBridge,
  splitIntoBatches,
} from './photoSave'
import { __resetBridgeStateForTest } from '../native/bridge'

/**
 * 앨범 저장 파이프라인(CHMO-473)의 순수부 고정.
 * 공유 시트(navigator.share)·앵커 다운로드는 브라우저 전용이라 여기서 다루지 않는다 —
 * 선요청(fetchAsFiles)의 CORS 캐시 규칙(CHMO-326)과 배치 분할 계약만 지킨다.
 * 앱(웹뷰) 경로(CHMO-540)는 브리지를 스텁해 위임 계약을 고정한다(bridge.test.ts 관례).
 */

function imageResponse(type: string): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'Content-Type': type },
  })
}

const file = (name: string) => new File([new Uint8Array(1)], name, { type: 'image/jpeg' })

describe('splitIntoBatches', () => {
  it('상한 이하는 한 배치, 초과분은 순서를 지키며 넘긴다', () => {
    expect(splitIntoBatches([])).toEqual([])

    const exact = Array.from({ length: SHARE_BATCH_MAX }, (_, i) => file(`${i}.jpg`))
    expect(splitIntoBatches(exact)).toHaveLength(1)

    const over = [...exact, file('last.jpg')]
    const batches = splitIntoBatches(over)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(SHARE_BATCH_MAX)
    expect(batches[1].map((f) => f.name)).toEqual(['last.jpg'])
  })
})

describe('fetchAsFiles', () => {
  it('no-store로 요청하고(CHMO-326 캐시 함정) 확장자를 blob MIME에 맞춘다', async () => {
    const inits: (RequestInit | undefined)[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      inits.push(init)
      return imageResponse('image/png')
    })

    const progress: [number, number][] = []
    const { files, failed } = await fetchAsFiles(
      [{ url: 'https://cdn.example/a', filename: '101.jpg' }],
      (done, total) => progress.push([done, total]),
    )

    expect(inits[0]?.cache).toBe('no-store')
    expect(failed).toBe(0)
    // 파일명 확장자가 실제 MIME(png)으로 바로잡힌다 — 공유 시트가 타입으로 저장 동작을 정한다
    expect(files.map((f) => f.name)).toEqual(['101.png'])
    expect(files[0].type).toBe('image/png')
    expect(progress).toEqual([[1, 1]])
  })

  it('일부 실패는 장수만 세고 성공분을 원래 순서로 돌려준다', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('broken') ? new Response(null, { status: 404 }) : imageResponse('image/jpeg'),
    )

    const { files, failed } = await fetchAsFiles([
      { url: 'https://cdn.example/1', filename: '1.jpg' },
      { url: 'https://cdn.example/broken', filename: '2.jpg' },
      { url: 'https://cdn.example/3', filename: '3.jpg' },
    ])

    expect(failed).toBe(1)
    expect(files.map((f) => f.name)).toEqual(['1.jpg', '3.jpg'])
  })

  it('네트워크 예외도 실패 집계로 흡수한다 — 파이프라인은 성공분으로 계속 간다', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network error')
    })

    const { files, failed } = await fetchAsFiles([
      { url: 'https://cdn.example/1', filename: '1.jpg' },
    ])

    expect(files).toEqual([])
    expect(failed).toBe(1)
  })
})

// ── 앱(웹뷰) 경로 (CHMO-540) ──────────────────────────────────────────────

const APP_UA = 'Mozilla/5.0 (Linux; Android 14) CheeseMoaApp/1.2.0 (android) Bridge/1'

type TestWindow = EventTarget & {
  flutter_inappwebview?: { callHandler: ReturnType<typeof vi.fn> }
}

interface BridgeCallRequest {
  v: number
  method: string
  params?: unknown
}

/** 앱 UA + 주입 객체 스텁 — respond가 요청 봉투를 받아 응답 봉투를 돌려준다 */
function stubBridge(respond: (request: BridgeCallRequest) => unknown): TestWindow {
  vi.stubGlobal('navigator', { userAgent: APP_UA })
  const w = new EventTarget() as TestWindow
  w.flutter_inappwebview = {
    callHandler: vi.fn(async (_name: string, request: unknown) =>
      respond(request as BridgeCallRequest),
    ),
  }
  vi.stubGlobal('window', w)
  return w
}

describe('bridgeSaveSupported', () => {
  beforeEach(() => __resetBridgeStateForTest())

  it('앱 + savePhotos capability일 때만 참', async () => {
    stubBridge(() => ({
      ok: true,
      result: {
        v: 1,
        platform: 'android',
        appVersion: '1.2.0',
        capabilities: ['socialLogin', 'savePhotos'],
      },
    }))
    await expect(bridgeSaveSupported()).resolves.toBe(true)
  })

  it('웹 단독(마커 없음)은 브리지를 부르지 않고 거짓 — 기존 경로 그대로', async () => {
    const w = stubBridge(() => ({ ok: true, result: {} }))
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Safari/605.1.15' })
    await expect(bridgeSaveSupported()).resolves.toBe(false)
    expect(w.flutter_inappwebview!.callHandler).not.toHaveBeenCalled()
  })

  it('구버전 앱(capability 없음)은 거짓 — 웹 경로 폴백(계약 §1-6)', async () => {
    stubBridge(() => ({
      ok: true,
      result: { v: 1, platform: 'ios', appVersion: '1.0.0', capabilities: ['socialLogin'] },
    }))
    await expect(bridgeSaveSupported()).resolves.toBe(false)
  })
})

describe('saveViaBridge', () => {
  beforeEach(() => __resetBridgeStateForTest())

  const items = [
    { url: 'https://cdn.example/a.jpg', filename: '101.jpg' },
    { url: 'https://cdn.example/b.jpg', filename: '102.jpg' },
  ]

  it('opId를 실어 url·fileName 목록으로 위임하고 진행 이벤트를 onProgress로 흘린다', async () => {
    const w = stubBridge((request) => {
      const { opId } = request.params as { opId: string }
      // 셸은 응답 전에 진행 스트림을 쏜다(계약 §2.3)
      for (const done of [1, 2]) {
        w.dispatchEvent(
          new CustomEvent('cheesemoa:event', {
            detail: { v: 1, type: 'progress', opId, done, total: 2 },
          }),
        )
      }
      return { ok: true, result: { saved: 2, failed: [] } }
    })

    const progress: [number, number][] = []
    const outcome = await saveViaBridge(items, (done, total) => progress.push([done, total]))

    expect(outcome).toEqual({ kind: 'done', saved: 2, failed: 0 })
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ])
    const [name, request] = w.flutter_inappwebview!.callHandler.mock.calls[0] as [
      string,
      BridgeCallRequest,
    ]
    expect(name).toBe('cheesemoa')
    expect(request).toMatchObject({
      v: 1,
      method: 'savePhotos',
      params: {
        photos: [
          { url: 'https://cdn.example/a.jpg', fileName: '101.jpg' },
          { url: 'https://cdn.example/b.jpg', fileName: '102.jpg' },
        ],
      },
    })
    const { opId } = request.params as { opId: string }
    expect(opId).toEqual(expect.any(String))

    // 완료 후 진행 구독은 해제된다 — 늦은 이벤트가 UI를 흔들지 않게
    w.dispatchEvent(
      new CustomEvent('cheesemoa:event', {
        detail: { v: 1, type: 'progress', opId, done: 3, total: 3 },
      }),
    )
    expect(progress).toHaveLength(2)
  })

  it('부분 실패는 장수로 접는다 — 성공분 저장은 셸이 이미 끝냈다', async () => {
    stubBridge(() => ({
      ok: true,
      result: { saved: 1, failed: [{ url: 'https://cdn.example/b.jpg', code: 'NETWORK' }] },
    }))
    await expect(saveViaBridge(items)).resolves.toEqual({ kind: 'done', saved: 1, failed: 1 })
  })

  it('권한 거부는 canOpenSettings까지 전달한다(계약 §2.4 — 안내 + 설정 열기)', async () => {
    stubBridge(() => ({
      ok: false,
      code: 'PERMISSION_DENIED',
      detail: { canOpenSettings: true },
    }))
    await expect(saveViaBridge(items)).resolves.toEqual({
      kind: 'permission',
      canOpenSettings: true,
    })
  })

  it('권한 거부인데 detail이 없으면 canOpenSettings=false로 안전하게 접는다', async () => {
    stubBridge(() => ({ ok: false, code: 'PERMISSION_DENIED' }))
    await expect(saveViaBridge(items)).resolves.toEqual({
      kind: 'permission',
      canOpenSettings: false,
    })
  })

  it('사용자 취소는 cancelled — 무토스트 여부는 훅이 정한다', async () => {
    stubBridge(() => ({ ok: false, code: 'CANCELLED' }))
    await expect(saveViaBridge(items)).resolves.toEqual({ kind: 'cancelled' })
  })

  it('그 외 실패는 error로 접는다 — 던지지 않는다', async () => {
    stubBridge(() => ({ ok: false, code: 'INTERNAL', message: '셸 내부 오류' }))
    await expect(saveViaBridge(items)).resolves.toEqual({ kind: 'error' })
  })
})
