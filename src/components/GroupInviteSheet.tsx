import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi'
import type { ApiRequestError } from '../api/client'
import { getInviteInfo } from '../api/groups'
import type { GroupInviteChannel } from '../types/api'
import { copyToClipboard } from '../lib/clipboard'
import { shareOrCopy } from '../lib/share'
import { BottomSheet, Button, ErrorState, IconShare, useToast } from './ui'

/** 표시용 URL — 와이어프레임처럼 프로토콜은 떼고 보여준다(복사는 원본 전체) */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

/** 탭별 문안 — 채널 데이터(joinKey·비밀번호·링크)는 API 계층이, 문구는 여기가 소유한다 */
const TAB_COPY = {
  teacher: {
    label: '선생님',
    notice: null,
    copyDoneMessage: '🧀 참여 링크를 복사했어요',
    shareText: (password: string) =>
      `🧀 치즈모아 모임에 초대해요!\n아래 링크로 들어와 비밀번호를 입력하면 함께할 수 있어요.\n비밀번호: ${password}`,
  },
  parent: {
    label: '학부모님',
    notice:
      '학부모님은 참여 신청 후 선생님 승인이 필요해요 · 승인된 자녀와 공통 사진만 볼 수 있어요',
    copyDoneMessage: '🧀 신청 링크를 복사했어요',
    shareText: (password: string) =>
      `🧀 치즈모아에서 아이 사진을 만나보세요!\n아래 링크로 참여 신청하면, 선생님 승인 후 아이 앨범을 볼 수 있어요.\n비밀번호: ${password}`,
  },
} as const

type TabKey = keyof typeof TAB_COPY
const TAB_KEYS = Object.keys(TAB_COPY) as TabKey[]

function SheetPending({ error, onRetry }: { error: ApiRequestError | null; onRetry: () => void }) {
  if (error)
    return <ErrorState error={error} onRetry={onRetry} unauthorizedTo="/login" className="py-8" />
  // useApi의 idle(효과 실행 전)과 loading 모두 — 본문이 빈 채로 그려지지 않게 기본은 로딩 문구
  return <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
}

interface ChannelContentProps {
  channel: GroupInviteChannel
  copy: (typeof TAB_COPY)[TabKey]
}

/** 탭 본문(와이어프레임 307:21): 안내 문구 + 비밀번호 카드 + [⧉ 링크복사] + 카카오톡 공유 */
function ChannelContent({ channel, copy }: ChannelContentProps) {
  const toast = useToast()

  const copyText = async (text: string, doneMessage: string) => {
    const ok = await copyToClipboard(text)
    toast.show(ok ? doneMessage : '복사하지 못했어요. 다시 시도해 주세요.')
  }

  // OS 공유 시트(카카오톡·라인·문자 등) — 미지원 환경은 전체 메시지 복사로 폴백
  const handleShare = async () => {
    const outcome = await shareOrCopy({
      text: copy.shareText(channel.password),
      url: channel.joinUrl,
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
      {copy.notice && <p className="mt-3 text-xs leading-relaxed text-muted">{copy.notice}</p>}
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
          <Button size="sm" onClick={() => void copyText(channel.joinUrl, copy.copyDoneMessage)}>
            ⧉ 링크복사
          </Button>
        </div>
        <p className="mt-1.5 truncate text-xs text-muted">{displayUrl(channel.joinUrl)}</p>
      </div>
      <button
        type="button"
        onClick={() => void handleShare()}
        className="mt-5 flex flex-col items-center gap-1.5"
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

interface GroupInviteSheetProps {
  groupId: string
  open: boolean
  onClose: () => void
}

/**
 * 05-2. 통합 초대 바텀시트 · node 307:21 · GET /groups/:id/invite (CHMO-446).
 * 기존 InviteSheet(선생님)·ParentShareSheet(학부모 공유) 2개 시트를 이 하나로 대체 —
 * 선생님/학부모님 세그먼트 탭으로 채널을 고른다. 링크(joinKey 2종)가 role을 정하므로(Q6)
 * 탭은 문안·안내만 바꾸고, 학부모 비밀번호는 기존 sharePassword 재사용이다(Q2).
 * 초대 정보는 TEACHER 전용(Q3) — PARENT는 05 진입 자체가 없다(§7-3).
 *
 * 구계약 공존: 현재 배포된 실 BE는 선생님 채널만 줘서(parent null — getInviteInfo가 흡수)
 * 탭을 숨기고 선생님 내용만 보여준다. BE 초안 배포 후 non-null이 보장되면 좁힌다.
 */
export function GroupInviteSheet({ groupId, open, onClose }: GroupInviteSheetProps) {
  const [tab, setTab] = useState<TabKey>('teacher')
  // 닫힘→열림 전환에만 첫 탭으로 초기화(지난번에 보던 탭이 남지 않게)
  useEffect(() => {
    if (open) setTab('teacher')
  }, [open])

  // 열릴 때만 조회 — 닫힌 시트가 비밀번호 평문을 미리 받아두지 않게
  const { data, error, refetch } = useApi(open ? `invite:${groupId}` : null, (signal) =>
    getInviteInfo(groupId, signal),
  )

  // parent 채널이 없으면(구계약) 탭 상태와 무관하게 항상 선생님 내용
  const activeTab: TabKey = tab === 'parent' && data?.parent ? 'parent' : 'teacher'
  const channel = activeTab === 'parent' ? data?.parent : data?.teacher

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="초대하기"
      subtitle="함께 관리할 선생님과, 아이 사진을 볼 학부모님을 초대하세요"
    >
      {data && channel ? (
        <>
          {data.parent && (
            <div
              role="tablist"
              aria-label="초대 대상"
              className="mt-3 flex rounded-full bg-surface p-1"
            >
              {TAB_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  onClick={() => setTab(key)}
                  className={`flex-1 rounded-full py-2 text-sm transition ${
                    activeTab === key ? 'bg-primary font-bold text-text' : 'font-medium text-muted'
                  }`}
                >
                  {TAB_COPY[key].label}
                </button>
              ))}
            </div>
          )}
          <ChannelContent channel={channel} copy={TAB_COPY[activeTab]} />
        </>
      ) : (
        <SheetPending error={error} onRetry={refetch} />
      )}
    </BottomSheet>
  )
}
