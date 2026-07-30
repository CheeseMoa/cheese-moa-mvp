import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { ApiRequestError } from '../../api/client'
import { toErrorMessage, toErrorReference } from '../../api/client'
import { cx } from '../../lib/cx'
import { Button, ButtonLink } from './Button'

interface ErrorStateProps {
  error: ApiRequestError
  /** 재요청(refetch) — 404 복귀 CTA가 없을 때 [다시 시도]로 노출. 영구 실패만 다루는 화면은 생략 */
  onRetry?: () => void
  /** 401(토큰 무효 — apiFetch가 이미 삭제) 복귀 목적지(로그인/잠금 해제) — 지정하면 즉시 리다이렉트 */
  unauthorizedTo?: string
  /**
   * 영구 실패(재시도해도 결과가 같음) 복귀 목적지 — 지정하면 [다시 시도] 대신 돌아가기 CTA.
   * 404(없음)뿐 아니라 **403(승인 대기·권한 없음)** 도 여기로 받는다(CHMO-475 — 선생님도
   * 승인제가 되며 제작자 화면이 승인 전 딥링크로 403을 만날 수 있다).
   */
  notFoundTo?: string
  /** 돌아가기 CTA 라벨 (기본 '돌아가기') */
  notFoundLabel?: string
  /** 컨테이너 세로 여백 교체용(시트는 py-8 등 — 기본 py-11) */
  className?: string
  /** CTA 아래 추가 액션(커스텀 복귀 버튼 등) */
  children?: ReactNode
}

/**
 * useApi 실패 공용 표시 — warn 메시지(role=alert) + 복구 액션 (CHMO-118 에러 상태 정리).
 * 401은 재시도가 영원히 실패하므로 unauthorizedTo로 재인증 화면 복귀,
 * 404·403은 재시도해도 같은 결과라 notFoundTo가 있으면 [다시 시도] 대신 복귀 CTA를 준다
 * (403 = 승인 대기(SPACE403)·role 부족(ROLE403) — 둘 다 이 화면에서 할 수 있는 일이 없다).
 *
 * 맨 아래 회색 한 줄은 제보용 오류 식별 문구다(CHMO-500) — 사용자가 화면을 캡처해 보내오면
 * 그 값으로 서버 로그를 곧바로 특정한다. **여기에만 노출한다**: 화면이 통째로 실패해 사용자가
 * 멈춰 서 있는 자리라서다. 3초 뒤 사라지는 토스트에 같은 줄을 넣으면 복사할 틈은 없는 채로
 * 평상시 화면이 상태 코드로 지저분해진다.
 */
export function ErrorState({
  error,
  onRetry,
  unauthorizedTo,
  notFoundTo,
  notFoundLabel = '돌아가기',
  className,
  children,
}: ErrorStateProps) {
  if (error.status === 401 && unauthorizedTo) return <Navigate to={unauthorizedTo} replace />
  const reference = toErrorReference(error)
  return (
    <div className={cx('flex flex-col items-center gap-3', className ?? 'py-11')}>
      <p role="alert" className="text-center text-sm text-warn">
        {toErrorMessage(error)}
      </p>
      {(error.status === 404 || error.status === 403) && notFoundTo ? (
        <ButtonLink to={notFoundTo} replace size="sm" variant="secondary">
          {notFoundLabel}
        </ButtonLink>
      ) : onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
      {children}
      {/* select-all: 길게 눌렀을 때 단어 하나가 아니라 줄 전체가 잡힌다 */}
      {reference ? <p className="select-all text-[11px] text-muted">{reference}</p> : null}
    </div>
  )
}
