/**
 * 이벤트 팝업·혜택 푸시 규칙 단일 원천 (CHMO-928 — BE CHMO-926).
 *
 * 서버가 최종 판정을 하지만 실패 코드가 뭉뚱그려져 있다(POPUP400 "팝업 설정이 올바르지
 * 않습니다." · CAMPAIGN400 "발송 시각 또는 수신 조건이 올바르지 않습니다."). 그래서 **같은 규칙을
 * 화면이 먼저 돌려** 무엇이 틀렸는지 그 자리에서 말한다. 기준은 전부 BE 소스다:
 * `HttpsLink`·`PopupVersion`·`PopupRequest`·`S3PopupImages`·`CampaignPolicy`·`CampaignRegistrar`.
 * BE 규칙이 바뀌면 여기만 고친다(목 핸들러도 이 파일을 쓴다).
 */
import type { AdminCampaignInput, AdminPopupLocale } from '../api/types'

// ── 길이·크기 상한(BE DTO @Size·@Max 그대로) ────────────────────────

export const POPUP_LIMITS = {
  title: 100,
  imageAlt: 500,
  ctaLabel: 50,
  linkUrl: 2048,
  minAppVersion: 32,
} as const

/** BE `S3PopupImages` — JPG·PNG만, 10 MiB 이하 */
export const POPUP_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const
export const POPUP_IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** 앱 카드가 이미지를 4:5로 잘라 그린다(BoxFit.cover — CHMO-927). 권장 원본 1080×1350 */
export const POPUP_IMAGE_RATIO = 4 / 5

export const CAMPAIGN_LIMITS = {
  title: 100,
  body: 1000,
  link: 2048,
  /** 자동 문구 포함 notification·data JSON의 UTF-8 바이트(토픽 2048 bytes에 여유를 둔 값) */
  payloadBytes: 1800,
} as const

// ── 링크 ─────────────────────────────────────────────────────────────

/**
 * BE `HttpsLink.isValid`와 같은 판정 — https 스킴 · 호스트 있음 · 사용자 정보 없음.
 *
 * BE는 `java.net.URI.create`로 파싱해 **브라우저 `URL`보다 엄격하다**: 공백·`"<>\^\`{|}` 같은
 * 문자가 섞이거나 `%` 뒤가 16진 두 자리가 아니면 예외로 거부하는데, 브라우저는 알아서 인코딩해
 * 통과시킨다. 그 차이를 여기서 먼저 막는다. `https:example.com`(슬래시 없음)도 브라우저는
 * 고쳐 읽지만 BE에선 호스트가 없는 URI라 거부된다.
 */
export function isHttpsLink(value: string): boolean {
  if (value.length === 0 || value.length > POPUP_LIMITS.linkUrl) return false
  if (!/^https:\/\//i.test(value)) return false
  if (/[\s"<>\\^`{|}]/.test(value)) return false
  if (/%(?![0-9A-Fa-f]{2})/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname !== '' && !url.username && !url.password
  } catch {
    return false
  }
}

// ── 앱 버전 ──────────────────────────────────────────────────────────

/** BE `PopupVersion.parse` — 숫자 세 마디(`2.7.0`)만. 빌드 번호(`+33`)·접미사는 안 받는다 */
export function isValidAppVersion(value: string): boolean {
  return value.length <= POPUP_LIMITS.minAppVersion && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(value)
}

// ── KST 시각 ─────────────────────────────────────────────────────────
//
// 운영자는 언제나 한국 시각으로 입력한다(브라우저 시간대와 무관 — 해외 출장 중이어도 같은 값).
// `<input type="datetime-local">`의 값(`YYYY-MM-DDTHH:mm`)을 KST로 읽어 오프셋을 붙여 보낸다.
// 한국은 서머타임이 없어 +09:00 고정이다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** `2026-10-15T08:00` → `2026-10-15T08:00:00+09:00`. 형식이 아니면 null */
export function kstInputToIso(local: string): string | null {
  return LOCAL_INPUT_RE.test(local) ? `${local}:00+09:00` : null
}

/** ISO 시각 → KST `datetime-local` 값(초는 버린다). 파싱 불가면 빈 문자열 */
export function isoToKstInput(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 16)
}

/** Date → KST `datetime-local` 값 — 입력칸 기본값·최소값용 */
export function dateToKstInput(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16)
}

function kstHour(date: Date): number {
  return (date.getUTCHours() + 9) % 24
}

/**
 * BE `CampaignPolicy.isDaytime` — KST 08:00 이상 21:00 미만만 보낼 수 있다(정보통신망법
 * 제50조 야간 광고 전송 제한). 즉시·예약·테스트 전부 같은 판정이다.
 */
export function isCampaignDaytime(date: Date): boolean {
  const hour = kstHour(date)
  return hour >= 8 && hour < 21
}

/** BE `CampaignPolicy.nextDaytime` — 야간이면 다음 08:00(KST). 낮이면 오늘 08:00(과거)을 준다 */
export function nextCampaignDaytime(date: Date): Date {
  const kst = new Date(date.getTime() + KST_OFFSET_MS)
  const dayStartUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())
  const addDays = kstHour(date) >= 21 ? 1 : 0
  return new Date(dayStartUtc + addDays * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000 - KST_OFFSET_MS)
}

