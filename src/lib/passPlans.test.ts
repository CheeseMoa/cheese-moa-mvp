import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatMoney,
  formatRate,
  newIdempotencyKey,
  passHoursLabel,
  passPlanName,
} from './passPlans'
import { businessInfoRows, isBusinessInfoComplete, refundMailHref, telHref } from '../legal/business'
import { refundPolicy } from '../legal/refund'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('이용권 표기 (CHMO-899)', () => {
  it('금액은 표기만 한다 — KRW 원 단위, USD 소수 둘째 자리', () => {
    expect(formatMoney(2138, 'KRW')).toBe('2,138원')
    expect(formatMoney(1.5, 'USD')).toBe('US$1.50')
    expect(formatMoney(1, 'USD')).toBe('US$1.00')
    expect(formatRate(1425.31)).toBe('1,425.31원')
  })

  it('상품 이름 — 미지 코드는 일수로 짓는다', () => {
    expect(passPlanName('DAY_3')).toBe('3일 이용권')
    expect(passPlanName('DAY_30', 30)).toBe('30일 이용권')
    expect(passHoursLabel(7)).toBe('168시간')
  })

  it('멱등키는 UUID v4 36자 — randomUUID가 없는 브라우저도 같은 형식', () => {
    expect(newIdempotencyKey()).toMatch(UUID_V4)
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.map((_, i) => (i * 37 + 11) % 256),
    })
    const fallback = newIdempotencyKey()
    expect(fallback).toHaveLength(36)
    expect(fallback).toMatch(UUID_V4)
  })
})

describe('사업자 정보 (CHMO-899)', () => {
  const full = {
    companyName: '치즈모아',
    representative: '홍길동',
    registrationNumber: '123-45-67890',
    mailOrderNumber: '제2026-서울강남-0000호',
    address: '서울특별시',
    phone: '02-000-0000',
    email: 'cheesemoa03@gmail.com',
  }

  it('빈 항목은 행째 뺀다 — placeholder를 그리지 않는다', () => {
    const rows = businessInfoRows({ ...full, representative: '', phone: '  ' })
    expect(rows.map((r) => r.key)).not.toContain('representative')
    expect(rows.map((r) => r.key)).not.toContain('phone')
    expect(isBusinessInfoComplete({ ...full, representative: '' })).toBe(false)
    expect(isBusinessInfoComplete(full)).toBe(true)
  })

  it('전화 링크는 숫자만, 환불 메일은 주문번호를 미리 채운다', () => {
    expect(telHref('02-000-0000')).toBe('tel:020000000')
    const href = refundMailHref('pass_3f2a')
    expect(href.startsWith('mailto:cheesemoa03@gmail.com?subject=')).toBe(true)
    expect(decodeURIComponent(href)).toContain('주문번호: pass_3f2a')
  })
})

describe('환불정책 앱판 (CHMO-899)', () => {
  it('정본 마커·대괄호 placeholder를 노출하지 않는다(AC-7)', () => {
    const text = JSON.stringify(refundPolicy)
    expect(text).not.toMatch(/\[\[/)
    expect(text).not.toMatch(/결정필요|검토필요|준비 중|TODO/)
  })

  it('티켓 필수 항목 — 7일 전액·비례 환불·중복/오류·회사 귀책·소요 기간·신청 채널·자동 갱신 없음', () => {
    const text = JSON.stringify(refundPolicy)
    for (const phrase of [
      '7일 이내',
      '남은 이용 시간에 비례',
      '두 번 이상 결제',
      '회사의 책임 있는 사유',
      '영업일 기준 3~7일',
      '고객센터 이메일',
      '주문번호',
      '자동으로 갱신되거나 다시 결제되지 않습니다',
    ]) {
      expect(text).toContain(phrase)
    }
  })
})
