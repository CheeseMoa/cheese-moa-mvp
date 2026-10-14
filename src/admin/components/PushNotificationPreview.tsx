import { Cheddar } from '../../components/ui/Cheddar'
import { adBody, adTitle, AD_PREFIX, CAMPAIGN_FOOTER } from '../lib/promotion'
import { linkHost } from '../lib/format'

/**
 * 혜택 푸시 최종 모습 미리보기 (CHMO-928) — 운영자가 쓴 문구가 아니라 **서버가 자동 문구를 붙인
 * 뒤의 모습**을 그린다(제목 앞 `(광고)` · 본문 끝 전송자·수신 거부 문구 — BE CampaignPolicy와 같은
 * 함수). 그래서 "쓴 것보다 길어진다"는 사실을 보내기 전에 본다.
 *
 * 붙는 부분은 옅은 치즈 면으로 짚는다 — 운영자가 쓴 글자와 서버가 붙인 글자가 섞여 있으면
 * 같은 문구를 두 번 쓰기 쉽다(서버가 중복은 안 붙이지만, 비슷한 말을 직접 쓰면 두 번 읽힌다).
 * 기기 알림 모양은 OS마다 달라 잠금 화면 배너의 일반형으로만 그린다.
 */
export function PushNotificationPreview({
  title,
  body,
  link,
}: {
  title: string
  body: string
  link: string | null
}) {
  const finalTitle = title.trim() ? adTitle(title) : `${AD_PREFIX} 제목`
  const finalBody = adBody(body.trim() ? body : '본문')
  const userTitle = finalTitle.slice(AD_PREFIX.length).trimStart()
  const userBody = finalBody.endsWith(CAMPAIGN_FOOTER)
    ? finalBody.slice(0, finalBody.length - CAMPAIGN_FOOTER.length).trimEnd()
    : finalBody
  const empty = !title.trim() && !body.trim()

  return (
    <div className="rounded-2xl bg-[#E4E0D8] p-4">
      <div className="rounded-2xl bg-white/90 px-3.5 py-3 shadow-sm backdrop-blur">
        <div className="mb-1 flex items-center gap-2">
          <Cheddar size={18} />
          <span className="text-[12px] font-medium text-admin-muted">치즈모아</span>
          <span className="ml-auto text-[12px] text-admin-muted">지금</span>
        </div>
        <p className={`text-[14px] font-semibold leading-snug ${empty ? 'text-admin-muted' : ''}`}>
          <Added>{AD_PREFIX}</Added> {userTitle}
        </p>
        <p
          className={`mt-0.5 whitespace-pre-line break-words text-[13px] leading-snug ${
            empty ? 'text-admin-muted' : 'text-admin-text'
          }`}
        >
          {userBody}
          {'\n'}
          <Added>{CAMPAIGN_FOOTER}</Added>
        </p>
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-[#6B6459]">
        <Added>칠한 부분</Added>은 서버가 붙여요 ·{' '}
        {/* 앱 착지 규칙(CHMO-874 push_landing.dart) — https 링크는 외부 브라우저, 없으면 앱만 연다 */}
        {link?.trim()
          ? `누르면 외부 브라우저로 ${linkHost(link.trim())} 이(가) 열려요`
          : '누르면 앱만 열려요'}
      </p>
    </div>
  )
}

function Added({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-primary/35 px-0.5 text-inherit">{children}</mark>
}
