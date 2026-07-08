import { PhoneShell } from '../components/PhoneShell'
import { ButtonLink, EmptyState } from '../components/ui'

/** 404 — 잘못된 주소. '/'는 GuestGuard가 로그인 상태면 /home으로 보내므로 CTA 하나로 충분. */
export function NotFoundPage() {
  return (
    <PhoneShell>
      <main className="flex flex-1 flex-col justify-center">
        <EmptyState
          title="페이지를 찾을 수 없어요"
          description="주소가 잘못됐거나 삭제된 페이지예요."
          action={<ButtonLink to="/">홈으로 가기</ButtonLink>}
        />
      </main>
    </PhoneShell>
  )
}
