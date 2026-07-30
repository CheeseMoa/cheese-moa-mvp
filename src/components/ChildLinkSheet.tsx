import { useRef, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { useDragScrollX } from '../hooks/useDragScrollX'
import { useMutation } from '../hooks/useMutation'
import { linkPersonParent, listGroupPersons } from '../api/groups'
import { cx } from '../lib/cx'
import type { GroupMember, ID } from '../types/api'
import { BottomSheet, Button, IconCheck, LoadState, useToast } from './ui'

interface ChildLinkSheetProps {
  groupId: ID | string
  /** 연결 대상 학부모(20 멤버 카드의 [연결]/[+ 연결]) — 신청 원문·기존 매핑을 함께 보여준다 */
  member: GroupMember
  onClose: () => void
  /** 연결 성공(1명 이상) — 부모가 시트를 닫고(언마운트) 멤버 목록 refetch */
  onLinked: (personNames: string[]) => void
}

/**
 * 20-1 아이 연결 바텀시트 · node 307:25 · POST /groups/:id/person-parents (CHMO-447).
 * 모임 인물 앨범(전 이벤트 합산 — listGroupPersons 파생)을 가로 스크롤로 골라 매핑을 만든다.
 * 승인·매핑 분리 확정(§1)이라 승인과 무관하게 언제든 열 수 있고, 다대다(다자녀·부모 2인)라
 * **여러 명을 한 번에 선택**할 수 있다 — 매핑 API는 1건 단위라 선택분을 순차 호출하고,
 * 중간 실패 시 성공분은 그대로 반영(부모 refetch)·실패만 토스트로 남긴다(§4 다대다라 부분
 * 성공이 반쪽 상태가 아니다). 이미 연결된 인물은 비활성 타일("연결됨")로 남겨 중복(409)을 막는다.
 * MovePhotosSheet처럼 **열려 있을 때만 마운트**된다 — 매 오픈이 새 마운트라 인물 목록이 신선하다.
 */
export function ChildLinkSheet({ groupId, member, onClose, onLinked }: ChildLinkSheetProps) {
  const toast = useToast()
  const mutate = useMutation()
  const { data, error, loading, refetch } = useApi(`group-persons:${groupId}`, (signal) =>
    listGroupPersons(groupId, signal),
  )
  const dragScroll = useDragScrollX()
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<ID>>(new Set())
  const [busy, setBusy] = useState(false)
  // 동기 락 — setBusy 반영 전 같은 프레임의 연타가 이중 연결(두 번째는 409)되는 것을 막는다
  const busyRef = useRef(false)

  const persons = data ?? []
  const linkedIds = new Set(member.mappings.map((m) => m.personId))
  const selectedPersons = persons.filter(
    (p) => selectedIds.has(p.personId) && !linkedIds.has(p.personId),
  )

  const toggleSelect = (personId: ID) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  const handleLink = async () => {
    if (selectedPersons.length === 0 || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    // 순차 연결 — 실패 시점까지의 성공분을 기억해 뒀다가 부분 성공 후속에 쓴다
    const succeeded: string[] = []
    await mutate(
      async () => {
        for (const person of selectedPersons) {
          await linkPersonParent(groupId, { userId: member.userId, personId: person.personId })
          succeeded.push(person.name)
        }
      },
      {
        // 전부 성공: 부모가 시트를 닫고(언마운트) 멤버 목록을 refetch 한다
        onSuccess: () => onLinked(succeeded),
        onError: (msg) => {
          if (succeeded.length > 0) {
            // 부분 성공 — 성공분은 부모 후속(닫기+refetch)을 그대로 태우고 실패만 토스트로 남긴다.
            // onLinked의 성공 토스트보다 늦게 띄워 실패 안내가 마지막에 보이게 한다.
            onLinked(succeeded)
            toast.show(msg)
          } else {
            toast.show(msg)
            busyRef.current = false
            setBusy(false)
          }
        },
      },
    )
  }

  return (
    <BottomSheet
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      title="아이와 연결하기"
      subtitle={
        member.childNames.length > 0
          ? `${member.nickname} · "${member.childNames.join(', ')} 학부모입니다"`
          : member.nickname
      }
    >
      {loading || error ? (
        <LoadState
          loading={loading}
          error={error}
          onRetry={refetch}
          unauthorizedTo="/login"
          className="py-8"
        />
      ) : persons.length === 0 ? (
        <p className="py-8 text-center text-sm leading-relaxed text-muted">
          아직 인물 앨범이 없어요.
          <br />
          사진을 올려 분류가 끝나면 연결할 수 있어요.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs tracking-[0.06em] text-muted">매핑될 앨범 선택</p>
          <div {...dragScroll} className="mt-2 flex select-none gap-3 overflow-x-auto pb-1">
            {persons.map((p) => {
              const alreadyLinked = linkedIds.has(p.personId)
              const isSelected = !alreadyLinked && selectedIds.has(p.personId)
              return (
                <button
                  key={p.personId}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={busy || alreadyLinked}
                  onClick={() => toggleSelect(p.personId)}
                  className={cx(
                    'flex w-[88px] flex-none flex-col items-start gap-1.5 transition active:scale-[0.97]',
                    (busy || alreadyLinked) && 'opacity-50',
                  )}
                >
                  {p.coverThumbnailUrl ? (
                    <img
                      src={p.coverThumbnailUrl}
                      alt=""
                      // 마우스 끌기 스크롤(useDragScrollX)과 충돌하는 네이티브 이미지 드래그 차단
                      draggable={false}
                      className={cx(
                        'h-[88px] w-[88px] rounded-2xl border-2 object-cover',
                        isSelected ? 'border-primary' : 'border-transparent',
                      )}
                    />
                  ) : (
                    <span
                      className={cx(
                        'cheese-dots h-[88px] w-[88px] rounded-2xl border-2 bg-photo',
                        isSelected ? 'border-primary' : 'border-transparent',
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex max-w-full items-center gap-1 text-[13px] font-bold text-text">
                    <span className="truncate">{p.name}</span>
                    {isSelected && <IconCheck size={14} />}
                  </span>
                  <span className="text-[11px] text-muted">
                    {alreadyLinked ? '연결됨' : `사진 ${p.photoCount}장`}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            연결하면 모든 이벤트에서 아이의 앨범과 공통 사진이 보여요.
          </p>
          <Button
            fullWidth
            className="mt-3.5"
            disabled={selectedPersons.length === 0 || busy}
            onClick={() => void handleLink()}
          >
            {busy
              ? '연결 중…'
              : selectedPersons.length > 1
                ? `${selectedPersons.length}명 연결하기`
                : '연결하기'}
          </Button>
        </>
      )}
    </BottomSheet>
  )
}
