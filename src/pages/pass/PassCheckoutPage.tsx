import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listGroups } from '../../api/groups'
import { getCurrentPass, listPassPlans, preparePassOrder } from '../../api/billing'
import { PublicPageShell } from '../../components/PublicPageShell'
import { Button, ButtonLink, LoadState } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import { cx } from '../../lib/cx'
import {
  PASS_MARKET_LABEL,
  formatDateTime,
  formatMoney,
  formatRate,
  formatUsd,
  newIdempotencyKey,
  passHoursLabel,
  passPlanName,
} from '../../lib/passPlans'
import { isUserCancel, requestPassPayment } from '../../lib/tossPayments'
import type { Group, ID, PassMarket, PassOrder, PassPlanCode } from '../../types/api'

const CHECKOUT_PATH = '/pass/checkout'

/** 결제 권한이 있는 모임 — 비즈니스 모임의 ACTIVE 관리자(BE BillingAccessGuard와 같은 판정) */
function isPurchasable(group: Group): boolean {
  return (
    group.groupType === 'business' &&
    group.myMembership?.role === 'editor' &&
    group.myMembership.status === 'active'
  )
}

/** 서버 오류 → 이 화면의 안내. 권한·유형이 바뀐 오류는 고칠 수 없는 상태라 문장을 바꿔 준다 */
function prepareErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'BILLING_NOT_SUPPORTED':
    case 'FORBIDDEN_ROLE':
    case 'PENDING_APPROVAL':
      return '이 모임에서는 이용권을 구매할 수 없어요. 비즈니스 모임의 관리자만 구매할 수 있어요.'
    case 'BILLING_UNAVAILABLE':
      return '지금은 결제를 준비할 수 없어요(결제·환율 서비스 점검). 잠시 후 다시 시도해 주세요.'
    case 'PAYMENT_CONFLICT':
      return '주문 정보가 바뀌었어요. 다시 시도해 주세요.'
    default:
      return fallback
  }
}

/**
 * 기간 이용권 구매 (CHMO-899 — 로그인 필요, CreatorGuard).
 *
 * 한 화면 두 단계다: ① 고르기(모임 → 상품 → 결제 시장) ② 결제 직전 확인(서버가 확정한 금액·
 * 이용 기간·시작 시점·자동 갱신 없음·약관 링크 + 확인 체크) → [결제하기]가 Toss 결제창을 연다.
 * 금액은 ②에서 처음 확정된다 — 국내 결제는 서버가 환율로 원화를 정하기 때문에 ① 단계의 가격은
 * USD 기준가로만 말한다(FE는 환산하지 않는다).
 *
 * 멱등키는 **선택 한 벌(모임·상품·시장)마다 하나**다: 같은 선택으로 다시 누르면 같은 주문을
 * 돌려받고(중복 탭·응답 유실 재시도 안전), 선택을 바꾸면 새 키가 된다. 주문이 만료됐거나 서버가
 * 충돌(BILLING409)을 알리면 키를 버리고 새로 받는다.
 *
 * 시장은 기본값 없이 사용자가 고른다(카드 발급국을 결제 전에 알 수 없어 추정하지 않는다 — BE 정책).
 */