// ── 혜택 푸시 최종 문구(서버가 붙이는 그대로) ─────────────────────────

export const AD_PREFIX = '(광고)'

/** BE `CampaignPolicy.FOOTER` — 전송자·수신 거부 방법(제50조 ④) */
export const CAMPAIGN_FOOTER = '치즈모아 · 수신 거부: 내 정보 > 혜택·이벤트 알림'

/** BE `CampaignPolicy.title` — 앞뒤 공백을 걷고 `(광고) `를 붙인다(이미 있으면 그대로) */
export function adTitle(input: string): string {
  const value = input.trim()
  return value.startsWith(AD_PREFIX) ? value : `${AD_PREFIX} ${value}`
}

/** BE `CampaignPolicy.body` — 앞뒤 공백을 걷고 줄을 바꿔 수신 거부 문구를 붙인다(이미 있으면 그대로) */
export function adBody(input: string): string {
  const value = input.trim()
  return value.endsWith(CAMPAIGN_FOOTER) ? value : `${value}\n${CAMPAIGN_FOOTER}`
}

/**
 * BE `CampaignRegistrar`의 페이로드 크기 검사와 같은 값 — 자동 문구가 붙은 notification과
 * data(type=PROMO, link)를 JSON으로 묶은 UTF-8 바이트. 한글은 글자당 3바이트라 본문 1000자
 * 상한보다 이 상한(1800)에 먼저 닿는다(한글만으로 약 560자).
 */
export function campaignPayloadBytes(input: AdminCampaignInput): number {
  const link = input.link?.trim()
  const payload = {
    notification: { title: adTitle(input.title), body: adBody(input.body) },
    data: link ? { type: 'PROMO', link } : { type: 'PROMO' },
  }
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

// ── 앱 팝업 고정 문구(미리보기용) ────────────────────────────────────

/**
 * 앱 팝업 하단 줄의 고정 문구 — 앱 ARB `eventPopupHideToday`·`commonClose`(ko·en·ja) 그대로
 * (CHMO-927). 팝업의 locale이 곧 그 사용자의 앱 표시 언어라 미리보기도 그 언어로 그린다.
 */
export const POPUP_FIXED_COPY: Record<AdminPopupLocale, { hideToday: string; close: string }> = {
  ko: { hideToday: '오늘 하루 보지 않기', close: '닫기' },
  en: { hideToday: "Don't show today", close: 'Close' },
  ja: { hideToday: '今日は表示しない', close: '閉じる' },
}

/** 이미지가 권장 비율(4:5)에서 1% 넘게 벗어났나 — 벗어나면 앱에서 위아래나 양옆이 잘린다 */
export function isOffPopupRatio(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  return Math.abs(width / height - POPUP_IMAGE_RATIO) / POPUP_IMAGE_RATIO > 0.01
}

// ── 멱등 키 ──────────────────────────────────────────────────────────

/**
 * 발송 요청의 Idempotency-Key — **같은 발송의 재시도에만** 같은 키를 쓴다.
 * 본문이 달라졌는데 키를 재사용하면 BE가 CAMPAIGN409로 거부하므로, 직전 시도의 본문 지문이
 * 같을 때만 키를 돌려주고 아니면 새로 만든다. 성공하면 호출부가 `reset()`해 다음 발송은 새 키다.
 */
export function createIdempotencyKeeper(newKey: () => string = randomUuid) {
  let last: { fingerprint: string; key: string } | null = null
  return {
    keyFor(fingerprint: string): string {
      if (!last || last.fingerprint !== fingerprint) last = { fingerprint, key: newKey() }
      return last.key
    },
    reset(): void {
      last = null
    },
  }
}

/** UUID v4 — `crypto.randomUUID`는 보안 컨텍스트 전용이라(http 사설 IP 접속 등) 폴백을 둔다 */
function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
