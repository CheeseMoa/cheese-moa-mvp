/**
 * MSW 시드 픽스처 (docs/api-spec.md §5 목 데이터 메모 기반).
 *
 * 구성:
 * - 유저 3(제작자 이현정 id 1 = 기본 로그인 계정, PIN 1234)
 * - 모임 3: 햇살반(이벤트 4종 상태 시연) · 달님반(빈 모임) · 별님반(미가입 → 참여 플로우용)
 * - 이벤트 4(햇살반): review / published / analyzing / empty — 상태별 화면 시연
 * - 인물은 모임 단위(personId) — 운동회·봄소풍이 같은 인물을 공유해 이름전파를 시연
 * - 사진은 앨범과 다대다(albumIds[]) — 일부 사진이 인물 앨범 2곳에 연결됨
 * - 검토는 사진 단위(reviewed) — 이벤트 1은 앨범 1 사진만, 이벤트 2는 전 사진 검토 완료
 *
 * ID는 BE(int64)와 동일하게 숫자 — 리소스 종류별 대역으로 가독성 유지:
 * 유저·모임·이벤트·인물 1~, 앨범 1~12, 사진은 이벤트별 100 단위(101~·201~·301~).
 * 신규 발급(nextId)은 1001부터라 시드와 충돌하지 않는다.
 *
 * createFixtures()는 **호출마다 모든 객체를 새로 만든다** — 재시드가 이전 세션의
 * 변형(사진 이동·검토 표시 등)을 물려받지 않게(테스트/리셋 안전).
 */
import type { Db, DbAlbum, DbPhoto } from './db'

// ── 생성 헬퍼 ────────────────────────────────────────────────

/** 플래그는 인덱스 기반 고정 규칙(9번째마다 눈감음, 13번째마다 흔들림) — 결정적 시드 */
function makePhotos(idBase: number, eventId: number, count: number, baseTime: string): DbPhoto[] {
  return Array.from({ length: count }, (_, i) => {
    const landscape = i % 3 !== 2 // 2/3는 가로, 1/3은 세로
    return {
      id: idBase + i + 1,
      eventId,
      albumIds: [],
      width: landscape ? 1600 : 1200,
      height: landscape ? 1200 : 1600,
      flags: { eyesClosed: i % 9 === 8, blurry: i % 13 === 12 },
      reviewed: false,
      createdAt: baseTime,
    }
  })
}

/** 앨범 리터럴 축약 — 검토 상태는 사진 단위라 앨범 필드는 이게 전부 */
function album(
  id: number,
  eventId: number,
  type: DbAlbum['type'],
  personId: number | null = null,
): DbAlbum {
  return { id, eventId, type, personId, coverPhotoId: null }
}

interface DistributeTargets {
  person: DbAlbum[]
  common?: DbAlbum
  uncertain?: DbAlbum
  eyesClosed?: DbAlbum
  blurry?: DbAlbum
}

/**
 * 목 분류 규칙으로 사진을 앨범에 연결(completeAnalysis와 같은 결):
 * 플래그 → 특수 앨범, 10장마다 분류어려움, 6장마다 공통, 나머지 인물 라운드로빈(4장마다 2인 앨범 = 다대다).
 */
function distribute(photos: DbPhoto[], targets: DistributeTargets): void {
  photos.forEach((photo, i) => {
    if (targets.eyesClosed && photo.flags.eyesClosed) {
      photo.albumIds.push(targets.eyesClosed.id)
      return
    }
    if (targets.blurry && photo.flags.blurry) {
      photo.albumIds.push(targets.blurry.id)
      return
    }
    if (targets.uncertain && i % 10 === 9) {
      photo.albumIds.push(targets.uncertain.id)
      return
    }
    if (targets.common && i % 6 === 5) {
      photo.albumIds.push(targets.common.id)
      return
    }
    photo.albumIds.push(targets.person[i % targets.person.length].id)
    if (i % 4 === 3) {
      const second = targets.person[(i + 1) % targets.person.length]
      if (!photo.albumIds.includes(second.id)) photo.albumIds.push(second.id)
    }
  })
}

/** 앨범 커버 = 그 앨범의 첫 사진 */
function assignCovers(albums: DbAlbum[], photos: DbPhoto[]): void {
  for (const album of albums) {
    album.coverPhotoId = photos.find((p) => p.albumIds.includes(album.id))?.id ?? null
  }
}

// ── 앨범·사진 세트 (호출마다 새로 조립 — 재시드 순수성) ──────

