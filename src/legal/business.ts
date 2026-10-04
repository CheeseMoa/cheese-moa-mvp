/**
 * 사업자·고객센터 정보 단일 원천 (CHMO-899 — 결제대행사 심사 · 전자상거래법 제10조 표시 의무).
 *
 * 모든 공개 페이지 하단(SiteFooter)·요금 안내·환불정책이 **이 객체 하나**를 읽는다 — 페이지마다
 * 따로 적으면 한 글자만 달라도 "신청서와 불일치"가 된다(심사 대조 항목).
 *
 * ⚠ **값은 사업자등록증·토스 신청서와 문자 단위로 같아야 한다**(띄어쓰기·하이픈·괄호 포함).
 * 운영자가 직접 채운다(2026-10-04 결정 — 원천 문서가 리포·노션·Jira 어디에도 없다).
 * **빈 값은 화면에 그리지 않는다**(placeholder·"준비 중" 노출 금지 — CHMO-899 AC). 그래서 비어
 * 있어도 화면은 깨지지 않지만 표시 의무는 미충족이다 — 심사 신청 전 Jira CHMO-899 코멘트 「심사 체크리스트」
 * 1번 항목으로 확인한다.
 */

export interface BusinessInfo {
  /** 상호 */
  companyName: string
  /** 대표자명 */
  representative: string
  /** 사업자등록번호 — `000-00-00000` */
  registrationNumber: string
  /** 통신판매업 신고번호 — `제0000-지역-0000호` */
  mailOrderNumber: string
  /** 사업장 주소 */
  address: string
  /** 고객센터 전화번호 */
  phone: string
  /** 고객센터 이메일 — 설정 신고·문의·처리방침 §13과 같은 주소 */
  email: string
}

export const BUSINESS_INFO: BusinessInfo = {
  companyName: '',
  representative: '',
  registrationNumber: '',
  mailOrderNumber: '',
  address: '',
  phone: '',
  email: 'cheesemoa03@gmail.com',
}

const ROW_LABELS: ReadonlyArray<readonly [keyof BusinessInfo, string]> = [
  ['companyName', '상호'],
  ['representative', '대표자'],
  ['registrationNumber', '사업자등록번호'],
  ['mailOrderNumber', '통신판매업 신고번호'],
  ['address', '주소'],
  ['phone', '고객센터'],
  ['email', '이메일'],
]

export interface BusinessInfoRow {
  key: keyof BusinessInfo
  label: string
  value: string
}

/** 화면에 그릴 행 — 비어 있는 항목은 뺀다(placeholder를 노출하지 않는다) */
export function businessInfoRows(info: BusinessInfo = BUSINESS_INFO): BusinessInfoRow[] {
  return ROW_LABELS.flatMap(([key, label]) => {
    const value = info[key].trim()
    return value ? [{ key, label, value }] : []
  })
}

/** 표시 의무 7항목이 모두 채워졌는지 — 운영 체크리스트·DEV 경고용 */
export function isBusinessInfoComplete(info: BusinessInfo = BUSINESS_INFO): boolean {
  return businessInfoRows(info).length === ROW_LABELS.length
}

/** `tel:` 링크용 — 숫자와 +만 남긴다 */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/**
 * 환불 신청 메일 링크 — 제목·본문에 필요한 주문 정보 항목을 미리 채워 둔다(환불정책 제5조와
 * 같은 항목). 주문번호는 결제 완료 화면이 넘기면 함께 싣는다.
 */
export function refundMailHref(orderId?: string): string {
  const subject = '[환불 신청] 치즈모아 기간 이용권'
  const body = [
    `주문번호: ${orderId ?? ''}`,
    '결제 일시:',
    '결제 금액:',
    '모임 이름:',
    '환불 사유:',
  ].join('\n')
  return `mailto:${BUSINESS_INFO.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
