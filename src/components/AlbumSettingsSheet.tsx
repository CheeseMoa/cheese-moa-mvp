import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useApi } from '../hooks/useApi'
import { useDelayedFlag } from '../hooks/useDelayedFlag'
import { useDragScrollX } from '../hooks/useDragScrollX'
import { useMutation } from '../hooks/useMutation'
import { ApiRequestError } from '../api/client'
import { mergeAlbumPerson, renamePersonAlbum, type MergeAlbumPersonResult } from '../api/albums'
import {
  linkPersonParent,
  listGroupMembers,
  listGroupPersons,
  unlinkPersonParent,
} from '../api/groups'
import { cx } from '../lib/cx'
import type { GroupMember, GroupPerson, GroupType, ID } from '../types/api'
import { BottomSheet, Button, ConfirmDialog, IconClose, TextField, useToast } from './ui'

/** 설정 대상 인물 앨범 — 멤버 연결의 키는 앨범이 아니라 personId(모임 단위 인물)다 */
interface SettingsAlbum {
  id: ID
  name: string
  photoCount: number
  personId: ID | null
}

interface AlbumSettingsSheetProps {
  groupId: ID | string
  album: SettingsAlbum
  /**
   * 모임 유형(CHMO-610) — general이면 멤버 연결 섹션이 통째로 빠진다(열람 전용 역할 자체가 없다).
   * 미상(호출부 조회 실패·구계약)은 business로 본다 — 매퍼의 groupType 생략 정규화와 같은 해석이다.
   */
  groupType?: GroupType
  onClose: () => void
  /** 이름 저장 성공 — 호출부가 앨범 목록/상세를 refetch 한다(멤버 연결은 시트 안에서만 갱신) */
  onUpdated: () => void
  /**
   * 인물 병합 성공(CHMO-689) — 호출부가 시트를 닫고 후속을 정한다: 08은 목록 refetch,
   * 09는 남은 앨범(result.albumId)이 지금 앨범이면 refetch·통합돼 사라졌으면 그 앨범으로 replace.
   */
  onMerged: (result: MergeAlbumPersonResult) => void
  /**
   * 주면 하단에 [앨범 삭제]가 붙는다(09 전용 — 헤더 🗑을 여기로 합쳤다).
   * 확인 다이얼로그는 호출부 소유 — 시트를 닫고 열어 대화상자 두 겹을 피한다.
   */
  onDeleteRequest?: () => void
}

/**
 * 앨범 설정 바텀시트 — 인물 앨범의 **이름 수정 + 멤버 연결**을 한 자리에서 처리한다.
 * 진입점은 둘: 08 앨범 카드의 이름 줄 탭(CHMO-400 자리)과 09 앨범 상세 헤더의 [✎ 앨범 설정].
 * 09에서는 앨범 삭제까지 이 시트로 모은다(onDeleteRequest) — 앨범 하나에 대한 조작이 헤더와
 * 시트로 흩어져 있지 않게.
 *
 * 멤버 연결은 20 초대 관리의 반대 방향이다: 거기선 멤버를 골라 인물을 붙이고(ChildLinkSheet),
 * 여기선 인물(앨범)을 보면서 멤버를 붙인다. 매핑은 다대다(한 멤버에 여러 인물·한 인물에 여러
 * 멤버)라 두 경로가 같은 API를 공유한다(POST/DELETE /groups/:id/person-parents · 초안 §4).
 * 연결 단위가 personId(모임 단위 인물)라서 **연결하면 그 모임의 모든 이벤트에 걸쳐 적용된다**.
 *
 * **일반 모임엔 연결 섹션이 없다**(CHMO-610): 멤버가 전원 동등해 열람만 하는 역할이 없고,
 * 그래서 붙일 대상도 없다 — 섹션과 함께 멤버 조회(비즈니스 전용 API)도 보내지 않는다.
 * 이름 수정은 유형과 무관하게 남는다(인물 앨범 이름은 두 유형 다 쓴다).
 *
 * **기존 인물로 합치기**(CHMO-689 — BE CHMO-688): AI가 같은 인물을 새 인물("인물 N")로 잘못
 * 나눴을 때의 수동 보정. 요청 앨범의 인물이 흡수되는 쪽이고 고른 인물이 남는 쪽이다 — 흡수
 * 인물의 전 이벤트 앨범이 이관·통합되고 인물 자체가 삭제돼 재업로드에도 되살아나지 않는다.
 * 후보는 20-1과 같은 원천(listGroupPersons 파생)인데 팬아웃 조회라 펼쳤을 때만 읽고,
 * 유형 분기가 없다(BE 정책 — 검수·공개 축이 아니라 인물 정리 축이라 일반 모임도 허용).
 *
 * 이름 저장은 성공 시 시트를 닫는다(RenameModal과 동일) — 호출부가 들고 있는 album prop이
 * 옛 이름 그대로라 열어 둔 채로는 부제·placeholder가 갱신되지 않는다.
 * 멤버 연결/해제는 시트를 유지하고 멤버 목록만 다시 읽는다(연달아 여러 명 붙이는 자리라서).
 */
