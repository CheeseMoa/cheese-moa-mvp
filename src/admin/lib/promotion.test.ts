import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_FOOTER,
  adBody,
  adTitle,
  campaignPayloadBytes,
  createIdempotencyKeeper,
  dateToKstInput,
  isCampaignDaytime,
  isHttpsLink,
  isOffPopupRatio,
  isValidAppVersion,
  isoToKstInput,
  kstInputToIso,
  nextCampaignDaytime,
} from './promotion'

/**
 * 이벤트 팝업·혜택 푸시 규칙(CHMO-928) — BE CHMO-926 소스의 거울.
 * 요점은 "화면이 먼저 막는 판정이 서버 판정과 같은가": 어긋나면 화면은 통과시키고 서버가
 * 뭉뚱그린 POPUP400·CAMPAIGN400을 준다(무엇이 틀렸는지 운영자가 알 수 없다).
 */
describe('https 링크 (BE HttpsLink)', () => {
  it('https + 호스트만 통과한다', () => {
    expect(isHttpsLink('https://forms.gle/abc123')).toBe(true)
    expect(isHttpsLink('https://example.com:8443/survey?a=1#top')).toBe(true)
    expect(isHttpsLink('HTTPS://EXAMPLE.COM/')).toBe(true)
  })

  it('http·앱 스킴·스킴 없음은 막는다', () => {
    expect(isHttpsLink('http://example.com')).toBe(false)
    expect(isHttpsLink('cheesemoa://home')).toBe(false)
    expect(isHttpsLink('example.com')).toBe(false)
    expect(isHttpsLink('')).toBe(false)
  })

  it('브라우저는 고쳐 읽지만 BE(java.net.URI)는 거부하는 형태를 먼저 막는다', () => {
    // 슬래시 없는 https: — 브라우저는 https://example.com/으로 읽지만 BE에선 호스트가 없다
    expect(isHttpsLink('https:example.com')).toBe(false)
    // 공백·중괄호 — 브라우저는 인코딩해 통과시키지만 URI.create는 예외
    expect(isHttpsLink('https://example.com/a b')).toBe(false)
    expect(isHttpsLink('https://example.com/{id}')).toBe(false)
    // 깨진 퍼센트 인코딩
    expect(isHttpsLink('https://example.com/%zz')).toBe(false)
    expect(isHttpsLink('https://example.com/%E2%9C%93')).toBe(true)
  })

  it('사용자 정보(user@host)가 섞인 링크는 막는다 — 피싱 형태', () => {
    expect(isHttpsLink('https://user:pw@example.com')).toBe(false)
    expect(isHttpsLink('https://cheese-moa.com@evil.example')).toBe(false)
  })

  it('2048자를 넘으면 막는다', () => {
    const base = 'https://example.com/'
    expect(isHttpsLink(base + 'a'.repeat(2048 - base.length))).toBe(true)
    expect(isHttpsLink(base + 'a'.repeat(2049 - base.length))).toBe(false)
  })
})

describe('최소 앱 버전 (BE PopupVersion)', () => {
  it('숫자 세 마디만 받는다', () => {
    expect(isValidAppVersion('2.7.0')).toBe(true)
    expect(isValidAppVersion('10.20.30')).toBe(true)
    expect(isValidAppVersion('2.7')).toBe(false)
    expect(isValidAppVersion('2.7.0+33')).toBe(false)
    expect(isValidAppVersion('v2.7.0')).toBe(false)
  })
})

describe('KST 입력 변환', () => {
  it('datetime-local 값은 브라우저 시간대와 무관하게 KST로 읽는다', () => {
    expect(kstInputToIso('2026-10-15T08:00')).toBe('2026-10-15T08:00:00+09:00')
    expect(kstInputToIso('2026-10-15')).toBeNull()
  })

  it('UTC 응답을 KST 입력값으로 되돌린다(날짜 경계 포함)', () => {
    expect(isoToKstInput('2026-10-14T23:00:00Z')).toBe('2026-10-15T08:00')
    expect(isoToKstInput('2026-10-31T14:59:59Z')).toBe('2026-10-31T23:59')
    expect(isoToKstInput('nope')).toBe('')
    expect(dateToKstInput(new Date('2026-10-14T15:30:00Z'))).toBe('2026-10-15T00:30')
  })
})

