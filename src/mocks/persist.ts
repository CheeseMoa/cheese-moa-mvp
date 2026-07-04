/**
 * 가입 유저 localStorage 보존 (코드리뷰 4 — A안).
 *
 * 목 DB는 새로고침마다 픽스처로 재시드되므로, signup으로 생긴 계정만
 * 브라우저 localStorage에 적어 두었다가 시드 직후 되살린다.
 * - 보존 대상은 **계정뿐** — 세션 중 만든 모임·이벤트·사진은 여전히 인메모리라 리셋된다.
 * - PIN 평문 저장은 목 전용 편의. 진짜 BE는 서버 DB에 해시로 저장한다.
 * - localStorage 불가 환경(프라이빗 모드, Node 테스트)에서는 조용히 세션 한정으로 동작.
 */
import { db, syncIdCounter, type DbUser } from './db'

const USERS_KEY = 'cheesemoa.mock.users'

function readStore(): DbUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (u): u is DbUser =>
        typeof (u as DbUser)?.id === 'string' &&
        typeof (u as DbUser)?.nickname === 'string' &&
        typeof (u as DbUser)?.pin === 'string',
    )
  } catch {
    return []
  }
}

function writeStore(users: DbUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  } catch {
    /* 보존 실패 시 세션 한정으로 동작 */
  }
}

/** signup 직후 호출 — 계정을 보존 목록에 추가(같은 id가 있으면 교체) */
export function persistUser(user: DbUser): void {
  const users = readStore().filter((u) => u.id !== user.id)
  users.push({ ...user })
  writeStore(users)
}

/** PATCH /me 반영 — 보존 목록에 이미 있는 계정만 갱신(픽스처 유저는 보존 대상 아님) */
export function updatePersistedUser(user: DbUser): void {
  const users = readStore()
  const index = users.findIndex((u) => u.id === user.id)
  if (index === -1) return
  users[index] = { ...user }
  writeStore(users)
}

/** 시드 직후 호출 — 보존된 가입 계정을 목 DB에 합류시키고 ID 카운터를 그 뒤로 민다 */
export function restorePersistedUsers(): void {
  for (const user of readStore()) {
    if (db.users.some((u) => u.id === user.id || u.nickname === user.nickname)) continue
    db.users.push({ ...user })
    syncIdCounter('usr', user.id)
  }
}