export function PassCheckoutPage() {
  const navigate = useNavigate()
  const mutate = useMutation()
  const [searchParams] = useSearchParams()

  const groups = useApi('groups', (signal) => listGroups(signal))
  const purchasable = (groups.data ?? []).filter(isPurchasable)

  const requestedGroupId = Number(searchParams.get('groupId')) || null
  const [pickedGroupId, setPickedGroupId] = useState<ID | null>(requestedGroupId)
  // 고를 게 하나뿐이면 고르게 하지 않는다. URL로 넘어온 모임이 결제 불가면 무시한다
  const groupId: ID | null =
    pickedGroupId !== null && purchasable.some((g) => g.id === pickedGroupId)
      ? pickedGroupId
      : purchasable.length === 1
        ? purchasable[0].id
        : null
  const group = purchasable.find((g) => g.id === groupId) ?? null

  const plans = useApi(groupId ? `pass-plans:${groupId}` : null, (signal) =>
    listPassPlans(groupId as ID, signal),
  )
  const current = useApi(groupId ? `pass-current:${groupId}` : null, (signal) =>
    getCurrentPass(groupId as ID, signal),
  )

  const [planCode, setPlanCode] = useState<PassPlanCode | null>(null)
  const [market, setMarket] = useState<PassMarket | null>(null)
  const [order, setOrder] = useState<PassOrder | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 선택 한 벌 ↔ 멱등키. 선택이 그대로면 같은 키를 다시 쓴다
  const idempotency = useRef<{ signature: string; key: string } | null>(null)
  const signature = `${groupId}|${planCode}|${market}`
  const keyFor = (fresh = false) => {
    if (fresh || idempotency.current?.signature !== signature) {
      idempotency.current = { signature, key: newIdempotencyKey() }
    }
    return idempotency.current.key
  }

  // 모임을 바꾸면 그 모임의 상품·주문을 새로 고른다
  useEffect(() => {
    setPlanCode(null)
    setOrder(null)
    setAgreed(false)
  }, [groupId])

  const selectedPlan = plans.data?.find((plan) => plan.code === planCode) ?? null
  const canPrepare = Boolean(groupId && selectedPlan && market) && !busy

  const prepare = (freshKey = false) => {
    if (!groupId || !planCode || !market || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    void mutate(() => preparePassOrder(groupId, { planCode, market }, keyFor(freshKey)), {
      redirect: { state: { returnTo: CHECKOUT_PATH } },
      onSuccess: (prepared) => {
        setBusy(false)
        setOrder(prepared)
        setAgreed(false)
        window.scrollTo({ top: 0 })
      },
      onError: (message, err) => {
        setBusy(false)
        const code = (err as { code?: string } | undefined)?.code
        if (code === 'PAYMENT_CONFLICT') idempotency.current = null
        setError(prepareErrorMessage(code, message))
      },
    })
  }

  const pay = async () => {
    if (!order || !groupId || busy) return
    setError(null)
    setNotice(null)
    // 30분 유효 주문 — 지났으면 결제창에서 실패하기 전에 새로 준비한다
    if (Date.now() >= new Date(order.expiresAt).getTime()) {
      prepare(true)
      // prepare가 안내를 비우므로 그 뒤에 싣는다 — 새 주문이 오면 확인 화면이 새 금액으로 다시 선다
      setNotice('주문 유효 시간(30분)이 지나 새 주문을 준비했어요. 금액을 다시 확인하고 결제해 주세요.')
      return
    }
    setBusy(true)
    const origin = window.location.origin
    try {
      await requestPassPayment(
        order,
        {
          successUrl: `${origin}/pass/success?groupId=${groupId}`,
          failUrl: `${origin}/pass/fail?groupId=${groupId}`,
        },
        (path) => navigate(path),
      )
    } catch (err) {
      if (isUserCancel(err)) setNotice('결제를 취소했어요. 같은 주문으로 다시 결제할 수 있어요.')
      else setError(err instanceof Error ? err.message : '결제창을 열지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  // ── 렌더 ──
  if (groups.data === null) {
    return (
      <PublicPageShell title="이용권 구매">
        <LoadState
          loading={groups.loading}
          error={groups.error}
          onRetry={groups.refetch}
          unauthorizedTo="/login"
        />
      </PublicPageShell>
    )
  }

  if (purchasable.length === 0) {
    return (
      <PublicPageShell title="이용권 구매">
        <h1 className="text-[22px] font-bold text-heading">이용권을 구매할 모임이 없어요</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-text">
          기간 이용권은 비즈니스 모임의 관리자가 그 모임을 위해 구매해요. 비즈니스 모임을 새로
          만들거나, 모임 관리자에게 구매를 요청해 주세요.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/groups/new" variant="accent" className="sm:w-60">
            비즈니스 모임 만들기
          </ButtonLink>
          <ButtonLink to="/pricing" variant="secondary" className="sm:w-60">
            요금 안내 보기
          </ButtonLink>
        </div>
      </PublicPageShell>
    )
  }

  // ② 결제 직전 확인
  if (order && group) {
    const startsAfterCurrent = current.data?.active ? current.data.accessUntil : null
    const plan = plans.data?.find((p) => p.code === order.planCode)
    return (
      <PublicPageShell title="이용권 구매">
        <h1 className="text-[22px] font-bold text-heading">결제 전에 확인해 주세요</h1>
        <dl className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-card-stack">
          <Row label="모임">{group.name}</Row>
          <Row label="상품">{order.orderName}</Row>
          <Row label="이용 기간">
            {plan ? passHoursLabel(plan.durationDays) : passPlanName(order.planCode)}
          </Row>
          <Row label="이용 시작">
            {startsAfterCurrent
              ? `현재 이용권이 끝나는 ${formatDateTime(startsAfterCurrent)}부터 이어서 시작`
              : '결제 승인 즉시 시작'}
          </Row>
          <Row label="결제 방식">{PASS_MARKET_LABEL[order.market]}</Row>
          <Row label="자동 갱신">없음 · 한 번만 결제되는 단건 상품이에요</Row>
          <Row label="총 결제금액" strong>
            <span className="text-[20px] font-bold text-heading">
              {formatMoney(order.amount, order.currency)}
            </span>
            {order.currency === 'KRW' && order.usdKrwRate !== null ? (
              <span className="mt-1 block text-[12px] font-normal text-muted">
                {formatUsd(order.usdAmount)} × 기준환율 {formatRate(order.usdKrwRate)}
                {order.rateDate ? ` (${order.rateDate} 기준)` : ''}
              </span>
            ) : null}
          </Row>
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          이 주문은 {formatDateTime(order.expiresAt)}까지 유효해요. 결제창에는 위 금액이 그대로
          표시돼요.
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-surface p-4">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#9C6835]"
          />
          <span className="text-[14px] leading-relaxed text-text">
            주문 내용과{' '}
            <Link to="/legal/refund" target="_blank" className="text-accent underline underline-offset-2">
              환불정책
            </Link>
            ,{' '}
            <Link to="/legal/terms" target="_blank" className="text-accent underline underline-offset-2">
              이용약관
            </Link>
            ,{' '}
            <Link to="/legal/privacy" target="_blank" className="text-accent underline underline-offset-2">
              개인정보처리방침
            </Link>
            을 확인했으며 결제에 동의합니다.
          </span>
        </label>

        {notice ? <p className="mt-4 text-[13px] text-text">{notice}</p> : null}
        {error ? <p className="mt-4 text-[13px] text-warn">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <Button variant="accent" fullWidth disabled={!agreed || busy} onClick={() => void pay()}>
            {busy ? '결제창 여는 중…' : `${formatMoney(order.amount, order.currency)} 결제하기`}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={() => {
              setOrder(null)
              setError(null)
              setNotice(null)
            }}
          >
            다시 고르기
          </Button>
        </div>
      </PublicPageShell>
    )
  }

  // ① 고르기
  return (
    <PublicPageShell title="이용권 구매">
      <h1 className="text-[22px] font-bold text-heading">기간 이용권 구매</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-text">
        자동 갱신 없는 단건 결제예요. 결제가 승인되면 바로 이용 기간이 시작돼요.
      </p>

      {purchasable.length > 1 ? (
        <Step title="모임">
          <div className="flex flex-col gap-2">
            {purchasable.map((g) => (
              <Choice
                key={g.id}
                selected={g.id === groupId}
                onSelect={() => setPickedGroupId(g.id)}
                title={g.name}
                description="비즈니스 모임 · 관리자"
              />
            ))}
          </div>
        </Step>
      ) : (
        <p className="mt-6 text-[14px] text-text">
          <span className="text-muted">모임</span> · {group?.name}
        </p>
      )}

      {groupId ? (
        <>
          {current.data?.active ? (
            <p className="mt-4 rounded-xl bg-primary/15 px-4 py-3 text-[13px] leading-relaxed text-text">
              이 모임은 {formatDateTime(current.data.accessUntil)}까지 이용권이 남아 있어요. 새로
              구매하면 그 뒤에 이어 붙어요.
            </p>
          ) : null}

          <Step title="상품">
            {plans.data === null ? (
              <LoadState
                loading={plans.loading}
                error={plans.error}
                onRetry={plans.refetch}
                unauthorizedTo="/login"
                className="py-6"
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {plans.data.map((plan) => (
                  <Choice
                    key={plan.code}
                    selected={plan.code === planCode}
                    onSelect={() => setPlanCode(plan.code)}
                    title={passPlanName(plan.code, plan.durationDays)}
                    description={`${passHoursLabel(plan.durationDays)} · ${formatUsd(plan.usdAmount)}`}
                  />
                ))}
              </div>
            )}
          </Step>

          <Step title="결제 방식">
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice
                selected={market === 'domestic'}
                onSelect={() => setMarket('domestic')}
                title={PASS_MARKET_LABEL.domestic}
                description="국내에서 발급된 카드. 주문 시점 기준환율로 환산한 원화로 결제해요."
              />
              <Choice
                selected={market === 'international'}
                onSelect={() => setMarket('international')}
                title={PASS_MARKET_LABEL.international}
                description="해외에서 발급된 카드. 표시된 미화 금액으로 결제해요."
              />
            </div>
            {market === 'domestic' && selectedPlan ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                기준가 {formatUsd(selectedPlan.usdAmount)} · 원화 결제금액은 다음 화면에서 확정돼요.
              </p>
            ) : null}
          </Step>
        </>
      ) : null}

      {notice ? <p className="mt-5 text-[13px] text-text">{notice}</p> : null}
      {error ? <p className="mt-5 text-[13px] text-warn">{error}</p> : null}

      <div className="mt-8">
        <Button variant="accent" fullWidth disabled={!canPrepare} onClick={() => prepare()}>
          {busy ? '주문 준비 중…' : '결제 금액 확인하기'}
        </Button>
        <p className="mt-3 text-center text-[12px] text-muted">
          <Link to="/legal/refund" className="underline underline-offset-2">
            환불정책
          </Link>
          {' · '}
          <Link to="/legal/terms" className="underline underline-offset-2">
            이용약관
          </Link>
        </p>
      </div>
    </PublicPageShell>
  )
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-[12px] tracking-[0.06em] text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Choice({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'press-card flex w-full items-start gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left',
        // 선택 표시는 테두리 색 + 면 + 라디오 점 세 겹 — 테두리 색만으론 카드가 셋 나란히 설 때
        // 어느 것이 골라졌는지 한눈에 안 읽힌다(면 색은 bg-white와 같은 줄에 두면 순서 싸움에 진다)
        selected ? 'border-accent bg-primary/15' : 'border-[#D8CFBB] bg-white',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
          selected ? 'border-accent' : 'border-[#C9C2B4]',
        )}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-bold text-text">{title}</span>
        <span className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</span>
      </span>
    </button>
  )
}

function Row({
  label,
  strong,
  children,
}: {
  label: string
  strong?: boolean
  children: ReactNode
}) {
  return (
    <div className={cx('flex gap-4 px-4 py-3.5', strong && 'bg-primary/10')}>
      <dt className="w-24 shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-relaxed text-text">{children}</dd>
    </div>
  )
}
