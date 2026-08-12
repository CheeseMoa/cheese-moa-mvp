import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getInviteInfo } from '../api/groups'
import { InviteSecretModal } from './InviteSecretModal'
import type { Group, GroupInviteChannel, GroupRole } from '../types/api'
import { cx } from '../lib/cx'
import { copyToClipboard } from '../lib/clipboard'
import { buildJoinUrl } from '../lib/joinLink'
import { shareOrCopy } from '../lib/share'
import { trackEvent } from '../lib/analytics'
import { Button, IconCopy, IconShare, InlineRetry, useToast } from './ui'

interface RoleCopy {
  /** 섹션 제목 — 관리자는 바로 합류, 멤버는 신청이라 링크의 이름부터 다르다 */
  linkLabel: string
  notice: string | null
  share: (password: string) => string
}

/**
 * 문안 3종 — 채널 데이터(joinKey·비밀번호·링크)는 API 계층이, 문구는 여기가 소유한다.
 * 비즈니스는 역할별 2종, 일반 모임은 역할이 없어 1종이다(CHMO-610).
 *
 * **공유 문안에는 참여 코드를 싣지 않는다**(CHMO-676) — 함께 나가는 링크가 이미 코드를 품고
 * 있어 같은 값이 두 번이고, 카톡에서 잘리지 않게 3줄로 맞춘 안내가 길어진다. 코드는 링크를
 * 보낼 수 없는 자리(구두·문자)에서 쓰는 값이라 화면에서 따로 복사하는 게 그 경로다.
 * 유치원 어휘(선생님·학부모·자녀)는 걷어내고 관리자/멤버/인물로 중립화했다 — 같은 링크가
 * 유치원에도 동호회에도 나가므로, 받는 사람이 자기 모임 얘기로 읽혀야 한다.
 */
const ROLE_COPY: Record<GroupRole, RoleCopy> = {
  editor: {
    linkLabel: '참여 링크',
    notice: null,
    share: (password) =>
      `🧀 치즈모아 모임에 초대해요!\n아래 링크로 들어와 비밀번호를 입력하면 함께할 수 있어요.\n비밀번호: ${password}`,
  },
  viewer: {
    linkLabel: '신청 링크',
    notice: '멤버는 참여 신청 후 관리자 승인이 필요해요 · 연결된 인물과 공통 사진만 볼 수 있어요',
    // 이 문안이 곧 멤버 온보딩이다(CHMO-565) — 키즈노트·하이클래스류 도메인 관행처럼 사용법은
    // 앱이 아니라 관리자(초대 메시지)가 전한다. 앞으로 일어날 일 세 가지를 순서로 말하고,
    // 카톡에서 잘리지 않게 안내는 3줄을 넘기지 않는다
    share: (password) =>
      `🧀 치즈모아에서 사진을 만나보세요!\n1. 아래 링크로 참여 신청\n2. 관리자 승인 후 참여 완료\n3. 공개되면 연결된 인물의 사진을 볼 수 있어요\n비밀번호: ${password}`,
  },
}

/**
 * 일반 모임 — 승인도 역할도 없어 링크가 하나뿐이다. 안내 한 줄이 그 사실을 말한다
 * (기다릴 일이 없다는 게 초대하는 쪽이 알아야 할 유일한 차이다).
 */
const GENERAL_COPY: RoleCopy = {
  linkLabel: '초대 링크',
  notice: '링크와 비밀번호가 함께 전달돼요. 받은 사람은 바로 멤버가 돼요.',
  share: (password) =>
    `🧀 치즈모아 모임에 초대해요!\n아래 링크로 들어와 비밀번호를 입력하면 함께할 수 있어요.\n비밀번호: ${password}`,
}

interface SecretRowProps {
  label: string
  value: string
  ariaLabel: string
  onCopy: () => void
  /**
   * 옮겨 적는 값(참여 코드)은 등폭 서체로 — Jua는 굵기 하나에 획이 둥글어 `I/l`·`O/0`·대소문자가
   * 뭉개진다. joinKey는 **대소문자를 구분해 매칭**하므로(CHMO-285) 한 글자만 잘못 읽어도 합류가
   * 막힌다. 정확한 전사가 브랜드 일관성보다 중한 자리라 어드민 `font-admin`과 같은 예외를 둔다
   * (시스템 등폭 스택이라 폰트 요청은 늘지 않는다).
   */
  mono?: boolean
}

