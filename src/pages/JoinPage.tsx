import { useEffect, useRef } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { JoinGroupModal } from '../components/JoinGroupModal'
import { ParentJoinPage } from './ParentJoinPage'
import { useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { findMyGroupByJoinKey } from '../api/groups'
import { isAuthenticated } from '../lib/auth'

/**
 * 02-1. 모임 참여 (초대 링크 진입) · node 211:1520 · POST /groups/join.
 * 참여는 로그인 전제 — 미로그인이면 returnTo를 실어 로그인으로 보내고, 완료 후 이 링크로 복귀한다.
 * 이미 참여한 모임의 링크 재진입은 비밀번호를 묻지 않고 바로 모임 상세로 보낸다(사전 감지).
 * 단 **승인 대기(PENDING) 중인 모임은 사전 감지에 걸리지 않는다** — 초대 정보 조회가 ACTIVE
 * TEACHER 전용이라 대기 중엔 404로 은닉되기 때문(CHMO-475로 선생님도 이 구간이 생겼다).
 * 이 경우 모달이 뜨고, 비밀번호를 넣으면 서버 409("이미 참여 신청한 모임입니다.")가 안내한다.
 *
 * 학부모 초대 링크(?role=parent — 마커는 FE가 파생, api/groups.ts)는 02-2 3단계(ParentJoinPage)로
 * 분기한다(CHMO-445). joinKey 자체는 불투명이라 진입 시점에 role을 알 근거가 URL뿐이다.
 * 이 경우 사전 감지는 건너뛴다 — 초대 정보 대조는 TEACHER 전용(Q3)이라 학부모 멤버십에선
 * ROLE403/404로 항상 실패하고, 중복 신청·참여는 1/3 프로브 제출의 409가 그 자리에서 안내한다.
 */
export function JoinPage() {
  const { joinKey } = useParams<{ joinKey: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const authed = isAuthenticated()

  // 코드가 비는 잘못된 링크(/join/%20 등)는 고정 모드로 죽은 폼이 되므로 직접 입력 모드로 폴백
  // joinKey는 대소문자 구분 — 대소문자 변환 없이 그대로 쓴다(CHMO-285)
  const fixedJoinKey = joinKey?.trim() ? joinKey.trim() : undefined
  const isParentLink = searchParams.get('role') === 'parent'

  // 이미 멤버인지 사전 감지 — 목록 응답엔 joinKey가 없어(시크릿 미노출, CHMO-192)
  // 내 모임들의 초대 정보로 대조한다. 조회 실패 시에는 기존처럼 모달을 띄운다(참여를 막지 않음)
  const { data: memberGroup, loading } = useApi(
    authed && fixedJoinKey && !isParentLink ? `member-group:${fixedJoinKey}` : null,
    (signal) => findMyGroupByJoinKey(fixedJoinKey ?? '', signal),
  )

  const redirected = useRef(false)
  useEffect(() => {
    if (!memberGroup || redirected.current) return
    redirected.current = true
    toast.show('🧀 이미 참여 중인 모임이에요')
    navigate(`/groups/${memberGroup.id}`, { replace: true })
  }, [memberGroup, navigate, toast])

  if (!authed)
    return (
      <Navigate
        to="/login"
        replace
        // 학부모 링크 마커를 잃으면 로그인 복귀 후 02-1 모달로 떨어진다 — 쿼리까지 보존
        state={{ returnTo: `/join/${joinKey ?? ''}${isParentLink ? '?role=parent' : ''}` }}
      />
    )

  if (isParentLink && fixedJoinKey) return <ParentJoinPage joinKey={fixedJoinKey} />

  return (
    <PhoneShell>
      {/* 멤버십 확인 중·이동 대기 중엔 비밀번호 모달을 띄우지 않는다(깜빡임·불필요한 입력 방지) */}
      <JoinGroupModal
        open={!loading && !memberGroup}
        fixedJoinKey={fixedJoinKey}
        onClose={() => navigate('/home', { replace: true })}
      />
    </PhoneShell>
  )
}
