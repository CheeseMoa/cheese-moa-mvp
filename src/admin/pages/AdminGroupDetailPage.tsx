import { Link, useParams } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { getAdminGroupDetail } from '../api/admin'
import type { AdminGroupEvent, AdminGroupMember } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { StatusBadge } from '../components/StatusBadge'
import {
  formatCount,
  formatDate,
  memberRoleLabel,
  memberStatusLabel,
} from '../lib/format'

/**
 * A3 모임 상세(289:87) — 헤더 카드 + 멤버 목록 + 이벤트 목록.
 * 멤버는 승인 대기(PENDING)도 온다(BE 정책 — 운영자는 신청도 봐야 한다): 시안엔 없던
 * 역할·대기 칩을 행에 붙여 memberCount(ACTIVE 기준)와 행 수가 달라 보이는 이유를 화면이 설명한다.
 */
export function AdminGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const detail = useApi(
    groupId ? `admin-group-${groupId}` : null,
    (signal) => getAdminGroupDetail(groupId ?? '', signal),
  )

  const memberColumns: AdminColumn<AdminGroupMember>[] = [
    {
      key: 'nickname',
      header: '닉네임',
      render: (m) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{m.nickname}</span>
          <span className="rounded border border-admin-border px-1 py-px text-[11px] text-admin-muted">
            {memberRoleLabel(m.role)}
          </span>
          {m.status === 'PENDING' ? (
            <span className="rounded bg-admin-status-analyzing/15 px-1 py-px text-[11px] text-admin-status-analyzing">
              {memberStatusLabel(m.status)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'joinedAt',
      header: '합류일',
      align: 'right',
      widthClassName: 'w-28',
      render: (m) => formatDate(m.joinedAt),
    },
  ]

  const eventColumns: AdminColumn<AdminGroupEvent>[] = [
    { key: 'name', header: '이벤트명', render: (e) => <span className="font-medium">{e.name}</span> },
    {
      key: 'date',
      header: '날짜',
      align: 'right',
      widthClassName: 'w-28',
      render: (e) => formatDate(e.eventDate),
    },
    {
      key: 'status',
      header: '상태',
      widthClassName: 'w-24',
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: 'photos',
      header: '사진 수',
      align: 'right',
      widthClassName: 'w-20',
      render: (e) => formatCount(e.photoCount),
    },
    {
      key: 'albums',
      header: '앨범 수',
      align: 'right',
      widthClassName: 'w-20',
      render: (e) => formatCount(e.albumCount),
    },
    {
      key: 'publishedAt',
      header: '공개일',
      align: 'right',
      widthClassName: 'w-28',
      render: (e) => formatDate(e.publishedAt),
    },
  ]

  // 헤더 사진 수는 상세 응답에 총계 필드가 없어 이벤트 목록에서 파생한다(목록 화면 photoCount와 같은 규칙)
  const photoTotal = detail.data?.events.reduce((sum, e) => sum + e.photoCount, 0) ?? 0

  return (
    <>
      <AdminTopbar
        left={
          <>
            <Link to="/admin/groups" className="font-normal text-admin-muted hover:text-admin-text">
              모임
            </Link>
            <span className="font-normal text-admin-muted">/</span>
            <span>{detail.data?.name ?? '…'}</span>
          </>
        }
        right="조회 전용"
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        {detail.error ? (
          detail.error.status === 404 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-admin-border bg-admin-surface px-5 py-10">
              <p className="text-[13px] text-admin-muted">모임을 찾을 수 없어요.</p>
              <Link
                to="/admin/groups"
                className="h-8 rounded-lg border border-admin-border px-3 text-[13px] leading-8 hover:bg-admin-bg"
              >
                모임 목록으로
              </Link>
            </div>
          ) : (
            <AdminErrorMessage error={detail.error} onRetry={detail.refetch} />
          )
        ) : !detail.data ? (
          <AdminMessage text="불러오는 중이에요…" />
        ) : (
          <>
            <section className="rounded-xl border border-admin-border bg-admin-surface px-5 py-4">
              <h1 className="text-lg font-bold">{detail.data.name}</h1>
              <p className="mt-1.5 text-[13px] text-admin-muted">
                생성일 <Strong>{formatDate(detail.data.createdAt)}</Strong>
                <Dot /> 멤버 <Strong>{formatCount(detail.data.memberCount)}명</Strong>
                <Dot /> 이벤트 <Strong>{formatCount(detail.data.events.length)}개</Strong>
                <Dot /> 사진 <Strong>{formatCount(photoTotal)}장</Strong>
                {detail.data.ownerNickname ? (
                  <>
                    <Dot /> 생성자 <Strong>{detail.data.ownerNickname}</Strong>
                  </>
                ) : null}
              </p>
              <p className="mt-2 text-xs text-admin-muted">
                🔒 학부모 공유 비밀번호는 어드민에 노출하지 않아요 (admin-spec §3-3)
              </p>
            </section>

            <div className="flex items-start gap-4">
              <section className="w-[340px] shrink-0 rounded-xl border border-admin-border bg-admin-surface">
                <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                  <h2 className="text-[14px] font-semibold">멤버</h2>
                  <span className="text-xs text-admin-muted">
                    {formatCount(detail.data.memberCount)}명
                  </span>
                </div>
                <AdminTable
                  columns={memberColumns}
                  rows={detail.data.members}
                  rowKey={(m) => m.userId}
                  emptyText="멤버가 없어요."
                />
              </section>

              <section className="min-w-0 flex-1 rounded-xl border border-admin-border bg-admin-surface">
                <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                  <h2 className="text-[14px] font-semibold">이벤트</h2>
                  <span className="text-xs text-admin-muted">
                    {formatCount(detail.data.events.length)}개 · 최신순
                  </span>
                </div>
                <AdminTable
                  columns={eventColumns}
                  rows={detail.data.events}
                  rowKey={(e) => e.eventId}
                  emptyText="이벤트가 아직 없어요."
                />
              </section>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-admin-text">{children}</span>
}

function Dot() {
  return <span className="mx-1.5 text-admin-border">·</span>
}
