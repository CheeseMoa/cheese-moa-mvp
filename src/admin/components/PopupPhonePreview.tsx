import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AdminPopupHideOption, AdminPopupLocale } from '../api/types'
import { POPUP_FIXED_COPY } from '../lib/promotion'

/** 앱 논리 해상도(390×844 — 서비스 기준 프레임)를 그대로 그리고 축소한다 */
const PHONE_WIDTH = 390
const PHONE_HEIGHT = 844
const SCALE = 0.78

/**
 * 앱 팝업 폰 미리보기 (CHMO-928) — 앱 `EventPopupCard`(CHMO-927 `event_popup.dart`)와 **같은 배치·
 * 같은 수치**로 그린다: 딤 55% 위 가운데 흰 카드(좌우 24 · 라운드 24 · 최대 폭 400) · 이미지 4:5
 * (BoxFit.cover — 비율이 다르면 잘린다) · ctaLabel이 있으면 옐로 필(최소 높이 52 · 17pt 굵게) ·
 * 맨 아래 줄 [오늘 하루 보지 않기] | [닫기](hideOption NONE이면 [닫기]만, 필이 없으면 위에 가는 선).
 *
 * 앱 수치를 논리 px 그대로 쓰고 통째로 줄인다(SCALE) — 크기를 따로 맞추면 앱과 비율이 어긋난다.
 * 하단 고정 문구는 팝업의 언어로 그린다(앱이 표시 언어에 맞춰 넣는 ARB 문구).
 */
export function PopupPhonePreview({
  imageUrl,
  imageAlt,
  ctaLabel,
  hideOption,
  locale,
}: {
  imageUrl: string | null
  imageAlt: string
  ctaLabel: string | null
  hideOption: AdminPopupHideOption
  locale: AdminPopupLocale
}) {
  const copy = POPUP_FIXED_COPY[locale]
  const cta = ctaLabel?.trim() ? ctaLabel.trim() : null

  return (
    <div
      className="relative overflow-hidden rounded-[34px] border-[6px] border-admin-text bg-admin-text shadow-xl"
      style={{ width: PHONE_WIDTH * SCALE + 12, height: PHONE_HEIGHT * SCALE + 12 }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-[28px] bg-white font-sans"
        style={{ width: PHONE_WIDTH, height: PHONE_HEIGHT, transform: `scale(${SCALE})` }}
      >
        <FakeHome />
        {/* 딤 — 앱 barrierColor 0x8C1B1B1B(#1B1B1B 55%) */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#1B1B1B]/55 px-6">
          <div className="w-full max-w-[400px] overflow-hidden rounded-[24px] bg-white">
            <div className="relative aspect-[4/5] w-full bg-[#F5F5F7]">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={imageAlt}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-[17px] leading-relaxed text-[#8E8E93]">
                  이미지를 올리면
                  <br />
                  여기에 보여요
                </div>
              )}
            </div>
            {cta ? (
              <div className="px-4 pb-1 pt-4">
                <div className="flex min-h-[52px] items-center justify-center rounded-full bg-primary px-5 py-3.5">
                  <FitText className="text-[17px] font-extrabold text-[#1B1B1B]">{cta}</FitText>
                </div>
              </div>
            ) : null}
            <div className={`flex ${cta ? '' : 'border-t border-[#EBEBEB]'}`}>
              {hideOption === 'TODAY' ? (
                <>
                  <BottomAction className="font-medium text-[#8E8E93]">{copy.hideToday}</BottomAction>
                  <div className="my-[18px] w-px bg-[#EBEBEB]" aria-hidden="true" />
                </>
              ) : null}
              <BottomAction className="font-bold text-[#1B1B1B]">{copy.close}</BottomAction>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BottomAction({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] flex-1 items-center justify-center px-3 py-3.5">
      <FitText className={`text-[15px] ${className}`}>{children}</FitText>
    </div>
  )
}

/**
 * 한 줄로 줄여 맞추기 — 앱의 `FittedBox(fit: scaleDown)`(서버 글자라 길이를 모른다). 넘치면
 * 자르지 않고 글자를 작게 그려, 운영자가 긴 버튼 문구가 앱에서 어떻게 보일지 그대로 본다.
 */
function FitText({ className, children }: { className: string; children: ReactNode }) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text) return
    const available = box.clientWidth
    const needed = text.scrollWidth
    setScale(needed > available && needed > 0 ? available / needed : 1)
  }, [children])

  return (
    <span ref={boxRef} className="flex w-full min-w-0 justify-center overflow-hidden">
      <span
        ref={textRef}
        className={`inline-block origin-center whitespace-nowrap ${className}`}
        style={scale < 1 ? { transform: `scale(${scale})` } : undefined}
      >
        {children}
      </span>
    </span>
  )
}

/** 딤 뒤의 홈 — 팝업이 무엇 위에 뜨는지만 보이면 된다(실제 홈을 흉내 내지 않는다) */
function FakeHome() {
  return (
    <div className="absolute inset-0 px-5 pt-16" aria-hidden="true">
      <div className="mb-6 h-7 w-28 rounded-md bg-[#F5F4F1]" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-4 rounded-[20px] border border-[#EBEBEB] p-4">
          <div className="mb-3 h-32 rounded-xl bg-[#F5F5F7]" />
          <div className="h-4 w-2/3 rounded bg-[#F5F4F1]" />
        </div>
      ))}
    </div>
  )
}
