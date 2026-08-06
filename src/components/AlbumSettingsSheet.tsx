import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { renamePersonAlbum } from '../api/albums'
import { linkPersonParent, listGroupMembers, unlinkPersonParent } from '../api/groups'
import type { GroupMember, ID } from '../types/api'
import { BottomSheet, Button, ConfirmDialog, IconClose, TextField, useToast } from './ui'

/** 설정 대상 인물 앨범 — 학부모 연결의 키는 앨범이 아니라 personId(모임 단위 인물)다 */
interface SettingsAlbum {
  id: ID
  name: string
  photoCount: number
  personId: ID | null
}

interface AlbumSettingsSheetProps {
  groupId: ID | string
  album: SettingsAlbum
  onClose: () => void
  /** 이름 저장 성공 — 호출부가 앨범 목록/상세를 refetch 한다(학부모 연결은 시트 안에서만 갱신) */
  onUpdated: () => void
  /**
   * 주면 하단에 [앨범 삭제]가 붙는다(09 전용 — 헤더 🗑을 여기로 합쳤다).
   * 확인 다이얼로그는 호출부 소유 — 시트를 닫고 열어 대화상자 두 겹을 피한다.
   */
  onDeleteRequest?: () => void
}

/**
 * 앨범 설정 바텀시트 — 인물 앨범의 **이름 수정 + 학부모 연결**을 한 자리에서 처리한다.
 * 진입점은 둘: 08 앨범 카드의 이름 줄 탭(CHMO-400 자리)과 09 앨범 상세 헤더의 [✎ 앨범 설정].
 * 09에서는 앨범 삭제까지 이 시트로 모은다(onDeleteRequest) — 앨범 하나에 대한 조작이 헤더와
 * 시트로 흩어져 있지 않게.
 *
 * 학부모 연결은 20 초대 관리의 반대 방향이다: 거기선 학부모를 골라 아이를 붙이고(ChildLinkSheet),
 * 여기선 아이(앨범)를 보면서 학부모를 붙인다. 매핑은 다대다(다자녀·부모 2인)라 두 경로가
 * 같은 API를 공유한다(POST/DELETE /groups/:id/person-parents · 초안 §4).
 * 연결 단위가 personId(모임 단위 인물)라서 **연결하면 그 모임의 모든 이벤트에 걸쳐 적용된다**.
 *
 * 이름 저장은 성공 시 시트를 닫는다(RenameModal과 동일) — 호출부가 들고 있는 album prop이
 * 옛 이름 그대로라 열어 둔 채로는 부제·placeholder가 갱신되지 않는다.
 * 학부모 연결/해제는 시트를 유지하고 멤버 목록만 다시 읽는다(연달아 여러 명 붙이는 자리라서).
 */
