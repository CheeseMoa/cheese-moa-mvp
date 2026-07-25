import { describe, expect, it } from 'vitest'
import { GENERIC_UNCERTAIN_MESSAGE, uncertainCauseMessages } from './uncertainCauses'

describe('uncertainCauseMessages (CHMO-412)', () => {
  it('low_resolution이 있으면 항상 동반되는 small_faces 문구는 중복이라 뺀다', () => {
    const messages = uncertainCauseMessages(['low_resolution', 'small_faces'])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('원본 화질')
  })

  it('코드마다 각자 문구 — small_faces·single_appearance는 함께 나올 수 있다', () => {
    expect(uncertainCauseMessages(['small_faces', 'single_appearance'])).toHaveLength(2)
  })

  it('미지 코드는 무시하고, 남는 문구가 없으면 범용 문구로 수렴한다(AI 코드 추가 대비 관용)', () => {
    expect(uncertainCauseMessages(['future_new_code'])).toEqual([GENERIC_UNCERTAIN_MESSAGE])
    expect(uncertainCauseMessages([])).toEqual([GENERIC_UNCERTAIN_MESSAGE])
    expect(uncertainCauseMessages(undefined)).toEqual([GENERIC_UNCERTAIN_MESSAGE])
    // 미지 코드가 섞여도 아는 코드 문구는 그대로
    expect(uncertainCauseMessages(['future_new_code', 'small_faces'])).toHaveLength(1)
  })
})
