/**
 * Toss Payments 결제창 호출 (CHMO-899 — 기간 이용권 단건 결제).
 *
 * SDK v2(standard)를 **결제 직전에만** 동적으로 싣는다 — 결제를 안 하는 대다수 화면이 외부 스크립트를
 * 받지 않게. 결제창에는 주문 준비 응답의 clientKey·orderId·orderName·amount·currency를 **바꾸지
 * 않고** 넘긴다(금액은 서버가 고정했고 승인도 그 금액으로만 된다 — FE가 계산하는 값은 없다).
 * 고객 식별 키는 ANONYMOUS(단건 결제라 빌링키·고객 키가 필요 없다)이고, 이름·이메일 등 고객
 * 정보도 넘기지 않는다(결제창이 필요한 건 사용자가 직접 입력한다).
 *
 * 결제창은 리다이렉트 방식이다: 인증이 끝나면 Toss가 successUrl에 `paymentType·orderId·paymentKey·
 * amount`를, failUrl에 `code·message·orderId`를 붙여 돌려보낸다. 승인은 그 화면(/pass/success)이
 * 서버에 요청한다.
 *
 * **MSW 목 모드**는 결제창을 띄우지 않는다 — 목 clientKey는 Toss가 받지 않고, 전체 페이지 이동은
 * 인메모리 목 DB(주문)를 날린다. 그래서 성공 복귀 경로를 SPA 이동으로 곧장 그린다(소셜 로그인
 * 목이 콜백으로 직행하는 것과 같은 관용).
 */
import type { PassOrder } from '../types/api'

const SDK_URL = 'https://js.tosspayments.com/v2/standard'

interface TossPaymentRequest {
  method: 'CARD'
  amount: { currency: string; value: number }
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
  card?: { useInternationalCardOnly?: boolean }
}

interface TossPaymentInstance {
  requestPayment(request: TossPaymentRequest): Promise<void>
}

interface TossPaymentsFactory {
  (clientKey: string): { payment(options: { customerKey: string }): TossPaymentInstance }
  ANONYMOUS: string
}

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory
  }
}

let sdkLoading: Promise<TossPaymentsFactory> | null = null

function loadTossSdk(): Promise<TossPaymentsFactory> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments)
  if (!sdkLoading) {
    sdkLoading = new Promise<TossPaymentsFactory>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SDK_URL
      script.async = true
      script.onload = () => {
        if (window.TossPayments) resolve(window.TossPayments)
        else reject(new Error('TOSS_SDK_UNAVAILABLE'))
      }
      script.onerror = () => reject(new Error('TOSS_SDK_UNAVAILABLE'))
      document.head.appendChild(script)
    }).catch((error: unknown) => {
      // 일시 실패(네트워크)가 세션 내내 결제를 막지 않게 — 다음 시도에서 다시 싣는다
      sdkLoading = null
      throw error
    })
  }
  return sdkLoading
}

/** 결제창 호출 실패 — SDK가 던진 code(USER_CANCEL 등)를 그대로 싣는다 */
export class TossPaymentError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'TossPaymentError'
    this.code = code
  }
}

/** 사용자가 결제창을 닫은 경우(오류가 아니다 — 같은 주문으로 다시 결제할 수 있다) */
export function isUserCancel(error: unknown): boolean {
  return (
    error instanceof TossPaymentError &&
    (error.code === 'USER_CANCEL' || error.code === 'PAY_PROCESS_CANCELED')
  )
}

/** failUrl의 code가 사용자 취소인지 — Toss 결제창 리다이렉트 실패 코드 기준 */
export function isCancelFailCode(code: string | null): boolean {
  return code === 'PAY_PROCESS_CANCELED' || code === 'USER_CANCEL'
}

export interface PassPaymentUrls {
  /** 절대 URL — Toss가 결과 파라미터를 붙여 이 주소로 돌려보낸다 */
  successUrl: string
  failUrl: string
}

/**
 * 결제창을 연다. 성공하면 브라우저가 Toss로 떠나므로 반환값을 기다릴 일이 없다.
 * @param navigateInApp 목 모드 전용 — 성공 복귀 경로를 SPA로 그린다(라우터에 직접 의존하지 않게 주입)
 */
export async function requestPassPayment(
  order: PassOrder,
  urls: PassPaymentUrls,
  navigateInApp: (path: string) => void,
): Promise<void> {
  if (import.meta.env.VITE_ENABLE_MSW === 'true') {
    const url = new URL(urls.successUrl)
    url.searchParams.set('paymentType', 'NORMAL')
    url.searchParams.set('orderId', order.orderId)
    url.searchParams.set('paymentKey', `tgen_mock_${order.orderId}`)
    url.searchParams.set('amount', String(order.amount))
    navigateInApp(`${url.pathname}${url.search}`)
    return
  }

  let TossPayments: TossPaymentsFactory
  try {
    TossPayments = await loadTossSdk()
  } catch {
    throw new TossPaymentError(
      'TOSS_SDK_UNAVAILABLE',
      '결제창을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
  }
  try {
    await TossPayments(order.clientKey)
      .payment({ customerKey: TossPayments.ANONYMOUS })
      .requestPayment({
        method: 'CARD',
        amount: { currency: order.currency, value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: urls.successUrl,
        failUrl: urls.failUrl,
        // 해외 결제는 USD MID — 해외 발급 카드 전용 결제창(다국어)을 연다. 국내는 기본 결제창.
        card: { useInternationalCardOnly: order.market === 'international' },
      })
  } catch (error: unknown) {
    const raw = error as { code?: unknown; message?: unknown }
    throw new TossPaymentError(
      typeof raw?.code === 'string' ? raw.code : 'UNKNOWN',
      typeof raw?.message === 'string' && raw.message
        ? raw.message
        : '결제창을 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    )
  }
}