export function AlbumSettingsSheet({
  groupId,
  album,
  groupType,
  onClose,
  onUpdated,
  onMerged,
  onDeleteRequest,
}: AlbumSettingsSheetProps) {
  const toast = useToast()
  const mutate = useMutation()
  // 인물이 아니면 연결할 대상 자체가 없고(특수 앨범), 일반 모임엔 연결이라는 개념이 없다
  const personId = groupType === 'general' ? null : album.personId
  // 연결 섹션이 없으면 멤버 조회도 보내지 않는다
  const membersApi = useApi(personId != null ? `group-members:${groupId}` : null, (signal) =>
    listGroupMembers(groupId, signal),
  )
  // 문구는 LoadState와 같은 규칙으로 미룬다(CHMO-401)
  const showMembersLoading = useDelayedFlag(membersApi.loading)
  // 현재 이름은 지우지 않아도 되게 회색 placeholder로만 — 입력은 비워서 연다(CHMO-429)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  /** 연결 처리 중인 멤버(행 버튼 라벨 교체용) */
  const [linkingUserId, setLinkingUserId] = useState<ID | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<GroupMember | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  // 인물 병합(CHMO-689) — 후보 목록은 펼쳤을 때만 조회한다(아래 personsApi)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<GroupPerson | null>(null)
  const [merging, setMerging] = useState(false)
  // 동기 락 — setState 반영 전 같은 프레임의 연타가 두 번 요청되는 것을 막는다(MovePhotosSheet 선례)
  const busyRef = useRef(false)

  // 병합 후보 = 모임의 다른 인물(listGroupPersons 파생 — 별도 인물 목록 API 없음, 20-1과 같은
  // 원천). 팬아웃 조회라 시트가 열릴 때가 아니라 [합칠 인물 고르기]를 눌렀을 때만 나간다.
  // 병합은 모임 유형 무관이라(BE 정책 — 검수·공개 축이 아니라 인물 정리 축) groupType을 보지 않는다.
  const personsApi = useApi(
    mergeOpen && album.personId != null ? `group-persons:${groupId}` : null,
    (signal) => listGroupPersons(groupId, signal),
  )
  const showPersonsLoading = useDelayedFlag(personsApi.loading)
  const dragScroll = useDragScrollX()
  const mergeCandidates = (personsApi.data ?? []).filter((p) => p.personId !== album.personId)

  const busy = saving || linkingUserId !== null || unlinking || merging
  const viewers = (membersApi.data ?? []).filter((m) => m.role === 'viewer')
  const isLinked = (member: GroupMember) => member.mappings.some((m) => m.personId === personId)
  const linked = viewers.filter(isLinked)
  const unlinked = viewers.filter((m) => !isLinked(m))

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
        toast.show('🧀 이름을 바꿨어요')
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

  const handleMerge = async () => {
    if (!mergeTarget || busyRef.current) return
    busyRef.current = true
    setMerging(true)
    const target = mergeTarget
    await mutate(() => mergeAlbumPerson(album.id, target.personId), {
      onSuccess: (result) => {
        toast.show(`🧀 '${target.name}'(으)로 합쳤어요`)
        // 시트 닫기·이동/refetch는 호출부 몫 — 이 앨범이 통합돼 사라졌을 수 있어 화면이 정한다
        onMerged(result)
      },
      onError: (msg, err) => {
        // 서로 다른 멤버에 연결된 인물(PERSON409) — BE 메시지는 '학부모' 어휘라 화면 어휘로 바꾼다
        const conflict = err instanceof ApiRequestError && err.code === 'PERSON_PARENT_CONFLICT'
        toast.show(
          conflict ? '서로 다른 멤버에 연결된 인물이라 합칠 수 없어요. 연결을 먼저 해제해 주세요.' : msg,
        )
        busyRef.current = false
        setMerging(false)
        setMergeTarget(null)
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
        // 멤버가 많으면 명단이 프레임을 넘긴다 — 본문만 스크롤한다(끌어내려 닫기는 핸들·제목)
        bodyScrollable
      >
        <form onSubmit={handleSave} noValidate className="mt-3.5 flex flex-col gap-3">
          <TextField
            label="인물 이름"
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

        {/* 멤버 연결 — 비즈니스 모임의 인물 앨범만(특수 앨범은 personId가 없어 연결 대상이 아니다) */}
        {personId != null && (
          <section className="mt-5 border-t border-border pt-4">
            <h3 className="text-[13px] font-bold text-text">멤버 연결</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              연결하면 모든 이벤트에서 이 인물의 앨범과 공통 사진이 보여요.
            </p>

            {membersApi.data === null ? (
              membersApi.loading ? (
                showMembersLoading ? (
                  <p className="mt-3 text-sm text-muted">멤버를 불러오는 중…</p>
                ) : null
              ) : (
                // 조회 실패는 이름 수정을 막지 않는다 — 이 섹션 안에서만 알리고 재시도한다
                // (20 초대 관리의 인라인 재시도와 같은 결 — 곁가지 조회가 화면을 가리지 않게)
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                  <p className="min-w-0 text-[13px] text-muted">멤버를 불러오지 못했어요</p>
                  <button
                    type="button"
                    onClick={membersApi.refetch}
                    className="shrink-0 text-[13px] font-medium text-accent"
                  >
                    다시 시도
                  </button>
                </div>
              )
            ) : viewers.length === 0 ? (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                아직 참여한 멤버가 없어요.
                <br />
                모임 화면의 [초대 관리]에서 신청 링크를 보내 보세요.
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
                          {/* 신청 원문(§2) — 누가 이 인물의 멤버인지 알아보는 단서 */}
                          {member.childNames.length > 0 && (
                            <span className="block truncate text-[11px] text-muted">
                              신청: {member.childNames.join(', ')}
                            </span>
                          )}
                        </span>
                        <Button size="sm" disabled={busy} onClick={() => void handleLink(member)}>
                          {linkingUserId === member.userId ? '연결 중…' : '연결'}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] text-muted">모든 멤버가 연결됐어요.</p>
                )}
              </>
            )}
          </section>
        )}

        {/* 기존 인물로 합치기(CHMO-689) — AI가 같은 인물을 새 인물로 잘못 나눈 앨범의 수동 보정.
            모임 유형 무관·인물 앨범만. 후보 타일 탭 = 확인 다이얼로그(비가역이라 즉시 실행하지 않는다) */}
        {album.personId != null && (
          <section className="mt-5 border-t border-border pt-4">
            <h3 className="text-[13px] font-bold text-text">기존 인물로 합치기</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              같은 인물이 새 인물로 잘못 나뉘었다면 기존 인물을 골라 합쳐요. 모임의 모든 이벤트에
              함께 적용돼요.
            </p>

            {!mergeOpen ? (
              <Button
                variant="secondary"
                fullWidth
                className="mt-3"
                disabled={busy}
                onClick={() => setMergeOpen(true)}
              >
                합칠 인물 고르기
              </Button>
            ) : personsApi.data === null ? (
              personsApi.loading ? (
                showPersonsLoading ? (
                  <p className="mt-3 text-sm text-muted">인물을 불러오는 중…</p>
                ) : null
              ) : (
                // 조회 실패는 이름 수정·멤버 연결을 막지 않는다 — 이 섹션 안에서만 알린다(멤버 조회와 같은 결)
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                  <p className="min-w-0 text-[13px] text-muted">인물을 불러오지 못했어요</p>
                  <button
                    type="button"
                    onClick={personsApi.refetch}
                    className="shrink-0 text-[13px] font-medium text-accent"
                  >
                    다시 시도
                  </button>
                </div>
              )
            ) : mergeCandidates.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">합칠 다른 인물이 없어요.</p>
            ) : (
              <div {...dragScroll} className="mt-3 flex select-none gap-3 overflow-x-auto pb-1">
                {mergeCandidates.map((p) => (
                  <button
                    key={p.personId}
                    type="button"
                    disabled={busy}
                    onClick={() => setMergeTarget(p)}
                    className={cx(
                      'press flex w-[88px] flex-none flex-col items-start gap-1.5',
                      busy && 'opacity-50',
                    )}
                  >
                    {p.coverThumbnailUrl ? (
                      <img
                        src={p.coverThumbnailUrl}
                        alt=""
                        // 마우스 끌기 스크롤(useDragScrollX)과 충돌하는 네이티브 이미지 드래그 차단
                        draggable={false}
                        className="h-[88px] w-[88px] rounded-2xl object-cover"
                      />
                    ) : (
                      <span
                        className="cheese-dots h-[88px] w-[88px] rounded-2xl bg-photo"
                        aria-hidden="true"
                      />
                    )}
                    <span className="max-w-full truncate text-[13px] font-bold text-text">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-muted">사진 {p.photoCount}장</span>
                  </button>
                ))}
              </div>
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

      {/* 병합 확인(CHMO-689) — 흡수 인물이 삭제되는 비가역 동작이라 검토 완료·앨범 삭제와 같은
          무게로 받는다. 다른 이벤트의 앨범까지 함께 합쳐진다는 사실을 여기서 한 번 더 말한다 */}
      <ConfirmDialog
        open={mergeTarget !== null}
        danger
        busy={merging}
        busyLabel="합치는 중…"
        title={mergeTarget ? `'${mergeTarget.name}'(으)로 합칠까요?` : ''}
        description={
          mergeTarget
            ? `'${album.name}'의 사진이 모든 이벤트에서 '${mergeTarget.name}' 앨범으로 합쳐지고, 이 인물은 사라져요. 되돌릴 수 없어요.`
            : ''
        }
        confirmLabel="합치기"
        onConfirm={() => void handleMerge()}
        onClose={() => {
          if (!merging) setMergeTarget(null)
        }}
      />

      {/* 연결 해제 확인 — 해제하면 그 멤버에게 이 인물 앨범이 더는 보이지 않는다(§7-1 미연결 회귀).
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
