import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PublicPageShell } from '../../components/PublicPageShell'
import { ButtonLink } from '../../components/ui'

/**
 * 결제 이용 안내 (CHMO-899 — 토스페이먼츠 심사 담당자가 따라 할 공개 URL `/pass/guide`, 가드 밖).
 *
 * **자격 증명은 여기에 적지 않는다**(티켓 — Jira·소스코드에 기록 금지, 별도 보안 채널로 전달).
 * 그래서 이 페이지는 "전달받은 계정으로 로그인" 이후의 경로만 말한다. 로그인 화면은 구매 화면에서
 * 넘어온 경우 ID/PIN 폼을 펼쳐 둔다(01 LandingPage — 심사 계정은 소셜 계정이 아니다).
 *
 * 문구는 일반 사용자가 읽어도 사실인 문장으로만 쓴다 — 심사 전용 페이지처럼 보이는 표현
 * ("테스트 결제", 테스트 카드 번호)은 넣지 않는다. 테스트 환경 안내는 계정과 함께 별도로 전달한다.
 */
export function PassGuidePage() {
  const steps: Array<{ title: string; body: ReactNode }> = [
    {
      title: '요금 확인',
      body: (
        <>
          <Link to="/pricing" className="text-accent underline underline-offset-2">
            요금 안내
          </Link>
          에서 판매 중인 1일·3일·7일 이용권의 가격, 이용 기간, 자동 갱신이 없다는 점을 확인합니다.
        </>
      ),
    },
    {
      title: '로그인',
      body: '[이용권 구매하기]를 누르면 로그인 화면으로 이동합니다. 비즈니스 모임 관리자 계정으로 로그인하면 구매 화면으로 돌아옵니다.',
    },
    {
      title: '상품과 결제 방식 선택',
      body: '이용권을 적용할 모임, 상품(1일·3일·7일), 결제 방식(국내 결제 원화 / 해외 결제 미화)을 고르고 [결제 금액 확인하기]를 누릅니다.',
    },
    {
      title: '결제 전 확인',
      body: '서버가 확정한 최종 결제금액(국내 결제는 적용 환율과 기준일 포함), 이용 기간, 이용 시작 시점, 자동 갱신 없음, 환불정책 링크를 확인하고 동의 체크 후 [결제하기]를 누릅니다.',
    },
    {
      title: '결제창',
      body: '토스페이먼츠 결제창이 열립니다. 결제창의 금액은 직전 확인 화면의 금액과 같습니다.',
    },
    {
      title: '결과 확인',
      body: '결제가 끝나면 결제 완료 화면에서 구매한 상품, 결제금액, 이용 시작·종료 시각, 주문번호를 확인합니다. 결제창에서 취소하거나 실패하면 요금이 청구되지 않았다는 안내와 함께 다시 구매할 수 있는 화면으로 돌아옵니다.',
    },
  ]

  return (
    <PublicPageShell title="결제 이용 안내">
      <h1 className="text-[22px] font-bold text-heading">이용권 결제 이용 안내</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-text">
        치즈모아 기간 이용권을 구매하는 순서입니다.
      </p>
      <ol className="mt-6 flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rounded-2xl border border-border bg-white p-4 shadow-card-stack">
            <p className="text-[12px] text-accent">{i + 1}단계</p>
            <p className="mt-1 text-[16px] font-bold text-text">{step.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to="/pricing" variant="accent" className="sm:w-60">
          요금 안내 보기
        </ButtonLink>
        <ButtonLink to="/legal/refund" variant="secondary" className="sm:w-60">
          환불정책 보기
        </ButtonLink>
      </div>
    </PublicPageShell>
  )
}
