import { useState } from 'react'
import type { ReactNode } from 'react'
import { PhoneShell } from '../../components/PhoneShell'
import {
  AlbumCard,
  Badge,
  BottomSheet,
  Button,
  ConfirmDialog,
  EmptyState,
  EventCard,
  EventStatusBadge,
  GroupCard,
  Header,
  Modal,
  PhotoGrid,
  PhotoTile,
  Toggle,
  useToast,
} from '../../components/ui'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

/**
 * 공용 컴포넌트 데모 (CHMO-107 AC — 렌더·props 동작 확인용).
 * DEV 전용 라우트 /dev/components. 스펙: docs/design/screen-system.dc.html.
 */
export function ComponentGalleryPage() {
  const toast = useToast()
  const [eyesExclude, setEyesExclude] = useState(true)
  const [blurExclude, setBlurExclude] = useState(false)
  const [selectMode, setSelectMode] = useState(true)
  const [selected, setSelected] = useState<number[]>([1, 4])
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const toggleTile = (i: number) =>
    setSelected((prev) => (prev.includes(i) ? prev.filter((n) => n !== i) : [...prev, i]))

  return (
    <PhoneShell>
      <Header
        backTo="/"
        backLabel="홈"
        title="공용 컴포넌트"
        right={<span className="text-base text-muted">⚙</span>}
      />
      <main className="flex flex-1 flex-col gap-7 p-5 pb-10">
        <Section title="01 · Header — 홈형 (서브형은 이 화면 상단)">
          <div className="overflow-hidden rounded-xl border border-border">
            <Header
              right={
                <button type="button" aria-label="설정" className="text-lg text-muted">
                  ⚙
                </button>
              }
            />
          </div>
        </Section>

        <Section title="02 · Button">
          <Button fullWidth>+ 이벤트 생성</Button>
          <Button variant="secondary" fullWidth>
            취소
          </Button>
          <Button variant="warn" fullWidth>
            삭제
          </Button>
          <Button fullWidth disabled>
            공개하기 (disabled)
          </Button>
          <div className="flex gap-2.5">
            <Button size="sm">선택</Button>
            <Button size="sm" variant="secondary">
              전체 해제
            </Button>
          </div>
        </Section>

        <Section title="03 · Badge — 이벤트 상태 / 앨범 검토">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="new" />
            <Badge variant="analyzing" />
            <Badge variant="ready" />
            <Badge variant="published" />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="reviewed" />
            <Badge variant="unreviewed" />
            <Badge variant="published">공개됨</Badge>
            <span className="text-[11px] text-muted">
              EventStatusBadge(review) → 미정이라 미렌더:
            </span>
            <EventStatusBadge status="review" />
          </div>
        </Section>

        <Section title="04 · Toggle">
          <div className="flex items-center gap-6">
            <Toggle checked={eyesExclude} onChange={setEyesExclude} label="눈감은 사진 제외" />
            <Toggle checked={blurExclude} onChange={setBlurExclude} label="흔들린 사진 제외" />
          </div>
        </Section>

        <Section title="05 · GroupCard / EventCard">
          <GroupCard
            name="햇살반 학부모"
            memberCount={4}
            eventCount={3}
            onClick={() => toast.show('🧀 모임 카드 탭')}
          />
          <EventCard
            name="여름 물놀이"
            status="analyzing"
            meta="6월 24일 · 사진 124장 · 원아 18명"
            onClick={() => toast.show('🧀 이벤트 카드 탭')}
            onSettings={() => toast.show('🧀 이벤트 설정 ⚙')}
          />
          <EventCard name="봄 소풍" status="published" meta="5월 12일 · 사진 128장" />
          <EventCard name="새 이벤트" status="empty" meta="오늘 · 사진 0장" />
        </Section>

        <Section title="06 · AlbumCard — 검토 테두리 규칙">
          <div className="grid grid-cols-2 gap-3.5">
            <AlbumCard
              album={{ type: 'person', name: '김민준', photoCount: 16, unreviewedPhotoCount: 0 }}
              onClick={() => toast.show('🧀 앨범 카드 탭')}
            />
            <AlbumCard
              album={{
                type: 'person',
                name: '이서연',
                photoCount: 12,
                unreviewedPhotoCount: 12,
              }}
            />
            <AlbumCard album={{ type: 'uncertain', name: '분류가 어려워요', photoCount: 6 }} />
            <AlbumCard album={{ type: 'eyes_closed', name: '눈감은 사진', photoCount: 6 }} />
          </div>
          <p className="text-[11px] text-muted">테두리: 갈색 실선=검토완료 · 회색 점선=미검토</p>
        </Section>

        <Section title="07 · PhotoTile / PhotoGrid">
          <Toggle checked={selectMode} onChange={setSelectMode} label="선택 모드" />
          <PhotoGrid>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <PhotoTile
                key={i}
                selectable={selectMode}
                selected={selectMode && selected.includes(i)}
                onClick={() => selectMode && toggleTile(i)}
              />
            ))}
          </PhotoGrid>
        </Section>

        <Section title="08 · EmptyState">
          <div className="rounded-xl border border-border">
            <EmptyState
              title="아직 이벤트가 없어요"
              description={
                <>
                  첫 이벤트를 만들고 행사 사진을 올려보세요.
                  <br />
                  AI가 아이별 앨범으로 모아드려요.
                </>
              }
              action={<Button onClick={() => toast.show('🧀 이벤트 생성!')}>+ 이벤트 생성</Button>}
            />
          </div>
        </Section>

        <Section title="09~10 · Modal / ConfirmDialog / BottomSheet / Toast">
          <Button variant="secondary" fullWidth onClick={() => setModalOpen(true)}>
            Modal 열기
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setConfirmOpen(true)}>
            ConfirmDialog 열기 (danger)
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setSheetOpen(true)}>
            BottomSheet 열기
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => toast.show('🧀 검토 완료로 표시했어요')}
          >
            Toast 띄우기
          </Button>
        </Section>
      </main>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="모임 참여">
        <div className="mt-3.5 flex h-11 items-center rounded-xl border border-border bg-surface px-3.5 text-[13px] font-medium text-muted">
          모임 비밀번호
        </div>
        <div className="mt-4 flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
            취소
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              setModalOpen(false)
              toast.show('🧀 모임에 참여했어요')
            }}
          >
            참여하기
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="사진 12장을 삭제할까요?"
        description="이 앨범에서만 제거되고, 다른 앨범에서는 유지돼요."
        confirmLabel="삭제"
        onConfirm={() => {
          setConfirmOpen(false)
          toast.show('🧀 12장을 앨범에서 제거했어요')
        }}
        onClose={() => setConfirmOpen(false)}
      />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="사진 옮기기"
        subtitle="선택한 3장을 옮길 앨범을 고르세요"
      >
        {[
          { name: '박지우', count: 14 },
          { name: '최하은', count: 9 },
        ].map((row, i) => (
          <button
            key={row.name}
            type="button"
            onClick={() => {
              setSheetOpen(false)
              toast.show(`🧀 ${row.name} 앨범으로 옮겼어요`)
            }}
            className={`flex w-full items-center gap-3 py-3 text-left ${i === 0 ? 'border-b border-border' : ''}`}
          >
            <span className="cheese-dots h-9 w-9 rounded-[10px] bg-photo" />
            <span className="text-sm font-medium text-text">{row.name}</span>
            <span className="ml-auto text-xs text-muted">{row.count}장</span>
          </button>
        ))}
      </BottomSheet>
    </PhoneShell>
  )
}
