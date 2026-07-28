import { describe, expect, it, vi } from 'vitest'
import { SHARE_BATCH_MAX, fetchAsFiles, splitIntoBatches } from './photoSave'

/**
 * 앨범 저장 파이프라인(CHMO-473)의 순수부 고정.
 * 공유 시트(navigator.share)·앵커 다운로드는 브라우저 전용이라 여기서 다루지 않는다 —
 * 선요청(fetchAsFiles)의 CORS 캐시 규칙(CHMO-326)과 배치 분할 계약만 지킨다.
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
  it("no-store로 요청하고(CHMO-326 캐시 함정) 확장자를 blob MIME에 맞춘다", async () => {
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
