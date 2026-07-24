import { useApi } from '../hooks/useApi'
import type { ApiRequestError } from '../api/client'
import { getInviteInfo, getShareInfo } from '../api/groups'
import { copyToClipboard } from '../lib/clipboard'
import { shareOrCopy } from '../lib/share'
import { BottomSheet, Button, ErrorState, IconShare, useToast } from './ui'

interface SheetProps {
  groupId: string
  open: boolean
  onClose: () => void
}

/** 표시용 URL — 와이어프레임처럼 프로토콜은 떼고 보여준다(복사는 원본 전체) */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

function SheetPending({ error, onRetry }: { error: ApiRequestError | null; onRetry: () => void }) {
  if (error)
    return <ErrorState error={error} onRetry={onRetry} unauthorizedTo="/login" className="py-8" />
  // useApi의 idle(효과 실행 전)과 loading 모두 — 본문이 빈 채로 그려지지 않게 기본은 로딩 문구
  return <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
}

interface ShareInfoContentProps {
  passwordLabel: string
  password: string
  url: string
  /** 링크 복사 성공 토스트 문구 */
  copyDoneMessage: string
  /** 네이티브 공유 본문(링크 제외 — shareOrCopy가 url을 따로 싣는다) */
  shareText: string
  /** 카드 아래 보조 안내(학부모 시트의 공개 범위 등) */
  footnote?: string
}

/** 시트 본문 공통(와이어프레임 211:1556): 비밀번호 카드 + [⧉ 링크복사] + URL + 네이티브 공유 */
function ShareInfoContent({
  passwordLabel,
  password,
  url,
  copyDoneMessage,
  shareText,
  footnote,
}: ShareInfoContentProps) {
  const toast = useToast()

  const copy = async (text: string, doneMessage: string) => {
    const ok = await copyToClipboard(text)
    toast.show(ok ? doneMessage : '복사하지 못했어요. 다시 시도해 주세요.')
  }

  // OS 공유 시트(카카오톡·라인·문자 등) — 미지원 환경은 전체 메시지 복사로 폴백
  const handleShare = async () => {
    const outcome = await shareOrCopy({ text: shareText, url })
    if (outcome === 'shared' || outcome === 'canceled') return
    toast.show(
      outcome === 'copied'
        ? '🧀 링크와 비밀번호를 복사했어요'
        : '공유하지 못했어요. 다시 시도해 주세요.',
    )
  }

  return (
    <>
      <div className="mt-2 rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-bold text-muted">{passwordLabel}</p>
        <div className="mt-0.5 flex items-center gap-3">
          <button
            type="button"
            aria-label={`${passwordLabel} 복사`}
            onClick={() => void copy(password, '🧀 비밀번호를 복사했어요')}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="truncate text-[26px] font-extrabold tracking-[.06em] text-text">
              {password}
            </span>
            <span aria-hidden="true" className="shrink-0 text-base text-muted">
              ⧉
            </span>
          </button>
          <Button size="sm" onClick={() => void copy(url, copyDoneMessage)}>
            ⧉ 링크복사
          </Button>
        </div>
        <p className="mt-1.5 truncate text-xs text-muted">{displayUrl(url)}</p>
      </div>
      {footnote && <p className="mt-3 text-xs leading-relaxed text-muted">{footnote}</p>}
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
        <span className="text-[11px] font-medium text-text">공유하기</span>
      </button>
    </>
  )
}

/**
 * 초대(선생님 초대하기) 시트 · node 211:1556 · GET /groups/:id/invite (F2.3).
 * 05 위에 바텀시트로 뜬다(확정 — 별도 페이지 아님). 받은 사람은 참여 링크(/join/:joinKey)로
 * 진입해 모임 비밀번호를 입력해 합류(02-1). 학부모 공개와 별개 입구.
 */
export function InviteSheet({ groupId, open, onClose }: SheetProps) {
  // 열릴 때만 조회 — 닫힌 시트가 비밀번호 평문을 미리 받아두지 않게
  const { data, error, refetch } = useApi(open ? `invite:${groupId}` : null, (signal) =>
    getInviteInfo(groupId, signal),
  )
  return (
    <BottomSheet open={open} onClose={onClose} title="초대하기" subtitle="참여자를 초대하세요">
      {data ? (
        <ShareInfoContent
          passwordLabel="비밀번호"
          password={data.password}
          url={data.joinUrl}
          copyDoneMessage="🧀 참여 링크를 복사했어요"
          shareText={`🧀 치즈모아 모임에 초대해요!\n아래 링크로 들어와 비밀번호를 입력하면 함께할 수 있어요.\n비밀번호: ${data.password}`}
        />
      ) : (
        <SheetPending error={error} onRetry={refetch} />
      )}
    </BottomSheet>
  )
}

/**
 * 학부모 공유 시트 · GET /groups/:id/share (F6.3 — 모임 단위 확정, 와이어프레임 없음 · 초대 시트와 동일 폼).
 * 모임 공유 링크 + 학부모 전용 비밀번호(모임 비밀번호와 별개)를 전달.
 * 학부모는 링크 진입(/share/:token) 후 비밀번호를 넣어 공개된 이벤트만 본다.
 */
export function ParentShareSheet({ groupId, open, onClose }: SheetProps) {
  const { data, error, refetch } = useApi(open ? `share-info:${groupId}` : null, (signal) =>
    getShareInfo(groupId, signal),
  )
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="학부모님에게 공유"
      subtitle="링크와 비밀번호를 학부모님께 전달하세요"
    >
      {data ? (
        <ShareInfoContent
          passwordLabel="학부모 전용 비밀번호"
          password={data.password}
          url={data.url}
          copyDoneMessage="🧀 공유 링크를 복사했어요"
          shareText={`🧀 치즈모아에서 아이들 사진을 만나보세요!\n아래 링크로 들어와 비밀번호를 입력하면 공개된 앨범을 볼 수 있어요.\n비밀번호: ${data.password}`}
          footnote="학부모님은 이 링크와 비밀번호로 공개된 이벤트만 볼 수 있어요."
        />
      ) : (
        <SheetPending error={error} onRetry={refetch} />
      )}
    </BottomSheet>
  )
}
