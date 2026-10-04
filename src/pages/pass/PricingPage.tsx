import { Link } from 'react-router-dom'
import albumImage from '../../assets/brand/album.png'
import { PublicPageShell } from '../../components/PublicPageShell'
import { ButtonLink } from '../../components/ui'
import { PASS_CATALOG, formatUsd } from '../../lib/passPlans'

/**
 * 서비스·요금 안내 (CHMO-899 — 토스페이먼츠 심사 공개 URL `/pricing`, 가드 밖).
 *
 * 심사 담당자가 설명 없이 확인해야 하는 다섯 가지를 위에서 아래로 놓는다:
 * 무슨 서비스인가 → 무엇을 파는가(3종·가격·기간) → 어떤 거래 구조인가(단건·자동 갱신 없음·
 * 승인 즉시 시작·KRW/USD) → 환불은 어떻게 되는가 → 어디서 사는가([이용권 구매하기]).
 *
 * 가격은 lib/passPlans 카탈로그(BE PassPlan 사본) — 로그인 전이라 서버 상품 API를 부를 수 없다.
 * 결제 화면은 서버 응답만 쓰므로 실제 결제금액의 원천은 서버다(카탈로그는 표시용).
 */
export function PricingPage() {
  return (
    <PublicPageShell width="wide" title="요금 안내">
      {/* ── 서비스 소개 ── */}
      <section className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
        <img
          src={albumImage}
          alt="치즈모아 앨범 로고"
          width={160}
          height={160}
          className="h-32 w-32 shrink-0 sm:h-40 sm:w-40"
        />
        <div className="text-center sm:text-left">
          <h1 className="text-[26px] font-bold leading-snug text-heading sm:text-[32px]">
            모임 사진을 올리면,
            <br />
            사람별로 자동 정리
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text">
            치즈모아는 유치원·학원·여행사 같은 단체가 행사 사진을 한곳에 올리면, 얼굴 인식으로
            사진 속 인물별 앨범을 만들어 주는 사진 관리·공유 서비스입니다. 관리자가 사진을 확인하고
            공개하면, 승인된 멤버(보호자 등)는 자기 앨범의 사진을 보고 내려받을 수 있습니다.
          </p>
        </div>
      </section>

      <section aria-labelledby="how" className="mt-10">
        <h2 id="how" className="text-[13px] tracking-[0.06em] text-muted">
          이렇게 쓰여요
        </h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ['사진 올리기', '행사 사진을 모임에 한 번에 올립니다.'],
            ['인물별 자동 분류', 'AI가 사진 속 얼굴을 찾아 인물별 앨범으로 나눕니다.'],
            ['확인하고 공유', '관리자가 앨범을 확인해 공개하면 멤버가 사진을 보고 저장합니다.'],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-border bg-white p-4 shadow-card-stack">
              <p className="text-[12px] text-accent">{i + 1}단계</p>
              <p className="mt-1 text-[16px] font-bold text-text">{title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 판매 상품 ── */}
      <section aria-labelledby="plans" className="mt-12">
        <h2 id="plans" className="text-[22px] font-bold text-heading">
          기간 이용권
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-text">
          비즈니스 모임 1곳의 서비스 이용 권한(사진 업로드·인물별 자동 분류·멤버 공유)을 정해진
          시간 동안 제공하는 상품입니다. 모임의 관리자가 구매하며, 구매한 이용권은 그 모임에
          귀속됩니다.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {PASS_CATALOG.map((plan) => (
            <li
              key={plan.code}
              className="flex flex-col rounded-2xl border-[1.5px] border-[#D8CFBB] bg-white p-5 shadow-card-stack"
            >
              <p className="text-[17px] font-bold text-text">{plan.name}</p>
              <p className="mt-3 text-[30px] font-bold leading-none text-heading">
                {formatUsd(plan.usdAmount)}
              </p>
              <ul className="mt-4 flex flex-col gap-1.5 text-[13px] leading-relaxed text-text">
                <li>· 이용 기간 {plan.hours}시간</li>
                <li>· 결제 승인 즉시 시작</li>
                <li>· 자동 갱신·자동결제 없음</li>
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-2xl bg-surface p-4 text-[13px] leading-relaxed text-text">
          <p className="font-bold">결제 통화</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            <li>
              · <span className="font-bold">국내 결제</span>는 주문 시점 기준환율로 환산한
              원화(KRW)로 결제합니다. 확정된 원화 금액과 적용 환율은 결제 직전 화면에 표시됩니다.
            </li>
            <li>
              · <span className="font-bold">해외 결제</span>는 표시된 미화(USD) 금액으로 결제합니다.
            </li>
          </ul>
          <p className="mt-3 font-bold">이용 기간과 갱신</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            <li>· 이용 기간은 결제가 승인된 즉시 시작합니다.</li>
            <li>· 이용 중인 이용권이 있으면 새 이용권은 기존 이용권이 끝나는 시점부터 이어집니다.</li>
            <li>· 한 번 결제하는 단건 상품이며, 자동으로 갱신되거나 다시 결제되지 않습니다.</li>
          </ul>
          <p className="mt-3 font-bold">환불</p>
          <p className="mt-1.5">
            사용하지 않은 이용권은 결제 후 7일 이내 전액, 이용을 시작한 이용권은 남은 시간만큼
            환불합니다. 자세한 기준과 신청 방법은{' '}
            <Link to="/legal/refund" className="text-accent underline underline-offset-2">
              환불정책
            </Link>
            에서 확인할 수 있습니다.
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <ButtonLink to="/pass/checkout" variant="accent" className="w-full sm:w-72">
            이용권 구매하기
          </ButtonLink>
          <p className="text-[12px] text-muted">구매는 로그인 후 비즈니스 모임 관리자만 할 수 있어요</p>
        </div>
      </section>
    </PublicPageShell>
  )
}