function buildAlbumsAndPhotos(): { albums: DbAlbum[]; photos: DbPhoto[] } {
  // 이벤트 1 「6.15 운동회 오전」 — 검수 중(review): 인물 4 + 특수 4
  const sportsAlbums = [
    album(1, 1, 'person', 1),
    album(2, 1, 'person', 2),
    album(3, 1, 'person', 3),
    album(4, 1, 'person', 4),
    album(5, 1, 'common'),
    album(6, 1, 'uncertain'),
    album(7, 1, 'eyes_closed'),
    album(8, 1, 'blurry'),
  ]
  const sportsPhotos = makePhotos(100, 1, 28, '2026-06-15T10:30:00+09:00')
  distribute(sportsPhotos, {
    person: sportsAlbums.slice(0, 4),
    common: sportsAlbums[4],
    uncertain: sportsAlbums[5],
    eyesClosed: sportsAlbums[6],
    blurry: sportsAlbums[7],
  })
  assignCovers(sportsAlbums, sportsPhotos)
  // 검토는 사진 단위 — 김민준(앨범 1) 앨범 사진만 검토 완료된 "검수 중간" 상태 시연
  for (const photo of sportsPhotos) if (photo.albumIds.includes(1)) photo.reviewed = true

  // 이벤트 2 「봄 소풍」 — 공개 완료(published): 인물 3 + 공통 (운동회와 인물 공유 → 이름전파 시연)
  const picnicAlbums = [
    album(9, 2, 'person', 1),
    album(10, 2, 'person', 2),
    album(11, 2, 'person', 3),
    album(12, 2, 'common'),
  ]
  const picnicPhotos = makePhotos(200, 2, 16, '2026-05-12T11:00:00+09:00')
  distribute(picnicPhotos, {
    person: picnicAlbums.slice(0, 3),
    common: picnicAlbums[3],
    // 공개된 이벤트 — 특수 앨범 없음(검수 때 이미 정리된 컨셉). 플래그 사진도 인물/공통으로 분배
  })
  assignCovers(picnicAlbums, picnicPhotos)
  // 공개된 이벤트 — 전 사진 검토 완료(뷰어에 모두 노출)
  for (const photo of picnicPhotos) photo.reviewed = true

  // 이벤트 3 「여름 물놀이」 — 분석 중(analyzing): 사진은 등록됐지만 아직 앨범 없음
  const poolPhotos = makePhotos(300, 3, 20, '2026-06-27T10:00:00+09:00')

  return {
    albums: [...sportsAlbums, ...picnicAlbums],
    photos: [...sportsPhotos, ...picnicPhotos, ...poolPhotos],
  }
}

// ── 최종 시드 ────────────────────────────────────────────────

export function createFixtures(): Db {
  const { albums, photos } = buildAlbumsAndPhotos()
  return {
    users: [
      { id: 1, nickname: '이현정', pin: '1234', createdAt: '2026-06-01T10:00:00+09:00' },
      { id: 2, nickname: '김지은', pin: '2580', createdAt: '2026-06-01T10:05:00+09:00' },
      { id: 3, nickname: '박수민', pin: '4715', createdAt: '2026-06-02T09:00:00+09:00' },
    ],
    groups: [
      {
        id: 1,
        name: '햇살반',
        password: '482AVX',
        joinKey: 'HAETSAL',
        share: { token: 'shr_grp1', password: '7421' },
        createdAt: '2026-05-01T09:00:00+09:00',
      },
      {
        id: 2,
        name: '달님반',
        password: '913BQZ',
        joinKey: 'DALNIM',
        share: { token: 'shr_grp2', password: '5830' },
        createdAt: '2026-06-10T09:00:00+09:00',
      },
      // 유저 1 미가입 — 모임 참여(joinKey: BYEOL + 비밀번호) 플로우 시연용
      {
        id: 3,
        name: '별님반',
        password: '274CKD',
        joinKey: 'BYEOL',
        share: { token: 'shr_grp3', password: '1946' },
        createdAt: '2026-06-20T09:00:00+09:00',
      },
    ],
    memberships: [
      { userId: 1, groupId: 1 },
      { userId: 2, groupId: 1 },
      { userId: 3, groupId: 1 },
      { userId: 1, groupId: 2 },
      { userId: 2, groupId: 3 },
    ],
    events: [
      {
        id: 1,
        groupId: 1,
        name: '6.15 운동회 오전',
        date: '2026-06-15',
        status: 'review',
        createdAt: '2026-06-15T09:00:00+09:00',
        publishedAt: null,
      },
      {
        id: 2,
        groupId: 1,
        name: '봄 소풍',
        date: '2026-05-12',
        status: 'published',
        createdAt: '2026-05-12T09:00:00+09:00',
        publishedAt: '2026-05-14T18:00:00+09:00',
      },
      {
        id: 3,
        groupId: 1,
        name: '여름 물놀이',
        date: '2026-06-27',
        status: 'analyzing',
        createdAt: '2026-06-27T09:00:00+09:00',
        publishedAt: null,
      },
      {
        id: 4,
        groupId: 1,
        name: '가을 발표회 준비',
        date: '2026-07-01',
        status: 'empty',
        createdAt: '2026-07-01T09:00:00+09:00',
        publishedAt: null,
      },
    ],
    persons: [
      { id: 1, groupId: 1, name: '김민준' },
      { id: 2, groupId: 1, name: '이서연' },
      { id: 3, groupId: 1, name: '박하린' },
      { id: 4, groupId: 1, name: '최지우' },
    ],
    albums,
    photos,
    // 이벤트 1·2는 분석 완료 이력(done) — 상태가 review/published인 이벤트는 분석을 거쳤어야 함.
    // 이벤트 3은 시드 시점부터 분석 중 — 워커 기동 후 ANALYSIS_DURATION_MS 지나 조회하면 review로 전이
    analysisJobs: [
      {
        eventId: 1,
        status: 'done',
        startedAt: Date.now(),
        options: { excludeEyesClosed: true, excludeBlurry: true },
      },
      {
        eventId: 2,
        status: 'done',
        // 공개된 이벤트 — 특수 앨범 없는 앨범 구성과 맞춰 품질 제외 옵션 OFF
        options: { excludeEyesClosed: false, excludeBlurry: false },
        startedAt: Date.now(),
      },
      {
        eventId: 3,
        status: 'analyzing',
        startedAt: Date.now(),
        options: { excludeEyesClosed: true, excludeBlurry: true },
      },
    ],
    // 시드 사진은 presign을 거치지 않았다 — 업로드 키는 새 업로드에서만 쌓인다
    uploadedKeys: [],
  }
}
