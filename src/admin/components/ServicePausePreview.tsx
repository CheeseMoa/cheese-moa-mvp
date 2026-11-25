import type { Locale } from '../api/operationSettings'
import { Cheddar } from '../../components/ui/Cheddar'
import { SERVICE_PAUSE_COPY, noticeDisplay } from '../lib/serviceStatus'

/** 미리보기 기준 폭(티켓 지정 375 · 작은 아이폰 논리 폭) */
const WIDTH = 375
const MIN_HEIGHT = 667

/**
 * 앱 시작 안내 화면 미리보기 (CHMO-994 · 앱 화면은 APP CHMO-995).
 *
 * 앱 화면이 아직 확정 전이라 앱 팔레트(`app.*` 토큰)와 티켓에 적힌 구성(아이콘·제목·본문·
 * 「지금 할 수 있어요 / 잠시 멈춰요」 목록·버튼)으로 그린 근사치다. 목적은 운영자가 **문구의 길이와
 * 줄바꿈**을 앱 폭에서 확인하는 것이라, 글자를 줄이거나 자르지 않고 높이가 늘어나게 둔다.
 */
export function ServicePausePreview({
  locale,
  title,
  body,
}: {
  locale: Locale
  title: string
  body: string
}) {
  const copy = SERVICE_PAUSE_COPY[locale]
  const shown = noticeDisplay(locale, title, body)
  return (
    <figure className="space-y-2">
      <div
        className="flex flex-col overflow-hidden rounded-[28px] border-[6px] border-admin-text bg-app-bg font-sans text-app-ink shadow-lg"
        style={{ width: WIDTH + 12, minHeight: MIN_HEIGHT + 12 }}
        lang={locale}
      >
        <div className="flex flex-1 flex-col px-6 pb-6 pt-14">
          <div className="flex justify-center">
            <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-app-iconBg">
              <Cheddar size={56} />
            </span>
          </div>
          <p className="mt-6 whitespace-pre-wrap break-words text-center text-[22px] font-bold leading-snug">
            {shown.title}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words text-center text-[15px] leading-relaxed text-app-inkSub">
            {shown.body}
          </p>
          <div className="mt-7 space-y-3">
            <PreviewList label={copy.availableLabel} items={copy.available} kind="available" />
            <PreviewList label={copy.stoppedLabel} items={copy.stopped} kind="stopped" />
          </div>
          <div className="mt-auto pt-8">
            <div className="flex min-h-[52px] items-center justify-center rounded-full bg-primary px-5 py-3.5 text-[17px] font-extrabold text-app-ink">
              {copy.signedIn}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="text-xs leading-relaxed text-admin-muted">
        앱 화면 확정 전 근사치예요(폭 {WIDTH}). 로그아웃 상태에서는 버튼이 [{copy.signedOut}]으로
        바뀌어요.
      </figcaption>
    </figure>
  )
}

function PreviewList({
  label,
  items,
  kind,
}: {
  label: string
  items: string[]
  kind: 'available' | 'stopped'
}) {
  return (
    <div className="rounded-2xl bg-app-chip px-4 py-3.5">
      <p className="text-[13px] font-semibold text-app-inkSub">{label}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[15px] leading-snug">
            <PreviewIcon kind={kind} />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 체크(되는 것)·일시정지(멈춘 것) — 같은 굵기의 선 아이콘 한 벌 */
function PreviewIcon({ kind }: { kind: 'available' | 'stopped' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`mt-0.5 h-4 w-4 shrink-0 ${kind === 'available' ? 'text-app-ink' : 'text-app-muted'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'available' ? (
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      ) : (
        <>
          <path d="M9 6v12" />
          <path d="M15 6v12" />
        </>
      )}
    </svg>
  )
}
