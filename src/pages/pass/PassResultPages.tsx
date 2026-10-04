import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiRequestError, toErrorMessage } from '../../api/client'
import { confirmPassOrder, getCurrentPass } from '../../api/billing'
import { AppPillButton, AppPillLink } from '../../components/AppPillButton'
import { PublicPageShell } from '../../components/PublicPageShell'
import { refundMailHref } from '../../legal/business'
import { clearApiCache } from '../../lib/apiCache'
import { formatDateTime, formatMoney, passPlanName } from '../../lib/passPlans'
import { isCancelFailCode } from '../../lib/tossPayments'
import type { CurrentPass, PassConfirmation } from '../../types/api'

function checkoutPath(groupId: string | null): string {
  return groupId ? `/pass/checkout?groupId=${encodeURIComponent(groupId)}` : '/pass/checkout'
}

/**
 * 결과 아이콘 원 — 앱 `organization_pending_screen.dart`의 72×72 옐로 틴트 원(`AppColors.
 * unpublishedBanner`, `app.iconBg`와 같은 값) + 잉크 아이콘 패턴. 그 화면은 대기·완료·오류
 * 변형 **전부**에 같은 옐로 원을 쓴다 — 색으로 긍정·부정을 가르지 않고 "지금 이 화면이 말할
 * 결과가 있다"는 신호로만 쓴다. 여기도 같은 태도를 따른다(성공·실패·취소 공통).
 */
function IconBadge({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-app-iconBg"
    >
      {children}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 13l4.5 4.5L19 7"
        stroke="#1B1B1B"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 8v5"
        stroke="#1B1B1B"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="16.3" r="1.35" fill="#1B1B1B" />
      <circle cx="12" cy="12" r="9.2" stroke="#1B1B1B" strokeWidth={1.6} />
    </svg>
  )
}

/**
 * 승인 실패의 갈래 — **결과가 불명확한 실패와 확정된 실패를 가른다**(CHMO-898 오류 표).
 * 불명확(결제사 통신 실패·네트워크)이면 새 결제를 만들지 않고 같은 주문을 다시 확인해야 이중
 * 결제가 안 난다(BE가 orderId 조회로 성공 여부를 조정 — CHMO-847 AC-17).
 */
type FailureKind = 'uncertain' | 'rejected' | 'conflict' | 'unavailable' | 'forbidden' | 'other'

function failureKindOf(err: unknown): FailureKind {
  if (!(err instanceof ApiRequestError)) return 'uncertain'
  switch (err.code) {
    case 'PAYMENT_GATEWAY_ERROR':
    case 'NETWORK_ERROR':
      return 'uncertain'
    case 'PAYMENT_REJECTED':
      return 'rejected'
    case 'PAYMENT_CONFLICT':
      return 'conflict'
    case 'BILLING_UNAVAILABLE':
      return 'unavailable'
    case 'BILLING_NOT_SUPPORTED':
    case 'FORBIDDEN_ROLE':
    case 'PENDING_APPROVAL':
      return 'forbidden'
    default:
      // 봉투 없는 5xx(프록시 오류)도 결과를 모르는 것이다
      return err.code === 'UNKNOWN' || err.status >= 500 ? 'uncertain' : 'other'
  }
}

const FAILURE_COPY: Record<FailureKind, { title: string; body: string }> = {
  uncertain: {
    title: '결제 결과를 아직 확인하지 못했어요',
    body: '결제가 두 번 되지 않도록 새로 결제하지 말고, 같은 주문으로 다시 확인해 주세요.',
  },
  rejected: {
    title: '카드사에서 결제를 승인하지 않았어요',
    body: '요금은 청구되지 않았어요. 다른 카드로 다시 구매해 주세요.',
  },
  conflict: {
    title: '이 주문은 더 이상 승인할 수 없어요',
    body: '주문 유효 시간(30분)이 지났거나 이미 처리된 주문이에요. 아래에서 이 모임의 이용권 상태를 확인해 주세요.',
  },
  unavailable: {
    title: '지금은 결제를 승인할 수 없어요',
    body: '결제 서비스가 잠시 응답하지 않아요. 잠시 후 같은 주문으로 다시 확인해 주세요.',
  },
  forbidden: {
    title: '이 모임에서는 이용권을 구매할 수 없어요',
    body: '모임 권한이 바뀌었을 수 있어요. 비즈니스 모임의 관리자만 구매할 수 있어요.',
  },
  other: {
    title: '결제를 마치지 못했어요',
    body: '요금은 청구되지 않았어요. 처음부터 다시 구매해 주세요.',
  },
}

/** 같은 주문으로 다시 확인할 수 있는 갈래 — 나머지는 확정된 결과라 paymentKey를 URL에서 지운다 */
const RETRYABLE: ReadonlySet<FailureKind> = new Set(['uncertain', 'unavailable'])

