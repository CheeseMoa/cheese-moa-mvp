/**
 * 기간 이용권 결제 계약 테스트 (CHMO-899 — BE CHMO-847).
 *
 * 지키는 명제 셋:
 * ① **금액은 손대지 않는다** — 주문 응답의 amount·currency·orderId·clientKey가 그대로 화면에 온다
 *    (결제창에 넘기는 값이 주문 응답과 같아야 한다 — CHMO-898 AC-7).
 * ② 멱등키는 헤더로, 시장은 대문자로 보낸다(BE 검증 — 어긋나면 VALID400).
 * ③ 공개 요금 안내의 카탈로그(로그인 전이라 서버를 못 부른다)가 BE 상품과 같은 가격·기간이다 —
 *    어긋나면 공개 표시가와 결제창 금액이 달라져 심사 탈락 사유가 된다.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { confirmPassOrder, getCurrentPass, listPassPlans, preparePassOrder } from './billing'
import { ApiRequestError } from './client'
import { setAuthTokens } from '../lib/auth'
import { PASS_CATALOG } from '../lib/passPlans'
import {
  BE_PASS_CONFIRM,
  BE_PASS_CURRENT,
  BE_PASS_ORDER_DOMESTIC,
  BE_PASS_ORDER_INTERNATIONAL,
  BE_PASS_PLANS,
  envelope,
  errorEnvelope,
} from '../test/fixtures/be'
import { bodyOf, jsonResponse, stubFetch } from '../test/http'

function serve(payload: unknown, status = 200) {
  return stubFetch(() => jsonResponse(payload, status))
}

const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e'

beforeEach(() => {
  setAuthTokens({ accessToken: 'at', refreshToken: 'rt' })
})

describe('기간 이용권 — 상품', () => {
  it('상품 목록을 그대로 읽는다', async () => {
    const calls = serve(envelope(BE_PASS_PLANS))
    const plans = await listPassPlans(7)
    expect(calls[0].url).toBe('/api/v1/groups/7/passes/plans')
    expect(plans).toEqual([
      { code: 'DAY_1', durationDays: 1, usdAmount: 1 },
      { code: 'DAY_3', durationDays: 3, usdAmount: 1.5 },
      { code: 'DAY_7', durationDays: 7, usdAmount: 2.5 },
    ])
  })

  it('공개 요금 안내 카탈로그가 BE 상품과 같은 가격·기간이다(표시가 = 결제가)', () => {
    expect(
      PASS_CATALOG.map(({ code, durationDays, usdAmount }) => ({ code, durationDays, usdAmount })),
    ).toEqual(BE_PASS_PLANS)
    // 이용 시간은 승인 시점부터 정확히 일수 × 24시간(BE가 Instant에 더한다)
    for (const plan of PASS_CATALOG) expect(plan.hours).toBe(plan.durationDays * 24)
  })
})

describe('기간 이용권 — 주문 준비', () => {
  it('멱등키를 헤더로, 시장을 대문자로 보낸다', async () => {
    const calls = serve(envelope(BE_PASS_ORDER_DOMESTIC, 'COMMON201'), 201)
    await preparePassOrder(7, { planCode: 'DAY_3', market: 'domestic' }, KEY)
    expect(calls[0].url).toBe('/api/v1/groups/7/pass-orders')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers.get('Idempotency-Key')).toBe(KEY)
    expect(bodyOf(calls[0])).toEqual({ planCode: 'DAY_3', market: 'DOMESTIC' })
  })

  it('국내 주문 — 서버가 확정한 원화 금액·환율을 바꾸지 않고 싣는다', async () => {
    serve(envelope(BE_PASS_ORDER_DOMESTIC, 'COMMON201'), 201)
    const order = await preparePassOrder(7, { planCode: 'DAY_3', market: 'domestic' }, KEY)
    expect(order).toEqual({
      orderId: 'pass_3f2a',
      orderName: 'CheeseMoa 3일 이용권',
      clientKey: 'test_ck_<krw>',
      planCode: 'DAY_3',
      market: 'domestic',
      amount: 2138,
      currency: 'KRW',
      usdAmount: 1.5,
      usdKrwRate: 1425.31,
      rateDate: '2026-10-02',
      expiresAt: '2026-10-02T07:30:00Z',
    })
  })

  it('해외 주문 — 생략된 환율 필드는 null, 금액은 USD 소수 그대로', async () => {
    serve(envelope(BE_PASS_ORDER_INTERNATIONAL, 'COMMON201'), 201)
    const order = await preparePassOrder(7, { planCode: 'DAY_3', market: 'international' }, KEY)
    expect(order.market).toBe('international')
    expect(order.amount).toBe(1.5)
    expect(order.currency).toBe('USD')
    expect(order.usdKrwRate).toBeNull()
    expect(order.rateDate).toBeNull()
  })

  it('결제 서비스 비활성(BILLING503)은 의미 코드로 정규화된다', async () => {
    serve(errorEnvelope('BILLING503', '결제 설정이 비활성화되어 있습니다.'), 503)
    await expect(
      preparePassOrder(7, { planCode: 'DAY_1', market: 'domestic' }, KEY),
    ).rejects.toMatchObject({ code: 'BILLING_UNAVAILABLE', status: 503 })
  })
})

describe('기간 이용권 — 승인·현재 이용권', () => {
  it('승인 — orderId를 경로에 인코딩하고 paymentKey만 본문에 싣는다', async () => {
    const calls = serve(envelope(BE_PASS_CONFIRM))
    const result = await confirmPassOrder(7, 'pass_3f2a', 'tgen_abc')
    expect(calls[0].url).toBe('/api/v1/groups/7/pass-orders/pass_3f2a/confirm')
    expect(bodyOf(calls[0])).toEqual({ paymentKey: 'tgen_abc' })
    expect(result).toEqual({
      orderId: 'pass_3f2a',
      status: 'SUCCEEDED',
      planCode: 'DAY_3',
      amount: 2138,
      currency: 'KRW',
      approvedAt: '2026-10-02T07:03:00Z',
      accessFrom: '2026-10-02T07:03:00Z',
      accessUntil: '2026-10-05T07:03:00Z',
    })
  })

  it('승인 결과 불명확(BILLING502)과 만료·충돌(BILLING409)을 가른다', async () => {
    serve(errorEnvelope('BILLING502', '결제사 통신에 실패했습니다.'), 502)
    await expect(confirmPassOrder(7, 'pass_3f2a', 'tgen_abc')).rejects.toMatchObject({
      code: 'PAYMENT_GATEWAY_ERROR',
    })
    serve(errorEnvelope('BILLING409', '만료된 주문입니다.'), 409)
    await expect(confirmPassOrder(7, 'pass_3f2a', 'tgen_abc')).rejects.toBeInstanceOf(
      ApiRequestError,
    )
    await expect(confirmPassOrder(7, 'pass_3f2a', 'tgen_abc')).rejects.toMatchObject({
      code: 'PAYMENT_CONFLICT',
    })
  })

  it('현재 이용권 — 있으면 그대로, 구매 이력이 없어 result가 생략되면 null', async () => {
    serve(envelope(BE_PASS_CURRENT))
    expect(await getCurrentPass(7)).toEqual({ active: true, accessUntil: '2026-10-05T07:03:00Z' })
    serve({ isSuccess: true, code: 'COMMON200', message: '성공입니다.' })
    expect(await getCurrentPass(7)).toBeNull()
  })
})
