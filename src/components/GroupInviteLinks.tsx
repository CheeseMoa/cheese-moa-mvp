import { useApi } from '../hooks/useApi'
import { getInviteInfo } from '../api/groups'
import type { Group, GroupInviteChannel, GroupRole } from '../types/api'
import { copyToClipboard } from '../lib/clipboard'
import { buildJoinUrl } from '../lib/joinLink'
import { shareOrCopy } from '../lib/share'
import { Button, IconShare, InlineRetry, useToast } from './ui'

/** 표시용 URL — 와이어프레임처럼 프로토콜은 떼고 보여준다(복사는 원본 전체) */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

interface RoleCopy {
  /** 섹션 제목 — 선생님은 바로 합류, 학부모님은 신청이라 링크의 이름부터 다르다 */
  linkLabel: string
  notice: string | null
  copyDone: string
  share: (password: string) => string
}

/** 역할별 문안 — 채널 데이터(joinKey·비밀번호·링크)는 API 계층이, 문구는 여기가 소유한다 */
const ROLE_COPY: Record<GroupRole, RoleCopy> = {
  editor: {
    linkLabel: '참여 링크',
    notice: null,
    copyDone: '🧀 참여 링크를 복사했어요',
    share: (password) =>
      `🧀 치즈모아 모임에 초대해요!\n아래 링크로 들어와 비밀번호를 입력하면 함께할 수 있어요.\n비밀번호: ${password}`,
  },
  viewer: {
    linkLabel: '신청 링크',
    notice:
      '학부모님은 참여 신청 후 선생님 승인이 필요해요 · 승인된 자녀와 공통 사진만 볼 수 있어요',
    copyDone: '🧀 신청 링크를 복사했어요',
    // 이 문안이 곧 학부모 온보딩이다(CHMO-565) — 키즈노트·하이클래스류 도메인 관행처럼 사용법은
    // 앱이 아니라 선생님(초대 메시지)이 전한다. 앞으로 일어날 일 세 가지를 순서로 말하고,
    // 카톡에서 잘리지 않게 안내는 3줄을 넘기지 않는다
    share: (password) =>
      `🧀 치즈모아에서 아이 사진을 만나보세요!\n1. 아래 링크로 참여 신청\n2. 선생님 승인 후 참여 완료\n3. 공개되면 우리 아이 사진만 보여드려요\n비밀번호: ${password}`,
  },
}

interface ChannelContentProps {
  channel: GroupInviteChannel
  copy: RoleCopy
  /** 마커를 동봉한 공유용 링크(lib/joinLink) — 복사·공유·표시 전부 이 링크를 쓴다 */
  joinUrl: string
}

/** 안내 문구 + 비밀번호 카드 + [⧉ 링크복사] + 카카오톡 공유 (와이어프레임 307:21) */
function ChannelContent({ channel, copy, joinUrl }: ChannelContentProps) {
  const toast = useToast()

  const copyText = async (text: string, doneMessage: string) => {
    const ok = await copyToClipboard(text)
    toast.show(ok ? doneMessage : '복사하지 못했어요. 다시 시도해 주세요.')
  }

  // OS 공유 시트(카카오톡·라인·문자 등) — 미지원 환경은 전체 메시지 복사로 폴백
  const handleShare = async () => {
    const outcome = await shareOrCopy({
      text: copy.share(channel.password),
      url: joinUrl,
    })
    if (outcome === 'shared' || outcome === 'canceled') return
    toast.show(
      outcome === 'copied'
        ? '🧀 링크와 비밀번호를 복사했어요'
        : '공유하지 못했어요. 다시 시도해 주세요.',
    )
  }

  return (
    <>
      {copy.notice && <p className="text-xs leading-relaxed text-muted">{copy.notice}</p>}
      <div className="mt-2 rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-bold text-muted">비밀번호</p>
        <div className="mt-0.5 flex items-center gap-3">
          <button
            type="button"
            aria-label="비밀번호 복사"
            onClick={() => void copyText(channel.password, '🧀 비밀번호를 복사했어요')}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="truncate text-[26px] font-extrabold tracking-[.06em] text-text">
              {channel.password}
            </span>
            <span aria-hidden="true" className="shrink-0 text-base text-muted">
              ⧉
            </span>
          </button>
          <Button size="sm" onClick={() => void copyText(joinUrl, copy.copyDone)}>
            ⧉ 링크복사
          </Button>
        </div>
        <p className="mt-1.5 truncate text-xs text-muted">{displayUrl(joinUrl)}</p>
      </div>
      <button
        type="button"
        onClick={() => void handleShare()}
        className="mx-auto mt-4 flex flex-col items-center gap-1.5"
      >
        <span
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-text"
          aria-hidden="true"
        >
          <IconShare />
        </span>
        <span className="text-[11px] font-medium text-text">카카오톡 공유</span>
      </button>
    </>
  )
}

