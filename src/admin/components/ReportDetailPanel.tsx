import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import { getAdminReport, replyAdminReport, updateAdminReportStatus } from '../api/admin'
import type { AdminReportDetail, AdminReportRow, AdminReportStatus } from '../api/types'
import {
  formatDateTime,
  groupLabel,
  isReportType,
  memberRoleLabel,
  reportClientLabel,
  reportStatusLabel,
  socialProvidersLabel,
} from '../lib/format'
import { AdminCloseIcon } from './AdminCloseIcon'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import { AdminImageViewer } from './AdminImageViewer'
import { AdminErrorMessage } from './AdminMessage'
import { AdminRowMenu } from './AdminRowMenu'
import { ReportStatusBadge, ReportTypeBadge } from './StatusBadge'

/** BE `ReplyAdminReportUseCase.MAX_CONTENT_LENGTH` — trim 후 1~2,000자 */
const REPLY_MAX = 2000

const ALL_STATUSES: AdminReportStatus[] = ['RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED']

/**
 * 상태 변경 — 기관 문의(CHMO-811)와 같은 결: 전이 규칙이 없어 언제나 나머지 셋으로 갈 수 있지만
 * 나란히 두지 않고, 라벨은 상태 이름이 아니라 **동사**다.
 *
 * - 주 버튼은 `접수됨`에서만 [확인 중으로 표시] — 들여다보기 시작했다는 팀 내 신호가 이 화면에서
 *   가장 먼저 하는 일이다. 그 뒤의 주 동작은 상태 버튼이 아니라 **답변 작성**이라 버튼이 없다.
 * - `답변 완료`는 답변이 있을 때만 메뉴에 둔다 — 답이 없으면 BE가 VALID400으로 거절하고,
 *   답변 완료는 [답변 보내기]가 만드는 상태다.
 */
function statusActions(report: AdminReportDetail): {
  primary: AdminReportStatus | null
  menu: AdminReportStatus[]
} {
  const primary: AdminReportStatus | null = report.status === 'RECEIVED' ? 'IN_PROGRESS' : null
  const menu = ALL_STATUSES.filter(
    (to) => to !== report.status && to !== primary && (to !== 'ANSWERED' || report.reply !== null),
  )
  return { primary, menu }
}

function statusActionLabel(from: AdminReportStatus, to: AdminReportStatus): string {
  if (to === 'IN_PROGRESS') return from === 'RECEIVED' ? '확인 중으로 표시' : '확인 중으로 되돌리기'
  if (to === 'RECEIVED') return '접수됨으로 되돌리기'
  if (to === 'ANSWERED') return '답변 완료로 표시'
  return '종료하기'
}

interface ReportDetailPanelProps {
  reportId: number
  onClose: () => void
  /** [이어서 문의] 이전 문의 링크 — 같은 패널에서 그 문의로 넘어간다 */
  onSelect: (id: number) => void
  /** 답변·전이 성공 — 목록의 그 행을 제자리에서 바꿔 끼운다 */
  onRowUpdated: (row: AdminReportRow) => void
  /** REPORT404 — 목록이 낡았다는 뜻이라 호출부가 안내·재조회·패널 닫기를 맡는다 */
  onGone: () => void
  showToast: (message: string) => void
}

/**
 * 신고·문의 상세 패널 (CHMO-862 — BE CHMO-861).
 *
 * 목록 오른쪽에 붙는 곁 패널이다(모달이 아니라). 신고·문의는 한 건씩 읽고 답하고 다음 건으로
 * 넘어가는 일이라, 목록을 가리지 않아야 다음 행을 바로 누를 수 있다.
 *
 * 호출부가 `key={reportId}`로 붙인다 — 다른 건을 열면 답변 초안·오류·열린 메뉴가 통째로 새로
 * 시작한다(안 그러면 쓰던 초안이 다른 사람의 문의에 딸려 간다).
 */
