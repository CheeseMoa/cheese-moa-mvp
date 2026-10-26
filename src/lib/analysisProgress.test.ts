import { describe, expect, it } from 'vitest'
import { advanceAnalysisProgress } from './analysisProgress'

describe('advanceAnalysisProgress', () => {
  it('서버 진행률이 없으면 예상값을 만들지 않는다', () => {
    expect(advanceAnalysisProgress(0, null)).toBe(0)
    expect(advanceAnalysisProgress(0, 0)).toBe(0)
  })

  it('최신 서버 값에 빠르게 접근하되 넘지 않는다', () => {
    let displayed = 0
    for (let tick = 0; tick < 20; tick += 1) {
      displayed = advanceAnalysisProgress(displayed, 37)
      expect(displayed).toBeLessThanOrEqual(37)
    }
    expect(displayed).toBe(37)
  })

  it('늦게 도착한 낮은 값에 역행하지 않는다', () => {
    expect(advanceAnalysisProgress(64, 31)).toBe(64)
  })
})