interface GroupInviteLinksProps {
  groupId: string
  /** 지금 보고 있는 탭 — 이 역할의 채널을 보여준다 */
  role: GroupRole
  /**
   * 링크 마커(유형·모임명·멤버 수) 원천 — joinKey→모임 정보 조회 API가 없어 합류 화면이
   * 보여줄 정보를 링크에 동봉한다(CHMO-607, lib/joinLink). 도착 전·조회 실패면 마커 없는
   * 링크로 열화된다(합류 자체는 그대로 동작 — 마커 없는 링크는 신청 모달 폴백).
   */
  group?: Group
  /** 이벤트 수 — 상세 응답에 없어(CHMO-192) 호출부가 이벤트 목록 길이로 파생해 준다 */
  eventCount?: number
}

/**
 * 20 초대 화면의 '부르기' 섹션 · GET /groups/:id/invite (CHMO-520).
 * CHMO-446의 통합 초대 시트(05-2) 본문을 그대로 이관한 것이다 — 시트와 20이 선생님/학부모님
 * 세그먼트 탭을 각자 한 벌씩 갖고 있던 중복을 없애면서, 탭 하나가 그 역할의 부르기(이 섹션)·
 * 기다림(대기 신청)·들어온 사람(명단)을 통째로 바꾸게 됐다.
 *
 * 조회 키에 role을 넣지 않는다 — 두 역할이 한 응답에 함께 오므로 탭을 바꿔도 재조회가 없다.
 * 섹션 제목까지 이 컴포넌트가 소유한다 — 채널이 없을 때 제목만 남아 빈 섹션이 되지 않게.
 */
export function GroupInviteLinks({ groupId, role, group, eventCount }: GroupInviteLinksProps) {
  const { data, error, refetch } = useApi(`invite:${groupId}`, (signal) =>
    getInviteInfo(groupId, signal),
  )
  // 초대 응답 채널 키는 teacher/parent 그대로다(BE 내부 식별자 유지 — ADR 021)
  const channel = role === 'viewer' ? data?.parent : data?.teacher
  const copy = ROLE_COPY[role]

  // 링크를 못 불러와도 대기 신청·명단은 가리지 않는다 — 이 화면의 나머지 일은 그대로 할 수 있다
  if (error)
    return (
      <section className="mb-6">
        <InlineRetry message="초대 링크를 불러오지 못했어요" onRetry={refetch} />
      </section>
    )
  // useApi의 idle(효과 실행 전)과 loading 모두 — 자리가 빈 채로 그려지지 않게
  if (!data)
    return (
      <section className="mb-6">
        <p className="text-sm text-muted">초대 링크를 불러오는 중…</p>
      </section>
    )
  // parent 채널이 없는 구계약 실 BE에선 링크만 감춘다(시트는 탭을 통째로 숨겼지만, 이 화면은
  // 같은 탭에 신청·명단이 살아 있어서 탭을 없애면 승인·연결을 할 수 없다)
  if (!channel) return null

  // 일반(GENERAL) 모임의 viewer 키는 합류가 막혀 있다(SPACE404 — BE CHMO-599 AC-6) — 죽은
  // 링크를 만들어 주지 않는다. 20 화면의 일반 모임 라이트 개편(역할 탭 제거)은 후속 티켓 몫
  if (role === 'viewer' && group?.groupType === 'general') return null

  // 합류 화면(02-1·02-2)이 보여줄 정보를 링크에 동봉 — 값은 공유 시점 스냅샷(CHMO-607).
  // 카운트는 일반 모임 02-1만 소비하지만 계약상 유형 무관 동봉한다(마커는 있으면 그리는 값)
  const joinUrl = buildJoinUrl(window.location.origin, channel.joinKey, {
    groupType: group?.groupType,
    role,
    groupName: group?.name,
    memberCount: group?.memberCount,
    eventCount,
  })

  return (
    <section className="mb-6">
      <h3 className="text-[12px] tracking-[0.06em] text-muted">{copy.linkLabel}</h3>
      <div className="mt-2">
        <ChannelContent channel={channel} copy={copy} joinUrl={joinUrl} />
      </div>
    </section>
  )
}