export function AlbumSettingsSheet({
  groupId,
  album,
  onClose,
  onUpdated,
  onDeleteRequest,
}: AlbumSettingsSheetProps) {
  const toast = useToast()
  const mutate = useMutation()
  const personId = album.personId
  // 인물이 아니면 연결할 대상 자체가 없다 — 멤버 조회도 보내지 않는다
  const membersApi = useApi(personId != null ? `group-members:${groupId}` : null, (signal) =>
    listGroupMembers(groupId, signal),
  )
  // 현재 이름은 지우지 않아도 되게 회색 placeholder로만 — 입력은 비워서 연다(CHMO-429)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  /** 연결 처리 중인 학부모(행 버튼 라벨 교체용) */
  const [linkingUserId, setLinkingUserId] = useState<ID | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<GroupMember | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  // 동기 락 — setState 반영 전 같은 프레임의 연타가 두 번 요청되는 것을 막는다(MovePhotosSheet 선례)
  const busyRef = useRef(false)

  const busy = saving || linkingUserId !== null || unlinking
  const parents = (membersApi.data ?? []).filter((m) => m.role === 'viewer')
  const isLinked = (member: GroupMember) => member.mappings.some((m) => m.personId === personId)
  const linked = parents.filter(isLinked)
  const unlinked = parents.filter((m) => !isLinked(m))

  const trimmedName = name.trim()
  const canSave = trimmedName.length > 0 && !busy

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSave || busyRef.current) return
    busyRef.current = true
    setSaving(true)
    setNameError(null)
    await mutate(() => renamePersonAlbum(album.id, trimmedName), {
      onSuccess: () => {
        toast.show('🧀 아이 이름을 바꿨어요')
        onUpdated()
        onClose()
      },
      onError: (msg) => {
        setNameError(msg)
        busyRef.current = false
        setSaving(false)
      },
    })
  }

  const handleLink = async (member: GroupMember) => {
    if (personId == null || busyRef.current) return
    busyRef.current = true
    setLinkingUserId(member.userId)
    await mutate(() => linkPersonParent(groupId, { userId: member.userId, personId }), {
      onSuccess: () => {
        toast.show(`🧀 '${member.nickname}'님을 연결했어요`)
        busyRef.current = false
        setLinkingUserId(null)
        membersApi.refetch()
      },
      onError: (msg) => {
        toast.show(msg)
        busyRef.current = false
        setLinkingUserId(null)
      },
    })
  }

  const handleUnlink = async () => {
    if (personId == null || !unlinkTarget || busyRef.current) return
    busyRef.current = true
    setUnlinking(true)
    const target = unlinkTarget
    await mutate(() => unlinkPersonParent(groupId, { userId: target.userId, personId }), {
      onSuccess: () => {
        toast.show('연결을 해제했어요')
        busyRef.current = false
        setUnlinking(false)
        setUnlinkTarget(null)
        membersApi.refetch()
      },
      onError: (msg) => {
        toast.show(msg)
        busyRef.current = false
        setUnlinking(false)
        setUnlinkTarget(null)
      },
    })
  }

  return (
    <>
      <BottomSheet
        open
        onClose={() => {
          if (!busy) onClose()
        }}
        title="앨범 설정"
        subtitle={`${album.name} · 사진 ${album.photoCount}장`}
        // 학부모가 많으면 명단이 프레임을 넘긴다 — 본문만 스크롤한다(끌어내려 닫기는 핸들·제목)
        bodyScrollable
      >
        <form onSubmit={handleSave} noValidate className="mt-3.5 flex flex-col gap-3">
          <TextField
            label="아이 이름"
            placeholder={album.name}
            autoComplete="off"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
          />
          <p className="-mt-1 text-xs leading-relaxed text-muted">
            이 이름은 같은 모임의 모든 이벤트에 함께 반영돼요.
          </p>
          <Button type="submit" fullWidth disabled={!canSave}>
            {saving ? '저장 중…' : '이름 저장'}
          </Button>
        </form>

        {/* 학부모 연결 — 인물 앨범만(특수 앨범은 personId가 없어 연결 대상이 아니다) */}
        {personId != null && (
          <section className="mt-5 border-t border-border pt-4">
            <h3 className="text-[13px] font-bold text-text">학부모 연결</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              연결하면 모든 이벤트에서 이 아이의 앨범과 공통 사진이 보여요.
            </p>

            {membersApi.data === null ? (
              membersApi.loading ? (
                <p className="mt-3 text-sm text-muted">학부모님을 불러오는 중…</p>
              ) : (
                // 조회 실패는 이름 수정을 막지 않는다 — 이 섹션 안에서만 알리고 재시도한다
                // (20 초대 관리의 인라인 재시도와 같은 결 — 곁가지 조회가 화면을 가리지 않게)
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                  <p className="min-w-0 text-[13px] text-muted">학부모님을 불러오지 못했어요</p>
                  <button
                    type="button"
                    onClick={membersApi.refetch}
                    className="shrink-0 text-[13px] font-medium text-accent"
                  >
                    다시 시도
                  </button>
                </div>
              )
            ) : parents.length === 0 ? (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                아직 참여한 학부모님이 없어요.
                <br />
                모임 상세의 [＋ 초대하기]에서 신청 링크를 보내 보세요.
              </p>
            ) : (
              <>
                {linked.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {linked.map((member) => (
                      <span
                        key={member.userId}
                        className="flex items-center gap-1.5 rounded-full bg-primary py-1.5 pl-3 pr-2 text-xs font-bold text-text"
                      >
                        {member.nickname}
                        <button
                          type="button"
                          aria-label={`${member.nickname} 연결 해제`}
                          disabled={busy}
                          onClick={() => setUnlinkTarget(member)}
                          className="text-text/60 disabled:opacity-50"
                        >
                          <IconClose size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {unlinked.length > 0 ? (
                  <div className="mt-3">
                    {unlinked.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-text">
                            {member.nickname}
                          </span>
                          {/* 신청 원문(§2) — 누가 이 아이의 학부모인지 알아보는 단서 */}
                          {member.childNames.length > 0 && (
                            <span className="block truncate text-[11px] text-muted">
                              신청: {member.childNames.join(', ')}
                            </span>
                          )}
                        </span>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleLink(member)}
                        >
                          {linkingUserId === member.userId ? '연결 중…' : '연결'}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] text-muted">모든 학부모님이 연결됐어요.</p>
                )}
              </>
            )}
          </section>
        )}

        {/* 09에서만 — 위험 동작이지만 확인 다이얼로그가 한 번 더 뜨므로 여기선 톤을 낮춘다(RenameModal 선례) */}
        {onDeleteRequest && (
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={onDeleteRequest}
            className="mt-5 text-warn"
          >
            앨범 삭제
          </Button>
        )}
      </BottomSheet>

      {/* 연결 해제 확인 — 해제하면 학부모에게 그 아이 앨범이 더는 보이지 않는다(§7-1 미연결 회귀).
          20 초대 관리와 같은 문구·같은 무게로 받는다(다시 연결할 수 있음을 함께 알린다) */}
      <ConfirmDialog
        open={unlinkTarget !== null}
        danger
        busy={unlinking}
        busyLabel="해제 중…"
        title="연결을 해제할까요?"
        description={
          unlinkTarget
            ? `${unlinkTarget.nickname}님에게 더 이상 '${album.name}' 앨범이 보이지 않아요. 언제든 다시 연결할 수 있어요.`
            : ''
        }
        confirmLabel="해제"
        onConfirm={() => void handleUnlink()}
        onClose={() => {
          if (!unlinking) setUnlinkTarget(null)
        }}
      />
    </>
  )
}
