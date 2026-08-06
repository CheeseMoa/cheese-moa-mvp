/**
 * MSW 시드 픽스처 (docs/api-spec.md §5 목 데이터 메모 기반).
 *
 * 구성:
 * - 유저 7(선생님 이현정 id 1 = 기본 로그인 계정, PIN 1234 · 학부모 시연 민준아빠 id 4, PIN 1111)
 * - 모임 3: 햇살반(이벤트 4종 상태 시연) · 달님반(빈 모임) · 별님반(미가입 → 참여 플로우용)
 * - 멤버십은 role(teacher/parent)·승인 상태(pending/active)·신청 자녀 이름을 갖는다(CHMO-444)
 * - 이벤트 4(햇살반): review / published / analyzing / empty — 상태별 화면 시연
 * - 인물은 모임 단위(personId) — 운동회·봄소풍이 같은 인물을 공유해 이름전파를 시연
 * - 사진은 앨범과 다대다(albumIds[]) — 일부 사진이 인물 앨범 2곳에 연결됨
 * - 검토는 사진 단위(reviewed) — 이벤트 1은 앨범 1 사진만, 이벤트 2는 전 사진 검토 + 발행 완료
 *   (발행 대기 = reviewed·미발행 상태는 두지 않는다 — 재공개 경로 폐지로 도달 불가, CHMO-488)
 *
 * ID는 BE(int64)와 동일하게 숫자 — 리소스 종류별 대역으로 가독성 유지:
 * 유저·모임·이벤트·인물 1~, 앨범 1~12, 사진은 이벤트별 100 단위(101~·201~·301~).
 * 신규 발급(nextId)은 1001부터라 시드와 충돌하지 않는다.
 *
 * createFixtures()는 **호출마다 모든 객체를 새로 만든다** — 재시드가 이전 세션의
 * 변형(사진 이동·검토 표시 등)을 물려받지 않게(테스트/리셋 안전).
 */
import { assignUncertainDetails, uploadKeyPrefixOf, type Db, type DbAlbum, type DbPhoto } from './db'

// ── 생성 헬퍼 ────────────────────────────────────────────────