/** 전달할 값 한 줄 — 라벨 + 값 + 복사 아이콘. 행 전체가 복사 버튼이다 */
function SecretRow({ label, value, ariaLabel, onCopy, mono }: SecretRowProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onCopy}
      className="flex w-full items-center gap-1.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-muted">{label}</span>
        <span
          className={cx(
            'mt-0.5 block truncate text-text',
            // 코드는 12자라 비밀번호(4자)와 같은 26px로는 카드를 넘긴다 — 길이가 다르므로
            // 크기를 낮춰도 시각 무게는 비슷해진다(둘은 같은 위계의 값이다)
            mono
              ? 'font-mono text-[21px] font-bold tracking-[.02em]'
              : 'text-[26px] font-extrabold tracking-[.06em]',
          )}
        >
          {value}
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted">
        <IconCopy size={18} />
      </span>
    </button>
  )
}

interface ChannelContentProps {
  channel: GroupInviteChannel
  copy: RoleCopy
  /** 마커를 동봉한 공유용 링크(lib/joinLink) — 공유 시트에 실려 나가는 유일한 표면이다 */
  joinUrl: string
}

/** 안내 문구 + 값 카드(참여 코드·비밀번호) + [공유하기] (와이어프레임 307:21) */
function ChannelContent({ channel, copy, joinUrl }: ChannelContentProps) {
  const toast = useToast()

  const copyText = async (text: string, doneMessage: string) => {
    const ok = await copyToClipboard(text)
    toast.show(ok ? doneMessage : '복사하지 못했어요. 다시 시도해 주세요.')
  }

  // OS 공유 시트(카카오톡·라인·문자 등) — 미지원 환경은 전체 메시지 복사로 폴백
  const handleShare = async () => {
    // 초대를 실제로 보냈는가 — 20까지 와서 아무것도 안 보내고 나가는 구간이 있는지 본다
    trackEvent('invite_share')
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
        {/*
         * 전달할 값 둘 — 이 둘만 있으면 링크 없이도 참여가 된다(받는 쪽: 홈 [모임 참여하기] →
         * 02-1 코드·비밀번호 입력, CHMO-672). 종전엔 비밀번호만 카드로 서고 참여 코드는 링크
         * URL 안에 잠겨 있었다(표시 줄은 truncate·[링크복사]는 URL을 통째로 복사) — 받는 쪽
         * 입력란이 요구하는 값을 주는 쪽 화면에서 꺼낼 자리가 없어 수동 참여가 실제로는 닫혀
         * 있었다(CHMO-676). 링크를 보낼 수 있으면 코드가 필요 없으므로, 코드가 쓰이는 자리는
         * 링크가 안 통하는 자리(구두·문자 전달)다.
         */}
        <SecretRow
          label="참여 코드"
          value={channel.joinKey}
          ariaLabel="참여 코드 복사"
          mono
          onCopy={() => void copyText(channel.joinKey, '🧀 참여 코드를 복사했어요')}
        />
        <div className="mt-3 border-t border-border pt-3">
          <SecretRow
            label="비밀번호"
            value={channel.password}
            ariaLabel="비밀번호 복사"
            onCopy={() => void copyText(channel.password, '🧀 비밀번호를 복사했어요')}
          />
        </div>
      </div>
      {/*
       * 링크를 내보내는 길은 공유 시트 하나다(CHMO-683) — 표시용 URL 줄과 [⧉ 링크복사]를 걷었다.
       * 복사한 URL을 어딘가에 붙여넣는 건 공유 시트가 대신 해 주는 일이고, 링크만 따로 보내면
       * 비밀번호가 빠져 받는 쪽이 멈춘다(공유 문안은 링크·비밀번호·안내를 한 덩어리로 낸다).
       * 링크가 안 통하는 자리(구두·문자)는 위 값 카드(참여 코드·비밀번호)가 맡는다.
       *
       * 이 섹션의 유일한 동작이라 원형 아이콘 뱃지(52px 갈색 원 + 11px 라벨)가 아니라 제 크기
       * 버튼으로 세운다 — 위계는 색이 만든다는 규칙(CHMO-530)에서 화면의 첫 번째 일이 가장
       * 작은 표면을 갖고 있을 이유가 없다. 라벨은 '카카오톡 공유'가 아니라 '공유하기'다:
       * 열리는 건 OS 공유 시트라 대상이 카톡·문자·메일 무엇이든 될 수 있고, 미지원 환경에선
       * 복사로 폴백한다(특정 앱 이름을 걸면 그 자리에서 사실이 아니게 된다).
       */}
      <Button fullWidth className="mt-3 gap-2" onClick={() => void handleShare()}>
        <IconShare size={18} />
        공유하기
      </Button>
    </>
  )
}