/**
 * 결제 성공 복귀 (CHMO-899 — Toss successUrl, CreatorGuard).
 *
 * Toss가 붙여 준 `orderId·paymentKey`로 **서버 승인**을 요청하고, 성공하면 구매 상품·결제금액·
 * 이용 시작·종료 시각을 보여 준다. 여기 오기 전까지는 카드 인증만 끝난 상태라 서버 승인이 없으면
 * 결제가 확정되지 않는다.
 *
 * paymentKey는 이 화면의 메모리와 URL에만 있다(저장소·분석·로그 미기록 — AC-9). 결과가 확정되면
 * URL에서도 지운다(replace) — 새로고침·뒤로가기로 남은 주소가 다시 쓰이지 않게. 불명확한 실패면
 * 남겨 둔다: 새로고침이 곧 "같은 주문 다시 확인"이 되도록(승인은 멱등이다).
 *
 * 팔레트는 앱 리디자인 토큰(`app.*` — CHMO-727).
 */
export function PassSuccessPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const groupId = params.get('groupId')
  const orderId = params.get('orderId')
  const paymentKey = params.get('paymentKey')

  const [result, setResult] = useState<PassConfirmation | null>(null)
  const [failure, setFailure] = useState<{ kind: FailureKind; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<CurrentPass | null | undefined>(undefined)
  const started = useRef(false)

  /** 결과가 확정되면 결제 키를 주소에서 걷는다 — 화면 상태는 그대로(같은 라우트라 재마운트 없음) */
  const dropPaymentKey = useCallback(() => {
    if (!groupId || !orderId) return
    navigate(
      `/pass/success?groupId=${encodeURIComponent(groupId)}&orderId=${encodeURIComponent(orderId)}`,
      { replace: true },
    )
  }, [groupId, orderId, navigate])

  const confirm = useCallback(() => {
    if (!groupId || !orderId || !paymentKey) return
    setBusy(true)
    setFailure(null)
    confirmPassOrder(groupId, orderId, paymentKey)
      .then((confirmed) => {
        // 이용권 상태가 바뀌었다 — 구매 화면으로 돌아가면 새 만료 시각을 읽어야 한다
        clearApiCache()
        setResult(confirmed)
        dropPaymentKey()
      })
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) {
          // 세션 만료 — 결제 키를 로그인 복귀 목적지에 싣지 않는다(소셜 복귀는 sessionStorage를 거친다).
          // 승인되지 않은 인증은 Toss가 자동 만료시켜 요금이 청구되지 않는다.
          navigate('/login', { replace: true, state: { returnTo: checkoutPath(groupId) } })
          return
        }
        const kind = failureKindOf(err)
        setFailure({ kind, message: toErrorMessage(err) })
        if (!RETRYABLE.has(kind)) dropPaymentKey()
        if (kind === 'conflict') {
          getCurrentPass(groupId)
            .then(setCurrent)
            .catch(() => setCurrent(null))
        }
      })
      .finally(() => setBusy(false))
  }, [groupId, orderId, paymentKey, dropPaymentKey, navigate])

  // StrictMode 이중 실행에도 승인 요청은 한 번 — 서버도 멱등이지만 같은 요청을 두 번 낼 이유가 없다
  useEffect(() => {
    if (started.current) return
    started.current = true
    confirm()
  }, [confirm])

  if (result) {
    return (
      <PublicPageShell title="결제 완료">
        <IconBadge>
          <CheckIcon />
        </IconBadge>
        <h1 className="mt-5 text-center text-[24px] font-extrabold tracking-[-0.4px] text-app-ink">
          결제가 완료됐어요
        </h1>
        <p className="mt-2 text-center text-[14px] leading-relaxed text-app-inkSub">
          이용권이 모임에 적용됐어요. 자동으로 갱신되거나 다시 결제되지 않아요.
        </p>
        <dl className="mt-6 divide-y divide-app-border overflow-hidden rounded-app border border-app-border bg-app-bg">
          <Row label="상품">{passPlanName(result.planCode)}</Row>
          <Row label="결제금액">{formatMoney(result.amount, result.currency)}</Row>
          <Row label="결제 승인">{formatDateTime(result.approvedAt)}</Row>
          <Row label="이용 시작">{formatDateTime(result.accessFrom)}</Row>
          <Row label="이용 종료">{formatDateTime(result.accessUntil)}</Row>
          <Row label="주문번호">
            <span className="break-all font-mono text-[13px]">{result.orderId}</span>
          </Row>
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-app-muted">
          환불이 필요하면 주문번호와 함께{' '}
          <a
            href={refundMailHref(result.orderId)}
            className="font-bold text-app-ink underline underline-offset-2"
          >
            환불을 신청
          </a>
          해 주세요. 기준은{' '}
          <Link to="/legal/refund" className="font-bold text-app-ink underline underline-offset-2">
            환불정책
          </Link>
          에 있어요.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <AppPillLink to={checkoutPath(groupId)} variant="secondary" className="sm:w-60">
            이용권 더 구매하기
          </AppPillLink>
          <AppPillLink to="/pricing" className="sm:w-60">
            완료
          </AppPillLink>
        </div>
      </PublicPageShell>
    )
  }

  if (!groupId || !orderId || (!paymentKey && !failure)) {
    // 결제 키가 걷힌 주소로 다시 들어왔거나(새로고침) 잘못된 진입 — 승인할 재료가 없다
    return (
      <PublicPageShell title="결제 확인">
        <h1 className="text-[24px] font-extrabold tracking-[-0.4px] text-app-ink">
          결제 결과를 보여 줄 수 없어요
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-app-inkSub">
          이 화면은 결제 직후에만 결과를 보여 줘요. 이용권 상태는 구매 화면에서 다시 확인할 수
          있어요.
        </p>
        <AppPillLink to={checkoutPath(groupId)} className="mt-6 w-full sm:w-60">
          구매 화면으로
        </AppPillLink>
      </PublicPageShell>
    )
  }

  if (!failure) {
    return (
      <PublicPageShell title="결제 확인">
        <div className="flex flex-col items-center py-16" role="status">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-app-border border-t-app-ink" />
          <p className="mt-4 text-[14px] text-app-inkSub">결제를 확인하고 있어요…</p>
        </div>
      </PublicPageShell>
    )
  }

  const copy = FAILURE_COPY[failure.kind]
  return (
    <PublicPageShell title="결제 확인">
      <IconBadge>
        <AlertIcon />
      </IconBadge>
      <h1 className="mt-5 text-center text-[24px] font-extrabold tracking-[-0.4px] text-app-ink">
        {copy.title}
      </h1>
      <p className="mt-3 text-center text-[14px] leading-relaxed text-app-inkSub">{copy.body}</p>
      {failure.kind === 'other' || failure.kind === 'rejected' ? (
        <p className="mt-2 text-center text-[13px] text-app-muted">{failure.message}</p>
      ) : null}
      {failure.kind === 'conflict' && current !== undefined ? (
        <p className="mt-4 rounded-app bg-app-chip px-4 py-3 text-[13px] leading-relaxed text-app-ink">
          {current?.active
            ? `이 모임의 이용권은 ${formatDateTime(current.accessUntil)}까지예요.`
            : '이 모임에 이용 중인 이용권이 없어요.'}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {RETRYABLE.has(failure.kind) && paymentKey ? (
          <AppPillButton disabled={busy} onClick={confirm} className="sm:w-60">
            {busy ? '확인 중…' : '같은 주문으로 다시 확인'}
          </AppPillButton>
        ) : (
          <AppPillLink to={checkoutPath(groupId)} className="sm:w-60">
            다시 구매하기
          </AppPillLink>
        )}
        <AppPillLink to="/pricing" variant="secondary" className="sm:w-60">
          요금 안내
        </AppPillLink>
      </div>
    </PublicPageShell>
  )
}

/**
 * 결제 실패·취소 복귀 (CHMO-899 — Toss failUrl, 가드 밖).
 * 서버를 부르지 않는다 — 결제창 단계에서 끝난 거래라 승인할 주문이 없고 요금도 청구되지 않았다.
 * 사용자 취소와 실패를 가른다: 취소는 오류가 아니라 같은 화면으로 돌아가 다시 고르면 된다.
 */
export function PassFailPage() {
  const [params] = useSearchParams()
  const groupId = params.get('groupId')
  const code = params.get('code')
  const message = params.get('message')
  const canceled = isCancelFailCode(code)

  return (
    <PublicPageShell title={canceled ? '결제 취소' : '결제 실패'}>
      <IconBadge>
        <AlertIcon />
      </IconBadge>
      <h1 className="mt-5 text-center text-[24px] font-extrabold tracking-[-0.4px] text-app-ink">
        {canceled ? '결제를 취소했어요' : '결제에 실패했어요'}
      </h1>
      <p className="mt-3 text-center text-[14px] leading-relaxed text-app-inkSub">
        결제가 진행되지 않았고 요금은 청구되지 않았어요.
        {canceled ? '' : ' 다른 카드나 결제 방식으로 다시 시도해 주세요.'}
      </p>
      {!canceled && message ? (
        <p className="mt-2 text-center text-[13px] leading-relaxed text-app-muted">
          {message}
          {code ? ` (${code})` : ''}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <AppPillLink to={checkoutPath(groupId)} className="sm:w-60">
          다시 구매하기
        </AppPillLink>
        <AppPillLink to="/pricing" variant="secondary" className="sm:w-60">
          요금 안내
        </AppPillLink>
      </div>
    </PublicPageShell>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-3.5">
      <dt className="w-20 shrink-0 text-[13px] text-app-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-relaxed text-app-ink">{children}</dd>
    </div>
  )
}