describe('야간 발송 금지 (BE CampaignPolicy — KST 08:00 이상 21:00 미만)', () => {
  const kst = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00+09:00`)

  it('07:59·21:00은 막고 08:00·20:59는 통과한다', () => {
    expect(isCampaignDaytime(kst('07:59'))).toBe(false)
    expect(isCampaignDaytime(kst('08:00'))).toBe(true)
    expect(isCampaignDaytime(kst('20:59'))).toBe(true)
    expect(isCampaignDaytime(kst('21:00'))).toBe(false)
  })

  it('야간의 다음 발송 가능 시각 — 21시 이후는 다음 날, 자정 이후는 같은 날 08:00', () => {
    expect(nextCampaignDaytime(kst('22:30')).toISOString()).toBe('2026-10-15T23:00:00.000Z')
    expect(nextCampaignDaytime(new Date('2026-10-15T03:00:00+09:00')).toISOString()).toBe(
      '2026-10-14T23:00:00.000Z',
    )
  })
})

describe('혜택 푸시 최종 문구 (서버가 붙이는 그대로)', () => {
  it('(광고)를 붙이되 이미 있으면 중복하지 않는다', () => {
    expect(adTitle('  설문 참여 혜택 ')).toBe('(광고) 설문 참여 혜택')
    expect(adTitle('(광고) 설문 참여 혜택')).toBe('(광고) 설문 참여 혜택')
  })

  it('본문 끝에 줄을 바꿔 수신 거부 문구를 붙인다(이미 있으면 그대로)', () => {
    expect(adBody('의견을 들려주세요.')).toBe(`의견을 들려주세요.\n${CAMPAIGN_FOOTER}`)
    expect(adBody(`의견을 들려주세요.\n${CAMPAIGN_FOOTER}`)).toBe(
      `의견을 들려주세요.\n${CAMPAIGN_FOOTER}`,
    )
  })

  it('페이로드 바이트는 자동 문구·data를 포함한 UTF-8 길이다(한글 3바이트)', () => {
    const plain = campaignPayloadBytes({ title: 'a', body: 'b', link: null })
    const withLink = campaignPayloadBytes({ title: 'a', body: 'b', link: 'https://x.io' })
    expect(withLink - plain).toBe(',"link":"https://x.io"'.length)
    expect(campaignPayloadBytes({ title: 'a', body: '가', link: null }) - plain).toBe(2)
  })
})

describe('팝업 이미지 비율', () => {
  it('4:5에서 1% 넘게 벗어나면 경고 대상이다', () => {
    expect(isOffPopupRatio(1080, 1350)).toBe(false)
    expect(isOffPopupRatio(1080, 1360)).toBe(false)
    expect(isOffPopupRatio(1080, 1080)).toBe(true)
    expect(isOffPopupRatio(0, 0)).toBe(false)
  })
})

describe('멱등 키 (Idempotency-Key)', () => {
  it('같은 본문의 재시도는 같은 키, 본문이 바뀌거나 성공 후엔 새 키', () => {
    let n = 0
    const keeper = createIdempotencyKeeper(() => `key-${++n}`)
    expect(keeper.keyFor('A')).toBe('key-1')
    expect(keeper.keyFor('A')).toBe('key-1')
    expect(keeper.keyFor('B')).toBe('key-2')
    keeper.reset()
    expect(keeper.keyFor('B')).toBe('key-3')
  })

  it('기본 키는 UUID 형식이다(BE가 UUID로 바인딩 — 아니면 400)', () => {
    const key = createIdempotencyKeeper().keyFor('x')
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
