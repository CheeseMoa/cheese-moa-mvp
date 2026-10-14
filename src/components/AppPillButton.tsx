import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '../lib/cx'

/**
 * Flutter 앱(CheeseMoa-App) 리디자인의 완전 라운드 필 버튼 (CHMO-899, `app.*` 팔레트).
 *
 * 구 웹 `Button`(`components/ui/Button.tsx`)의 variant 체계(rounded-[14px]·그림자)는 구 cream
 * 팔레트 전제라, 이 버튼의 모양(완전 라운드·52px·그림자 없음)과 매번 `!important`로 싸우게
 * 된다 — CHMO-899가 다루는 공개 페이지(요금·결제·약관·삭제 안내)는 `[[flutter-migration-epic]]`
 * 뒤에도 웹에 남을 화면들이라, 구 Button을 덮어쓰는 대신 앱 `FilledButtonTheme`
 * (`lib/app/theme.dart` — 옐로 배경·잉크 글자·`StadiumBorder`·높이 52)을 그대로 옮긴 전용
 * 컴포넌트를 둔다.
 *
 * primary = 옐로 채움(그 화면의 할 일) · secondary = 흰 바탕 + 잉크 테두리(가는 일 — 앱엔
 * outlined 버튼의 고정 수치가 없어 다이얼로그 TextButton의 잉크 톤을 테두리로 옮겼다).
 */
type PillVariant = 'primary' | 'secondary'

function pillClasses(variant: PillVariant, disabled: boolean | undefined, className?: string) {
  return cx(
    'press inline-flex h-[52px] w-full items-center justify-center rounded-full text-[16px] font-bold transition-colors',
    disabled
      ? 'bg-app-chip text-app-muted'
      : variant === 'primary'
        ? 'bg-primary text-app-ink active:brightness-95'
        : 'border-[1.5px] border-app-ink bg-app-bg text-app-ink active:bg-app-chip',
    className,
  )
}

interface AppPillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant
  children: ReactNode
}

export function AppPillButton({
  variant = 'primary',
  disabled,
  className,
  children,
  ...rest
}: AppPillButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={pillClasses(variant, disabled, className)}
      {...rest}
    >
      {children}
    </button>
  )
}

interface AppPillLinkProps extends Omit<LinkProps, 'className'> {
  variant?: PillVariant
  className?: string
}

export function AppPillLink({ variant = 'primary', className, ...rest }: AppPillLinkProps) {
  return <Link className={pillClasses(variant, false, className)} {...rest} />
}