interface GroupInviteLinksProps {
  groupId: string
  /** 지금 보고 있는 탭 — 이 역할의 채널을 보여준다(일반 모임은 탭이 없어 무시된다) */
  role: GroupRole
  /**
   * 링크 마커(유형·모임명·멤버 수) 원천 — joinKey→모임 정보 조회 API가 없어 합류 화면이
   * 보여줄 정보를 링크에 동봉한다(CHMO-607, lib/joinLink). 도착 전·조회 실패면 마커 없는
   * 링크로 열화된다(합류 자체는 그대로 동작 — 마커 없는 링크는 신청 모달 폴백).
   * **유형 분기의 원천이기도 하다**(CHMO-610) — general이면 채널·문구가 1종으로 수렴한다.
   */
  group?: Group
  /** 이벤트 수 — 상세 응답에 없어(CHMO-192) 호출부가 이벤트 목록 길이로 파생해 준다 */
  eventCount?: number
}

/**
 * 20 초대 화면의 '부르기' 섹션 · GET /groups/:id/invite (CHMO-520).
 * CHMO-446의 통합 초대 시트(05-2) 본문을 그대로 이관한 것이다 — 시트와 20이 역할 세그먼트
 * 탭을 각자 한 벌씩 갖고 있던 중복을 없애면서, 탭 하나가 그 역할의 부르기(이 섹션)·
 * 기다림(대기 신청)·들어온 사람(명단)을 통째로 바꾸게 됐다.
 *
 * **일반 모임은 채널이 하나다**(CHMO-610): 역할이 없어 탭도 없고, 합류가 즉시라 '신청 링크'라는
 * 것 자체가 없다. 채널은 관리자(editor)와 같은 것을 쓰되 문구만 갈린다 — 초대 응답 채널 키
 * teacher/parent는 BE 내부 식별자라 유형과 무관하게 그대로다(ADR 021).
 *
 * 조회 키에 role을 넣지 않는다 — 두 역할이 한 응답에 함께 오므로 탭을 바꿔도 재조회가 없다.
 * 섹션 제목까지 이 컴포넌트가 소유한다 — 채널이 없을 때 제목만 남아 빈 섹션이 되지 않게.
 */
export function GroupInviteLinks({ groupId, role, group, eventCount }: GroupInviteLinksProps) {
  const { data, error, refetch } = useApi(`invite:${groupId}`, (signal) =>
    getInviteInfo(groupId, signal),
  )
  const [editing, setEditing] = useState(false)
  // 일반 모임엔 역할이 없다 — 채널·문구·링크 마커를 전부 관리자(editor) 기준으로 수렴시킨다.
  // 호출부의 탭 상태(기본 viewer)가 그대로 새면 죽은 학부모 키 링크가 만들어진다(GENERAL의
  // viewer 합류는 SPACE404 — BE CHMO-599 AC-6). 유형 미상은 business로 본다(매퍼와 같은 해석).
  const general = group?.groupType === 'general'
  const effectiveRole: GroupRole = general ? 'editor' : role
  // 초대 응답 채널 키는 teacher/parent 그대로다(BE 내부 식별자 유지 — ADR 021)
  const channel = effectiveRole === 'viewer' ? data?.parent : data?.teacher
  const copy = general ? GENERAL_COPY : ROLE_COPY[effectiveRole]

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

  // 합류 화면(02-1·02-2)이 보여줄 정보를 링크에 동봉 — 값은 공유 시점 스냅샷(CHMO-607).
  // 카운트는 일반 모임 02-1만 소비하지만 계약상 유형 무관 동봉한다(마커는 있으면 그리는 값).
  // role은 effectiveRole이다 — 일반 모임에서 죽은 viewer 마커가 실리지 않게(CHMO-610).
  const joinUrl = buildJoinUrl(window.location.origin, channel.joinKey, {
    groupType: group?.groupType,
    role: effectiveRole,
    groupName: group?.name,
    memberCount: group?.memberCount,
    eventCount,
  })

  return (
    <section className="mb-6">
      {/* 제목 줄 우측이 변경 진입점 — 값 카드는 '전달할 값'의 자리라 손대지 않는다(복사가 그
          카드의 유일한 동작). 자주 하는 일이 아니라 12px 텍스트 한 줄로 무게를 낮췄다 */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] tracking-[0.06em] text-muted">{copy.linkLabel}</h3>
        {/* 관리자 채널에서만 — 이 API는 멤버 채널 키·비밀번호를 바꾸지 않는다(CHMO-677) */}
        {effectiveRole === 'editor' ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="-my-1 shrink-0 py-1 text-[12px] text-text"
          >
            ✎ 코드·비밀번호 변경
          </button>
        ) : null}
      </div>
      <div className="mt-2">
        <ChannelContent channel={channel} copy={copy} joinUrl={joinUrl} />
      </div>
      {/* 열려 있을 때만 마운트 — 매 오픈이 지금 값으로 시작한다 */}
      {editing && (
        <InviteSecretModal
          open
          groupId={groupId}
          channel={channel}
          onClose={() => setEditing(false)}
          onUpdated={refetch}
        />
      )}
    </section>
  )
}
