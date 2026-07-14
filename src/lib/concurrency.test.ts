import { describe, expect, it } from 'vitest'
import { runWithConcurrency } from './concurrency'

/** 한 마이크로태스크가 아니라 실제 틱을 넘겨야 워커들이 서로 겹친다 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('runWithConcurrency', () => {
  it('동시 실행이 limit을 넘지 않는다 — 브라우저 커넥션 고갈 방지', async () => {
    let active = 0
    let peak = 0

    await runWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        active += 1
        peak = Math.max(peak, active)
        await tick()
        active -= 1
      },
    )

    expect(peak).toBe(3)
  })

  it('모든 항목을 인덱스와 함께 정확히 한 번씩 처리한다', async () => {
    const seen: Array<[string, number]> = []

    await runWithConcurrency(['a', 'b', 'c'], 2, async (item, index) => {
      await tick()
      seen.push([item, index])
    })

    expect(seen).toHaveLength(3)
    expect(seen.sort()).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
  })

  it('항목이 없으면 task를 부르지 않는다', async () => {
    let called = 0
    await runWithConcurrency([], 6, async () => {
      called += 1
    })
    expect(called).toBe(0)
  })

  it('limit이 항목 수보다 커도 워커는 항목 수만큼만 뜬다', async () => {
    let peak = 0
    let active = 0

    await runWithConcurrency([1, 2], 6, async () => {
      active += 1
      peak = Math.max(peak, active)
      await tick()
      active -= 1
    })

    expect(peak).toBe(2)
  })

  it('첫 실패의 예외로 reject한다', async () => {
    await expect(
      runWithConcurrency([1, 2, 3], 2, async (item) => {
        await tick()
        if (item === 1) throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })

  /**
   * 06-U가 task 안에서 controller.abort()를 부르는 이유 — 실패했다고 남은 PUT이 저절로
   * 멈추지 않는다. 중단은 signal의 몫이다.
   */
  it('signal이 끊기면 남은 항목은 시작되지 않는다', async () => {
    const controller = new AbortController()
    const started: number[] = []

    const run = runWithConcurrency(
      [0, 1, 2, 3, 4, 5],
      2,
      async (item) => {
        started.push(item)
        await tick()
        if (item === 0) {
          controller.abort()
          throw new Error('boom')
        }
      },
      controller.signal,
    )

    await expect(run).rejects.toThrow('boom')
    expect(started).toEqual([0, 1])
  })

  it('signal이 없으면 첫 실패 뒤에도 다른 워커가 남은 항목을 계속 집는다', async () => {
    const started: number[] = []

    await expect(
      runWithConcurrency([0, 1, 2, 3], 2, async (item) => {
        started.push(item)
        await tick()
        if (item === 0) throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // reject 시점엔 아직 진행 중 — 살아남은 워커가 끝까지 도는 걸 확인한다
    await tick()
    await tick()
    await tick()
    expect(started).toEqual([0, 1, 2, 3])
  })
})