/** 플래그는 인덱스 기반 고정 규칙(9번째마다 눈감음, 13번째마다 흔들림) — 결정적 시드 */
function makePhotos(idBase: number, eventId: number, count: number, baseTime: string): DbPhoto[] {
  return Array.from({ length: count }, (_, i) => {
    const landscape = i % 3 !== 2 // 2/3는 가로, 1/3은 세로
    const id = idBase + i + 1
    return {
      id,
      eventId,
      // 시드 사진은 presign을 거치지 않았지만 BE 응답엔 s3Key가 있다 — 키 규칙만 맞춘 결정적 값
      s3Key: `${uploadKeyPrefixOf(eventId)}seed-${id}.jpg`,
      albumIds: [],
      width: landscape ? 1600 : 1200,
      height: landscape ? 1200 : 1600,
      flags: { eyesClosed: i % 9 === 8, blurry: i % 13 === 12 },
      reviewed: false,
      published: false,
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
      // uncertain 최초 분류 시 bbox·사유 부여(CHMO-412) — 분석 경로(completeAnalysis)와 동일 규칙
      assignUncertainDetails(photo, i)
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
  // 공개된 이벤트 — 전 사진 검토 완료, 대부분 발행 완료.
  for (const photo of picnicPhotos) {
    photo.reviewed = true
    photo.published = true
  }
  // 발행 대기 시연 복원(CHMO-606 — CHMO-488의 "도달 불가" 전제 반전): 재업로드가 열려 공개 후
  // 추가·검토된 사진이 실제로 생긴다. 마지막 2장을 검토·미발행으로 둬 08 "발행 대기 2장" 안내와
  // 14 [공개하기] 재활성(재공개)을 목에서 볼 수 있게 한다(뷰어·학부모 화면엔 아직 안 보인다).
  for (const photo of picnicPhotos.slice(-2)) photo.published = false

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
      // 이현정은 관리자 겸용(CHMO-379) — role은 /admin/*에만 쓰이고 서비스 화면은 그대로다
      // (관리자도 평범한 유저로 모임 생성·검수·공개를 한다 — admin-spec §2-3 테스트 계정 겸용).
      { id: 1, nickname: '이현정', pin: '1234', role: 'ADMIN', createdAt: '2026-06-01T10:00:00+09:00' },
      { id: 2, nickname: '김지은', pin: '2580', role: 'USER', createdAt: '2026-06-01T10:05:00+09:00' },
      { id: 3, nickname: '박수민', pin: '4715', role: 'USER', createdAt: '2026-06-02T09:00:00+09:00' },
      // 학부모 전환(CHMO-444) 시연 계정 — 4는 학부모 화면(연결됨+대기), 6은 미연결 기본 경로(§2)
      { id: 4, nickname: '민준아빠', pin: '1111', role: 'USER', createdAt: '2026-07-01T10:00:00+09:00' },
      { id: 5, nickname: '서연맘', pin: '2222', role: 'USER', createdAt: '2026-07-01T10:05:00+09:00' },
      { id: 6, nickname: '지호네', pin: '3333', role: 'USER', createdAt: '2026-07-02T09:00:00+09:00' },
      { id: 7, nickname: '치즈냥이88', pin: '4444', role: 'USER', createdAt: '2026-07-25T09:00:00+09:00' },
      // 선생님 승인제(CHMO-475) 시연 — 선생님 키로 신청만 해 둔 대기 상태(20 선생님 탭)
      { id: 8, nickname: '신입쌤', pin: '5555', role: 'USER', createdAt: '2026-07-27T09:00:00+09:00' },
    ],
    groups: [
      {
        id: 1,
        name: '햇살반',
        groupType: 'business',
        password: '482AVX',
        joinKey: 'Haetsal3Kx9q',
        parentJoinKey: 'HaetsalP7d2m',
        share: { token: 'shr_grp1', password: '7421' },
        createdAt: '2026-05-01T09:00:00+09:00',
      },
      {
        id: 2,
        name: '달님반',
        groupType: 'business',
        password: '913BQZ',
        joinKey: 'Dalnim7Qw2pz',
        parentJoinKey: 'DalnimP4k8wq',
        share: { token: 'shr_grp2', password: '5830' },
        createdAt: '2026-06-10T09:00:00+09:00',
      },
      // 유저 1 미가입 — 모임 참여(joinKey: ByeolJoin5x8 + 비밀번호) 플로우 시연용.
      // 시드 joinKey도 실 BE처럼 대소문자 혼합 12자 — 대문자 변환이 끼어들면 목에서도 참여가 깨진다(CHMO-285)
      {
        id: 3,
        name: '별님반',
        groupType: 'business',
        password: '274CKD',
        joinKey: 'ByeolJoin5x8',
        parentJoinKey: 'ByeolP9s3xtw',
        share: { token: 'shr_grp3', password: '1946' },
        createdAt: '2026-06-20T09:00:00+09:00',
      },
      // GENERAL 모임(CHMO-604 — BE CHMO-599): 역할 분리 없음·전원 editor. 시크릿 4종은
      // BUSINESS와 똑같이 발급되지만 학부모 키(parentJoinKey) 합류는 SPACE404로 닫힌다(AC-6)
      // — presign 보호자 동의 428 없음(AC-4)과 함께 유형 분기 검증용 시드.
      {
        id: 4,
        name: '주말 등산 모임',
        groupType: 'general',
        password: '6205',
        joinKey: 'HikeGen8Rw3t',
        parentJoinKey: 'HikeGenP5c1k',
        share: { token: 'shr_grp4', password: '3712' },
        createdAt: '2026-07-15T09:00:00+09:00',
      },
    ],
    // 학부모 전환(CHMO-444): role·승인 상태 보유. PENDING 행이 곧 합류 신청(id = joinRequestId).
    // 햇살반: 선생님 3 + 학부모 active 3(지호네는 미연결) + 대기 신청 1(치즈냥이88) — 초대 관리(20) 시연.
    // 민준아빠는 별님반에 대기 신청도 있다 — 학부모 홈의 active 카드+대기 카드 동시 시연(§7-2).
    memberships: [
      { id: 1, userId: 1, groupId: 1, role: 'editor', status: 'active', childNames: [], createdAt: '2026-05-01T09:00:00+09:00' },
      { id: 2, userId: 2, groupId: 1, role: 'editor', status: 'active', childNames: [], createdAt: '2026-05-02T09:00:00+09:00' },
      { id: 3, userId: 3, groupId: 1, role: 'editor', status: 'active', childNames: [], createdAt: '2026-05-03T09:00:00+09:00' },
      { id: 4, userId: 1, groupId: 2, role: 'editor', status: 'active', childNames: [], createdAt: '2026-06-10T09:00:00+09:00' },
      { id: 5, userId: 2, groupId: 3, role: 'editor', status: 'active', childNames: [], createdAt: '2026-06-20T09:00:00+09:00' },
      { id: 6, userId: 4, groupId: 1, role: 'viewer', status: 'active', childNames: ['김민준'], createdAt: '2026-07-01T10:10:00+09:00' },
      { id: 7, userId: 5, groupId: 1, role: 'viewer', status: 'active', childNames: ['이서연'], createdAt: '2026-07-01T11:00:00+09:00' },
      { id: 8, userId: 6, groupId: 1, role: 'viewer', status: 'active', childNames: ['박지호'], createdAt: '2026-07-02T09:30:00+09:00' },
      { id: 9, userId: 7, groupId: 1, role: 'viewer', status: 'pending', childNames: ['김민준'], createdAt: '2026-07-25T09:10:00+09:00' },
      { id: 10, userId: 4, groupId: 3, role: 'viewer', status: 'pending', childNames: ['김민서'], createdAt: '2026-07-20T09:00:00+09:00' },
      // 선생님 신청(CHMO-475) — 선생님 키 합류도 승인 대기다. 자녀 이름은 없다(childNames 빈 배열)
      { id: 11, userId: 8, groupId: 1, role: 'editor', status: 'pending', childNames: [], createdAt: '2026-07-27T09:20:00+09:00' },
      // GENERAL 모임(4) — 전원 editor(ADR 020). 이현정(1)이 생성자, 김지은(2)이 합류 멤버
      { id: 12, userId: 1, groupId: 4, role: 'editor', status: 'active', childNames: [], createdAt: '2026-07-15T09:00:00+09:00' },
      { id: 13, userId: 2, groupId: 4, role: 'editor', status: 'active', childNames: [], createdAt: '2026-07-16T10:00:00+09:00' },
    ],
    // 학부모↔인물 매핑(§2) — 지호네(6)는 승인됐지만 미연결(매핑 0건 = 기본 경로) 시연
    personParents: [
      { userId: 4, personId: 1 },
      { userId: 5, personId: 2 },
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
      // GENERAL 모임(4)의 빈 이벤트 — 05 유형 분기 목 시연용(CHMO-609): 일반 모임 카드엔
      // NEW 배지가 없고('분류중'만 남는 규칙), 여기서 업로드를 시작하면 GENERAL이라
      // 보호자 동의 428 게이트도 없다(CHMO-604 AC-4).
      {
        id: 5,
        groupId: 4,
        name: '북한산 둘레길',
        date: '2026-07-19',
        status: 'empty',
        createdAt: '2026-07-19T09:00:00+09:00',
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
    // 동의 기록은 비워 둔다(CHMO-516) — 시드 계정에 보호자 동의 확인이 없으므로 빈 이벤트
    // (4번 '가을 발표회 준비')에서 업로드를 시작하면 실 BE처럼 AGREEMENT428 게이트를 만난다.
    // 기록을 미리 넣으면 목에서 그 경로를 한 번도 못 보고 지나간다.
    agreements: [],
    // 이벤트 1·2는 분석 완료 이력(done) — 상태가 review/published인 이벤트는 분석을 거쳤어야 함.
    // 이벤트 3은 시드 시점부터 분석 중 — 워커 기동 후 ANALYSIS_DURATION_MS 지나 조회하면 review로 전이
    analysisJobs: [
      {
        eventId: 1,
        status: 'done',
        startedAt: Date.now(),
        total: 24,
        options: { excludeEyesClosed: true, excludeBlurry: true },
      },
      {
        eventId: 2,
        status: 'done',
        // 공개된 이벤트 — 특수 앨범 없는 앨범 구성과 맞춰 품질 제외 옵션 OFF
        options: { excludeEyesClosed: false, excludeBlurry: false },
        startedAt: Date.now(),
        total: 16,
      },
      {
        eventId: 3,
        status: 'analyzing',
        startedAt: Date.now(),
        // 진행률 분모 = 물놀이 미분류 사진 20장(poolPhotos)과 일치해야 함(CHMO-287)
        total: 20,
        options: { excludeEyesClosed: true, excludeBlurry: true },
      },
    ],
    // 시드 사진은 presign을 거치지 않았다 — 업로드 키는 새 업로드에서만 쌓인다
    uploadedKeys: [],
  }
}