export function ReportDetailPanel({
  reportId,
  onClose,
  onSelect,
  onRowUpdated,
  onGone,
  showToast,
}: ReportDetailPanelProps) {
  const detail = useApi(`admin-report:${reportId}`, (signal) => getAdminReport(reportId, signal))

  /**
   * 답변·전이의 응답으로 받은 최신 상태 — 재조회하지 않는다(답변 응답은 상세 형태, 전이 응답은
   * 행 형태라 상세에 덧씌운다). 재조회하면 presigned URL이 통째로 바뀌어 사진이 다시 로드된다.
   */
  const [fresh, setFresh] = useState<AdminReportDetail | null>(null)
  const report = fresh ?? detail.data

  // 초안이 null이면 저장된 답변을 보여 준다 — 답을 고치러 온 사람은 원문에서 시작한다
  const [draft, setDraft] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'reply' | 'status' | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [viewer, setViewer] = useState<{ url: string; alt: string } | null>(null)

  const mutate = useMutation()

  // 없는 문의(목록이 낡았다) — 한 번만 알린다. onGone이 패널을 닫으면 이 컴포넌트도 사라진다
  const goneReported = useRef(false)
  useEffect(() => {
    if (detail.error?.status === 404 && !goneReported.current) {
      goneReported.current = true
      onGone()
    }
  }, [detail.error, onGone])

  const handleFailure = (message: string, err: unknown, onBadRequest: () => void) => {
    const status = err instanceof ApiRequestError ? err.status : 0
    if (status === 404) {
      onGone()
      return
    }
    if (status === 400) {
      onBadRequest()
      return
    }
    showToast(message)
  }

  const commitStatus = async (to: AdminReportStatus) => {
    if (!report) return
    setBusy('status')
    setStatusError(null)
    await mutate(() => updateAdminReportStatus(report.id, to), {
      // 401을 서비스 로그인으로 보내지 않는다 — 어드민의 재로그인 표면은 셸 안 카드다(CHMO-594)
      noAuthRedirect: true,
      onSuccess: (row) => {
        setFresh({ ...report, ...row })
        onRowUpdated(row)
        setBusy(null)
        setConfirmingClose(false)
        showToast(`'${reportStatusLabel(row.status)}' 상태로 바꿨어요.`)
      },
      onError: (message, err) => {
        setBusy(null)
        setConfirmingClose(false)
        handleFailure(message, err, () =>
          // 답 없는 '답변 완료'(VALID400) — 메뉴가 막아 두지만 다른 관리자와 겹치면 닿을 수 있다
          setStatusError(
            to === 'ANSWERED'
              ? '답변을 먼저 보내야 답변 완료로 바꿀 수 있어요.'
              : '상태를 바꾸지 못했어요. 목록을 새로고침해 주세요.',
          ),
        )
      },
    })
  }

  /**
   * 확인은 **사용자 쪽에서 무엇이 달라지는가**로 정한다(기관 문의와 같은 기준): 답변 없이 종료하면
   * 사용자는 답을 받지 못한 채 끝난다 — 이것만 한 번 묻는다. 나머지 전이는 팀 내 표시라 바로 나간다.
   */
  const requestStatus = (to: AdminReportStatus) => {
    if (!report) return
    if (to === 'CLOSED' && report.reply === null) setConfirmingClose(true)
    else void commitStatus(to)
  }

  const savedReply = report?.reply?.content ?? ''
  const replyText = draft ?? savedReply
  const trimmed = replyText.trim()
  const isEdit = report?.reply !== null && report?.reply !== undefined
  const canSubmit =
    busy === null &&
    trimmed.length > 0 &&
    trimmed.length <= REPLY_MAX &&
    trimmed !== savedReply.trim()

  const submitReply = async () => {
    if (!report || !canSubmit) return
    const firstAnswer = report.reply === null
    setBusy('reply')
    setReplyError(null)
    await mutate(() => replyAdminReport(report.id, trimmed), {
      noAuthRedirect: true,
      onSuccess: (updated) => {
        setFresh(updated)
        setDraft(null)
        onRowUpdated(updated)
        setBusy(null)
        // 재답변은 알림을 다시 보내지 않는다(BE CHMO-861 — 오타 수정이 알림 폭탄이 되지 않게)
        showToast(
          firstAnswer
            ? '답변을 보냈어요 · 사용자에게 알림이 갔어요'
            : '답변을 고쳤어요 · 알림은 다시 보내지 않았어요',
        )
      },
      onError: (message, err) => {
        setBusy(null)
        handleFailure(message, err, () => setReplyError('답변을 1~2,000자로 입력해 주세요.'))
      },
    })
  }

  return (
    <aside
      aria-label="신고·문의 상세"
      className="flex w-[440px] shrink-0 flex-col border-l border-admin-border bg-admin-surface"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-admin-border pl-5 pr-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold">#{reportId}</span>
          {report ? <ReportTypeBadge type={report.type} /> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-md text-admin-muted hover:bg-admin-bg hover:text-admin-text"
        >
          <AdminCloseIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {detail.error && detail.error.status !== 404 && !report ? (
          <div className="p-5">
            <AdminErrorMessage error={detail.error} onRetry={detail.refetch} />
          </div>
        ) : !report ? (
          <p className="px-5 py-10 text-center text-[13px] text-admin-muted">불러오는 중이에요…</p>
        ) : (
          <div className="divide-y divide-admin-border">
            {/* 상태 — 접수 시각 곁에 두어 "언제 들어와 지금 어디까지 왔나"를 한 줄로 읽는다 */}
            <section className="space-y-2 px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ReportStatusBadge status={report.status} />
                  <span className="text-xs text-admin-muted">
                    접수 {formatDateTime(report.createdAt)}
                  </span>
                </div>
                <StatusControls report={report} disabled={busy !== null} onSelect={requestStatus} />
              </div>
              {statusError ? <p className="text-xs text-warn">{statusError}</p> : null}
            </section>

            {report.photoId !== null ? (
              <PanelSection title="신고한 사진">
                <ReportedPhoto report={report} onOpen={setViewer} />
              </PanelSection>
            ) : null}

            <PanelSection title="내용">
              {report.content ? (
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                  {report.content}
                </p>
              ) : (
                <p className="text-[13px] text-admin-muted">
                  {/* 사진 신고는 사유 선택만으로 접수된다(BE CHMO-860) */}
                  {report.photoId !== null ? '내용 없이 사유만 골라 접수했어요.' : '내용이 없어요.'}
                </p>
              )}
              {report.attachments.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {report.attachments.map((attachment, index) => {
                    const alt = `첨부 스크린샷 ${index + 1}`
                    return (
                      <button
                        key={attachment.url}
                        type="button"
                        onClick={() => setViewer({ url: attachment.url, alt })}
                        aria-label={`${alt} 크게 보기`}
                        className="overflow-hidden rounded-lg border border-admin-border bg-admin-bg hover:border-primary"
                      >
                        <img
                          src={attachment.url}
                          alt={alt}
                          loading="lazy"
                          className="h-28 w-full object-cover"
                        />
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </PanelSection>

            <PanelSection title="보낸 사람">
              <dl className="space-y-2 text-[13px]">
                <InfoRow label="사용자">
                  {report.userNickname ?? '(알 수 없음)'}
                  <span className="text-admin-muted">
                    {' '}
                    · #{report.userId} · {socialProvidersLabel(report.socialProviders)}
                  </span>
                </InfoRow>
                {/* 사진 신고는 위 '신고한 사진'이 모임을 이미 말한다 — 두 번 쓰지 않는다 */}
                {report.groupId !== null && report.photoId === null ? (
                  <InfoRow label="모임">
                    <GroupRef groupId={report.groupId} groupName={report.groupName} />
                  </InfoRow>
                ) : null}
                {report.groupId !== null ? (
                  <InfoRow label="모임 역할">
                    {report.reporterRole ? (
                      memberRoleLabel(report.reporterRole)
                    ) : (
                      <span className="text-admin-muted">지금은 멤버가 아니에요</span>
                    )}
                  </InfoRow>
                ) : null}
                <InfoRow label="기기">{reportClientLabel(report.client)}</InfoRow>
                {report.followUpOf ? (
                  <InfoRow label="이어서 문의">
                    <button
                      type="button"
                      onClick={() => onSelect(report.followUpOf!.id)}
                      className="text-left text-accent hover:underline"
                    >
                      #{report.followUpOf.id}
                      {report.followUpOf.preview ? ` · ${report.followUpOf.preview}` : ''}
                    </button>
                  </InfoRow>
                ) : null}
              </dl>
            </PanelSection>

            <PanelSection title="답변">
              {report.reply ? (
                <p className="mb-2 text-xs text-admin-muted">
                  {formatDateTime(report.reply.answeredAt)} 답변
                  {report.reply.answeredBy !== null ? ` · 관리자 #${report.reply.answeredBy}` : ''}
                </p>
              ) : null}
              <label htmlFor="report-reply" className="sr-only">
                답변 내용
              </label>
              <textarea
                id="report-reply"
                value={replyText}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (replyError) setReplyError(null)
                }}
                maxLength={REPLY_MAX}
                rows={7}
                disabled={busy === 'reply'}
                placeholder="사용자 앱의 [신고·문의]에 이 답이 그대로 보여요."
                className="w-full resize-y rounded-lg border border-admin-border bg-admin-surface px-3 py-2.5 text-[13px] leading-relaxed text-admin-text placeholder:text-admin-muted/70 focus:border-primary focus:outline-none disabled:opacity-60"
              />
              <div className="mt-1 flex items-start justify-between gap-3">
                <p className={`text-xs ${replyError ? 'text-warn' : 'text-admin-muted'}`}>
                  {replyError ??
                    (isEdit
                      ? '고친 답변은 알림을 다시 보내지 않아요.'
                      : '보내면 사용자에게 알림이 가요. 알림을 끈 사용자는 앱에서만 볼 수 있어요.')}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-admin-muted">
                  {replyText.length.toLocaleString('ko-KR')} / 2,000
                </span>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void submitReply()}
                  disabled={!canSubmit}
                  className="h-9 rounded-lg border border-primary bg-primary px-4 text-[13px] font-semibold text-admin-text hover:brightness-95 disabled:opacity-40"
                >
                  {busy === 'reply' ? '보내는 중…' : isEdit ? '답변 고치기' : '답변 보내기'}
                </button>
              </div>
            </PanelSection>
          </div>
        )}
      </div>

      {confirmingClose && report ? (
        <AdminConfirmDialog
          // 조사를 번호에 붙이지 않는다 — '#5를'·'#41을'처럼 숫자 읽기에 따라 갈린다
          title={`#${report.id} 신고·문의를 답변 없이 종료할까요?`}
          lines={[
            '답변 없이 종료하면 사용자는 답을 받지 못해요.',
            '다시 열어야 하면 ⋯에서 되돌릴 수 있어요.',
          ]}
          confirmLabel="종료하기"
          busy={busy === 'status'}
          onCancel={() => setConfirmingClose(false)}
          onConfirm={() => void commitStatus('CLOSED')}
        />
      ) : null}

      {viewer ? (
        <AdminImageViewer url={viewer.url} alt={viewer.alt} onClose={() => setViewer(null)} />
      ) : null}
    </aside>
  )
}

function StatusControls({
  report,
  disabled,
  onSelect,
}: {
  report: AdminReportDetail
  disabled: boolean
  onSelect: (to: AdminReportStatus) => void
}) {
  const { primary, menu } = statusActions(report)
  return (
    <div className="flex items-center gap-1.5">
      {primary ? (
        <button
          type="button"
          onClick={() => onSelect(primary)}
          disabled={disabled}
          className="h-7 whitespace-nowrap rounded-md border border-admin-border bg-admin-surface px-2.5 text-xs font-medium text-admin-text hover:bg-admin-bg disabled:opacity-40"
        >
          {statusActionLabel(report.status, primary)}
        </button>
      ) : null}
      {menu.length > 0 ? (
        <AdminRowMenu
          label="상태 변경"
          disabled={disabled}
          groups={[
            {
              items: menu.map((to) => ({
                key: to,
                label: statusActionLabel(report.status, to),
                onSelect: () => onSelect(to),
              })),
            },
          ]}
        />
      ) : null}
    </div>
  )
}

/**
 * 신고 사진 — 원본 presigned URL이라 패널 안에선 맞춰 그리고 누르면 크게 본다.
 * 어드민엔 사진을 지우거나 숨기는 기능이 없다(CHMO-862 운영 메모) — 삭제 요청·부적절 신고를 읽은
 * 사람이 여기서 지울 버튼을 찾게 되므로, 어디서 처리하는지를 한 줄로 알려 준다.
 */
function ReportedPhoto({
  report,
  onOpen,
}: {
  report: AdminReportDetail
  onOpen: (image: { url: string; alt: string }) => void
}) {
  const photo = report.photo
  return (
    <div className="space-y-2.5">
      {photo ? (
        <button
          type="button"
          onClick={() => onOpen({ url: photo.url, alt: `신고한 사진 #${photo.id}` })}
          aria-label="신고한 사진 크게 보기"
          className="block w-full overflow-hidden rounded-lg border border-admin-border bg-admin-bg hover:border-primary"
        >
          <img
            src={photo.url}
            alt={`신고한 사진 #${photo.id}`}
            className="max-h-64 w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-admin-border bg-admin-bg text-[13px] text-admin-muted">
          {report.photoDeleted ? '삭제된 사진이에요' : '사진을 불러올 수 없어요'}
        </div>
      )}
      <p className="text-[13px] leading-relaxed">
        {report.groupId !== null ? (
          <GroupName groupId={report.groupId} groupName={report.groupName} />
        ) : null}
        {photo ? <span> › {photo.eventName}</span> : null}
        <span className="text-admin-muted"> · 사진 #{report.photoId}</span>
      </p>
      {report.groupId !== null && report.groupName !== null ? (
        <Link
          to={`/admin/groups/${report.groupId}`}
          className="inline-block text-[13px] text-accent hover:underline"
        >
          모임 상세에서 보기 →
        </Link>
      ) : null}
      {isReportType(report.type) && photo ? (
        <p className="text-xs text-admin-muted">
          어드민에서는 사진을 지울 수 없어요 · 모임 관리자에게 연락해 앱에서 지우도록 요청해 주세요.
        </p>
      ) : null}
    </div>
  )
}

/**
 * 모임 표기 — 어드민의 모임 식별은 `모임 #45`가 기본이고(CHMO-670) 이 응답엔 이름이 함께 와서
 * 곁에 붙인다. 이름이 null이면 모임이 지워진 것이다(BE 정책: 식별자는 접수 시점 값을 유지).
 */
function GroupName({ groupId, groupName }: { groupId: number; groupName: string | null }) {
  if (groupName === null) {
    return (
      <span>
        {groupLabel(groupId)} <span className="text-admin-muted">(지워진 모임)</span>
      </span>
    )
  }
  return (
    <span>
      {groupLabel(groupId)} · {groupName}
    </span>
  )
}

/** 모임 표기 + 상세 링크 — 지워진 모임엔 링크를 달지 않는다(누르면 404다) */
function GroupRef({ groupId, groupName }: { groupId: number; groupName: string | null }) {
  if (groupName === null) return <GroupName groupId={groupId} groupName={null} />
  return (
    <Link to={`/admin/groups/${groupId}`} className="text-accent hover:underline">
      {groupLabel(groupId)} · {groupName} →
    </Link>
  )
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h3 className="mb-2.5 text-xs font-medium text-admin-muted">{title}</h3>
      {children}
    </section>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-admin-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  )
}
