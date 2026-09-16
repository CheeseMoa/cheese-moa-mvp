import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface AdminRowMenuItem {
  key: string
  label: string
  onSelect: () => void
}

export interface AdminRowMenuGroup {
  /** 묶음 제목 — 항목들이 공유하는 결과를 한 번만 말한다(예: '개통을 취소하고') */
  label?: string
  items: AdminRowMenuItem[]
}

/**
 * 표 행의 보조 동작 메뉴 (CHMO-811) — 주 버튼 곁 `⋯`.
 *
 * 자주 쓰지 않는 전이(되돌리기·종료)를 여기 담는다. 행마다 버튼을 늘어놓으면 셋이 같은
 * 무게로 서서 "지금 뭘 해야 하는지"가 사라진다 — 주 동작 하나만 버튼으로 두고 나머지는 접는다.
 *
 * 바깥 탭·ESC로 닫힌다. 표 하단 행에서는 위로 열어 스크롤 영역에 잘리지 않게 한다(`openUp`).
 */
export function AdminRowMenu({
  groups,
  disabled,
  openUp,
  label = '상태 변경 더보기',
}: {
  groups: AdminRowMenuGroup[]
  disabled?: boolean
  openUp?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="h-7 w-7 rounded-md border border-admin-border bg-admin-surface text-admin-muted hover:bg-admin-bg hover:text-admin-text disabled:opacity-40"
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute right-0 z-20 min-w-[11rem] rounded-lg border border-admin-border bg-admin-surface py-1 shadow-lg ${
            openUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {groups.map((group, groupIndex) => (
            <MenuGroup key={group.label ?? groupIndex} label={group.label} divided={groupIndex > 0}>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    item.onSelect()
                  }}
                  className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-[13px] text-admin-text hover:bg-admin-bg"
                >
                  {item.label}
                </button>
              ))}
            </MenuGroup>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MenuGroup({
  label,
  divided,
  children,
}: {
  label?: string
  divided?: boolean
  children: ReactNode
}) {
  return (
    <div className={divided ? 'mt-1 border-t border-admin-border pt-1' : undefined}>
      {label ? <div className="px-3 py-1 text-[11px] text-admin-muted">{label}</div> : null}
      {children}
    </div>
  )
}
