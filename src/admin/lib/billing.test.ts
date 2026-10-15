/**
 * 장수·구독 기간 입력 규칙 테스트 (CHMO-931) — BE 검증(VALID400·CREDIT409)과 같은 판정을
 * 화면이 먼저 내리는지, KST 날짜 변환이 "종료일 포함" 약속을 지키는지 고정한다.
 */
import { describe, expect, it } from 'vitest'
import {
  accessUntilToKstDate,
  emptySubscriptionPeriodDraft,
  formatKrw,
  isKstDate,
  kstDateEndIso,
  kstDatePlusDays,
  kstDateStartIso,
  todayKstDate,
  validateCreditAdjust,
  validateSubscriptionPeriod,
} from './billing'

describe('KST 날짜 변환', () => {
  it('시작일은 그 날 0시, 종료일은 다음 날 0시(종료일 포함)로 +09:00을 붙여 보낸다', () => {
    expect(kstDateStartIso('2026-10-01')).toBe('2026-10-01T00:00:00+09:00')
    expect(kstDateEndIso('2026-11-30')).toBe('2026-12-01T00:00:00+09:00')
    // 월말·연말 경계도 Date 산술로 넘긴다
    expect(kstDateEndIso('2026-12-31')).toBe('2027-01-01T00:00:00+09:00')
  })

  it('형식이 아니거나 존재하지 않는 날짜는 null(2월 30일을 3월 2일로 넘기지 않는다)', () => {
    expect(isKstDate('2026-02-30')).toBe(false)
    expect(kstDateStartIso('2026-2-3')).toBeNull()
    expect(kstDateEndIso('')).toBeNull()
  })

  it('서버 accessUntil(배타적 끝)은 1ms 전의 KST 날짜로 되돌려 "그 날까지"로 읽는다', () => {
    expect(accessUntilToKstDate('2026-12-01T00:00:00+09:00')).toBe('2026-11-30')
    expect(accessUntilToKstDate('2026-11-30T15:00:00Z')).toBe('2026-11-30') // KST 11-30 00:00 → 11-29? 아니다: 15:00Z = KST 12-01 00:00
    expect(accessUntilToKstDate(null)).toBeNull()
  })

  it('오늘·n일 뒤는 KST 달력 기준이다(UTC 자정 전후에 하루가 어긋나지 않는다)', () => {
    // UTC 2026-10-14 16:00 = KST 2026-10-15 01:00
    expect(todayKstDate(new Date('2026-10-14T16:00:00Z'))).toBe('2026-10-15')
    expect(kstDatePlusDays('2026-10-15', 30)).toBe('2026-11-14')
    expect(kstDatePlusDays('bad', 30)).toBe('')
  })
})

describe('장수 조정 검증', () => {
  it('지급은 양수 delta, 회수는 음수 delta로 접고 메모는 trim한다', () => {
    expect(validateCreditAdjust({ mode: 'grant', amount: '100', memo: ' 고객 보상 ' }, 10).input).toEqual({
      delta: 100,
      memo: '고객 보상',
    })
    expect(validateCreditAdjust({ mode: 'revoke', amount: '5', memo: '오지급' }, 10).input).toEqual({
      delta: -5,
      memo: '오지급',
    })
  })

  it('회수가 잔액을 넘으면 보내기 전에 막는다(서버 CREDIT409를 미리 말한다)', () => {
    const { errors, input } = validateCreditAdjust({ mode: 'revoke', amount: '11', memo: 'x' }, 10)
    expect(input).toBeNull()
    expect(errors.amount).toContain('잔액(10장)')
    // 지급은 상한(500)을 넘어도 된다 — 스펙 3.5
    expect(validateCreditAdjust({ mode: 'grant', amount: '600', memo: 'x' }, 10).input?.delta).toBe(600)
  })

  it('0·소수·빈 메모·500자 초과는 각각 그 칸의 오류다', () => {
    expect(validateCreditAdjust({ mode: 'grant', amount: '0', memo: 'x' }, 0).errors.amount).toBeTruthy()
    expect(validateCreditAdjust({ mode: 'grant', amount: '1.5', memo: 'x' }, 0).errors.amount).toBeTruthy()
    expect(validateCreditAdjust({ mode: 'grant', amount: '1', memo: '   ' }, 0).errors.memo).toBeTruthy()
    expect(
      validateCreditAdjust({ mode: 'grant', amount: '1', memo: 'a'.repeat(501) }, 0).errors.memo,
    ).toContain('500자')
  })
})

describe('기관 구독 기간 검증', () => {
  const base = emptySubscriptionPeriodDraft(
    { amountKrw: '100000', payerName: ' 치즈유치원 ', invoiceNo: '', memo: '' },
    new Date('2026-10-14T16:00:00Z'), // KST 2026-10-15
  )

  it('빈 초안은 오늘 시작·30일 뒤 종료·오늘 입금', () => {
    expect(base.accessFromDate).toBe('2026-10-15')
    expect(base.accessUntilDate).toBe('2026-11-14')
    expect(base.paidOn).toBe('2026-10-15')
  })

  it('유효하면 Instant(+09:00)·정수 원화·trim한 이름·빈 선택 칸은 null로 접는다', () => {
    expect(validateSubscriptionPeriod(base).input).toEqual({
      accessFrom: '2026-10-15T00:00:00+09:00',
      accessUntil: '2026-11-15T00:00:00+09:00',
      amountKrw: 100000,
      paidOn: '2026-10-15',
      payerName: '치즈유치원',
      invoiceNo: null,
      memo: null,
    })
  })

  it('같은 날 시작·종료는 허용(하루짜리)이고, 종료가 시작보다 앞서면 종료일 칸 오류', () => {
    expect(validateSubscriptionPeriod({ ...base, accessUntilDate: '2026-10-15' }).input).not.toBeNull()
    const { errors, input } = validateSubscriptionPeriod({ ...base, accessUntilDate: '2026-10-14' })
    expect(input).toBeNull()
    expect(errors.accessUntilDate).toBe('종료일이 시작일보다 앞서요.')
  })

  it('입금액 0은 허용(무상)이고 음수·빈 값·빈 입금자명은 오류', () => {
    expect(validateSubscriptionPeriod({ ...base, amountKrw: '0' }).input?.amountKrw).toBe(0)
    expect(validateSubscriptionPeriod({ ...base, amountKrw: '-1' }).errors.amountKrw).toBeTruthy()
    expect(validateSubscriptionPeriod({ ...base, amountKrw: '' }).errors.amountKrw).toBeTruthy()
    expect(validateSubscriptionPeriod({ ...base, payerName: '' }).errors.payerName).toBeTruthy()
  })

  it('원화 표기는 천 단위 구분 + 원', () => {
    expect(formatKrw(100000)).toBe('100,000원')
    expect(formatKrw(0)).toBe('0원')
  })
})
