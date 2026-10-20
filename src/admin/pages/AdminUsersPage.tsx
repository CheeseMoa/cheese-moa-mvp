import { adminPath } from '../paths'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchAdminUsers } from '../api/admin'
import type { AdminUserRow } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminLoadMore } from '../components/AdminLoadMore'
import { useCursorList } from '../hooks/useCursorList'
import { inputClassName } from '../lib/formStyles'
import { accountTypeLabel } from '../lib/format'

const PAGE_SIZE = 20

/**
 * 사용자 (CHMO-931 — BE CHMO-912 `GET /admin/users`) · `/admin/users`.
 *
 * 닉네임 부분 일치 또는 userId 정확 일치로 찾아 상세(장수·기관 이용 기간)로 들어간다. 검색어가
 * 비면 **최근 가입 순 전체**라 "방금 가입한 사람이 누구인가"도 여기서 본다. BE가 커서 목록이라
 * 페이지 버튼 대신 [더 보기]다. 신고·문의·기관 문의 화면의 `#userId`를 그대로 넣어 찾을 수 있다.
 */
export function AdminUsersPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')

  const list = useCursorList<AdminUserRow>(
    `admin-users?query=${encodeURIComponent(query)}`,
    (cursor, signal) => searchAdminUsers({ query, cursor, size: PAGE_SIZE }, signal),
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setQuery(draft.trim())
  }

  const columns: AdminColumn<AdminUserRow>[] = [
    {
      key: 'user',
      header: '사용자',
      render: (u) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{u.nickname}</span>
          <span className="text-xs text-admin-muted">#{u.userId}</span>
        </span>
      ),
    },
    {
      key: 'accountType',
      header: '계정 유형',
      widthClassName: 'w-28',
      render: (u) => (
        <span className="rounded border border-admin-border px-1 py-px text-[11px] text-admin-muted">
          {accountTypeLabel(u.accountType)}
        </span>
      ),
    },
    {
      key: 'go',
      header: '',
      align: 'right',
      widthClassName: 'w-36',
      render: () => (
        <span className="whitespace-nowrap text-xs text-accent">장수 · 이용 기간 →</span>
      ),
    },
  ]

  return (
    <>
      <AdminTopbar left="사용자" right={query ? `'${query}' 검색 결과` : '최근 가입 순'} />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="닉네임 일부 또는 사용자 ID"
            aria-label="사용자 검색"
            className={`${inputClassName()} max-w-sm`}
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-lg border border-primary bg-primary px-4 text-[13px] font-semibold text-admin-text hover:brightness-95"
          >
            검색
          </button>
          {query ? (
            <button
              type="button"
              onClick={() => {
                setDraft('')
                setQuery('')
              }}
              className="h-10 shrink-0 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-muted hover:bg-admin-bg hover:text-admin-text"
            >
              전체 보기
            </button>
          ) : null}
        </form>

        <p className="text-xs text-admin-muted">
          닉네임은 여러 계정이 같을 수 있어요(소셜 가입) · 신고·문의 화면의{' '}
          <b className="font-semibold text-admin-text">#사용자 ID</b>를 넣으면 그 계정만 나와요.
        </p>

        {list.error ? (
          <AdminErrorMessage error={list.error} onRetry={list.refetch} />
        ) : !list.first ? (
          <AdminMessage text="불러오는 중이에요…" />
        ) : (
          <div className="rounded-xl border border-admin-border bg-admin-surface">
            <AdminTable
              columns={columns}
              rows={list.items}
              rowKey={(u) => u.userId}
              onRowClick={(u) => navigate(adminPath(`/users/${u.userId}`))}
              emptyText={
                query ? `'${query}'에 맞는 사용자가 없어요.` : '아직 가입한 사용자가 없어요.'
              }
              dimmed={list.loading}
            />
            <AdminLoadMore
              hasNext={list.hasNext}
              loading={list.loadingMore}
              error={list.moreError}
              onLoadMore={list.loadMore}
            />
          </div>
        )}
      </div>
    </>
  )
}
