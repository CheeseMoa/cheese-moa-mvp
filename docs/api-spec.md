# 치즈모아 MVP — API 명세서 (FE 소비용 계약)

> 함께 보기: [화면 명세](./screen-spec.md) · [기능 명세서](./feature-spec.md)
> 성격: **프론트엔드가 소비할 계약(contract).** BE/AI 구현은 본 문서 범위 밖. FE는 본 계약에 맞춰 **목(mock) 데이터/MSW**로 개발한다.
> 본 문서의 필드/형식은 FE 개발 기준안이며, 실제 BE 확정 시 동기화한다.

---

## 1. 공통 규약

- **Base URL**: `/api/v1`
- **포맷**: 요청/응답 `application/json` (사진 업로드만 `multipart/form-data`)
- **인증(제작자)**: `Authorization: Bearer <accessToken>`
- **인증(학부모 뷰어)**: 잠금 해제로 받은 `Authorization: Bearer <viewerToken>` (이벤트 공유 토큰 범위로 제한)
- **시간**: ISO 8601 (`2026-06-27T09:41:00+09:00`)
- **ID**: 문자열(예: `"evt_a1b2"`)
- **페이지네이션**: 목록은 커서 방식 `?cursor=<c>&limit=<n>`, 응답에 `nextCursor`(null이면 끝). MVP 화면 대부분은 단순 목록이라 미사용 가능.

### 공통 에러 포맷
```json
{ "error": { "code": "INVALID_PIN", "message": "PIN은 숫자 4자리여야 합니다." } }
```

| HTTP | code 예시 | 의미 |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_PIN` | 요청 형식 오류 |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | 인증 실패/토큰 없음 |
| 403 | `WRONG_PASSWORD` | 모임/공유 비밀번호 불일치 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `NICKNAME_TAKEN`, `ALREADY_MEMBER` | 충돌 |
| 413 | `PAYLOAD_TOO_LARGE` | 업로드 용량 초과 |

---

## 2. 리소스 스키마

### 데이터 모델(ERD) ↔ API 매핑

ERD 6개 엔티티 + 관계 테이블 2개와 API 노출 관계. **대표 벡터·멤버십·앨범↔사진 조인은 BE 내부**이며, 그 영향만 FE 응답 필드로 표면화한다.

| ERD 엔티티/관계 | API 노출 | 표면화 방식 |
|---|---|---|
| 유저 | `User` | pin 미노출 |
| 모임 | `Group` | password 미노출, `memberCount`/`joinKey` |
| 유저↔모임(멤버십) | **BE 내부** (`Membership`, N:M) | `GET /groups`·`POST /groups/join`로 반영, `Group.memberCount` |
| 이벤트 | `Event` | `share`·`analysisProgress` 포함(ERD 미모델, 화면 필요) |
| 앨범 | `Album` | 인물 앨범에 `personId`+`name` |
| 대표 벡터 | **BE 내부(비노출)** | 모임-단위 인물 정체성+이름 보유. FE엔 `Album.personId`/`name`으로만. 벡터 raw 절대 미노출 |
| 사진 | `Photo` | 앨범과 **다대다** → `Photo.albumIds[]` |
| 앨범↔사진 | **BE 내부** (`AlbumPhoto`, N:M) | 앨범별 사진 목록으로 표면화 |
| (없음) | `AnalysisJob` | ERD 미모델, 진행률 폴링용(파생) |

### User (제작자)
```json
{ "id": "usr_1", "nickname": "이현정", "createdAt": "2026-06-01T10:00:00+09:00" }
```
> PIN은 응답에 절대 포함하지 않음.

### Group (모임)
```json
{
  "id": "grp_1",
  "name": "햇살반",
  "memberCount": 24,
  "eventCount": 8,
  "joinKey": "HAETSAL",
  "role": null,
  "createdAt": "2026-05-01T09:00:00+09:00"
}
```
> `joinKey` = 참여 링크용 식별자(`/join/:joinKey`). `role`은 MVP에서 항상 `null`(권한 등급 없음). 모임 비밀번호는 응답에 미포함.

### Event (이벤트)
```json
{
  "id": "evt_1",
  "groupId": "grp_1",
  "name": "6.15 운동회 오전",
  "date": "2026-06-15",
  "status": "review",
  "photoCount": 124,
  "albumCount": 8,
  "share": {
    "token": "shr_abc123",
    "url": "https://app.cheesemoa.kr/share/shr_abc123",
    "hasPassword": true
  },
  "createdAt": "2026-06-15T09:00:00+09:00",
  "publishedAt": null
}
```
> `status` ∈ `empty | analyzing | review | ready | published`.
> `share`는 `published` 이후에만 활성(이전엔 `null` 가능). 공유 비밀번호 평문은 미포함.

### AnalysisJob (분석 진행)
```json
{ "eventId": "evt_1", "status": "analyzing", "progress": 72 }
```
> `status` ∈ `analyzing | done | failed`, `progress` 0–100.

### Album (앨범)
```json
{
  "id": "alb_1",
  "eventId": "evt_1",
  "type": "person",
  "personId": "psn_minjun",
  "name": "김민준",
  "photoCount": 18,
  "reviewStatus": "reviewed",
  "coverPhotoId": "pht_10",
  "visibleToViewer": true
}
```
> `type` ∈ `person | common | uncertain | eyes_closed | blurry`.
> `reviewStatus` ∈ `unreviewed | reviewed`.
> `visibleToViewer`: 학부모 뷰어 노출 여부(`person`/`common`만 true).
> **`personId`** (인물 앨범만, 그 외 `null`): 모임 단위 인물 식별자(대표 벡터 기반, BE 발급). 같은 모임 안에서 같은 아이면 이벤트가 달라도 동일한 `personId`.
> **`name`**: 인물 앨범의 `name`은 **앨범-로컬 값이 아니라 모임 단위 인물의 공유 이름**이다. 한 이벤트에서 이름을 바꾸면 같은 `personId`를 쓰는 그 모임의 모든 이벤트 앨범 이름이 함께 바뀐다(→ `PATCH /albums/:id`). 특수 앨범(common/uncertain/eyes_closed/blurry)의 `name`은 고정 라벨.

### Photo (사진)
```json
{
  "id": "pht_10",
  "eventId": "evt_1",
  "albumIds": ["alb_1", "alb_2"],
  "url": "https://cdn.cheesemoa.kr/p/pht_10.jpg",
  "thumbnailUrl": "https://cdn.cheesemoa.kr/p/pht_10_thumb.jpg",
  "width": 1600,
  "height": 1200,
  "flags": { "eyesClosed": false, "blurry": false },
  "createdAt": "2026-06-15T09:05:00+09:00"
}
```
> **사진은 앨범과 다대다**(`AlbumPhoto` 조인). 여러 아이가 같이 찍힌 사진은 각 아이 앨범에 모두 속할 수 있어 `albumIds`가 여러 개일 수 있다. 사진은 이벤트에 1개(`eventId`)로 귀속.

---

## 3. 엔드포인트

### 3.1 인증

#### `POST /auth/signup` — 계정 생성 · 화면 01-2
요청
```json
{ "nickname": "이현정", "pin": "1234" }
```
응답 `201`
```json
{ "accessToken": "<jwt>", "user": { "id": "usr_1", "nickname": "이현정", "createdAt": "..." } }
```
오류: `400 INVALID_PIN`(4자리 아님), `409 NICKNAME_TAKEN`.

#### `POST /auth/login` — 로그인 · 화면 01-1
요청 `{ "nickname": "이현정", "pin": "1234" }`
응답 `200` `{ "accessToken": "<jwt>", "user": { ... } }`
오류: `401 INVALID_CREDENTIALS`.

#### `GET /me` — 내 프로필 · 화면 설정
응답 `200` `{ "id": "usr_1", "nickname": "이현정", "createdAt": "..." }`

#### `PATCH /me` — 프로필 편집 · 화면 설정
요청(부분 업데이트) `{ "nickname": "이현정", "pin": "5678" }`
응답 `200` `{ "id": "usr_1", "nickname": "이현정", "createdAt": "..." }`
오류: `400 INVALID_PIN`, `409 NICKNAME_TAKEN`.

---

### 3.2 모임

#### `GET /groups` — 내 모임 목록 · 화면 02
응답 `200`
```json
{ "groups": [ { "id": "grp_1", "name": "햇살반", "memberCount": 24, "eventCount": 8, "joinKey": "HAETSAL", "role": null, "createdAt": "..." } ] }
```
> 빈 배열이면 홈 빈 상태(`211:1396`) 렌더.

#### `POST /groups` — 모임 만들기 · 화면 03
요청 `{ "name": "햇살반", "password": "482AVX" }`
응답 `201` → `Group`(생성자는 자동 멤버).
오류: `400 VALIDATION_ERROR`.

#### `GET /groups/:id` — 모임 상세 · 화면 05
응답 `200` → `Group`.

#### `POST /groups/join` — 모임 참여(선생님 초대 수락) · 화면 02-1
요청 `{ "joinKey": "HAETSAL", "password": "482AVX" }`
응답 `200` → `Group`(합류 후).
오류: `403 WRONG_PASSWORD`, `404 NOT_FOUND`, `409 ALREADY_MEMBER`.

#### `GET /groups/:id/invite` — 초대 정보 · 화면 초대(`211:1556`)
응답 `200`
```json
{ "joinKey": "HAETSAL", "password": "482AVX", "joinUrl": "https://app.cheesemoa.kr/join/HAETSAL" }
```
> 모임 비밀번호는 멤버에게만 노출(초대 화면 전용).

---

### 3.3 이벤트

#### `GET /groups/:id/events` — 이벤트 목록 · 화면 05
응답 `200`
```json
{ "events": [
  { "id": "evt_1", "name": "여름 물놀이", "date": "2026-06-27", "status": "analyzing", "photoCount": 210, "albumCount": 0, "analysisProgress": 72, "share": null, "createdAt": "..." },
  { "id": "evt_2", "name": "봄 소풍", "date": "2026-05-12", "status": "published", "photoCount": 128, "albumCount": 8, "share": { "token": "shr_x", "url": "...", "hasPassword": true }, "publishedAt": "..." }
] }
```
> 카드 배지 매핑: `analyzing`→`분석중 N%`(`analysisProgress`), `ready`→`공개 준비`, `published`→`공개 완료`, `empty`→`NEW`.

#### `POST /groups/:id/events` — 이벤트 생성 · 화면 06-M
요청 `{ "name": "2026-06-27" }` (기본값 = 오늘 날짜, 클라이언트가 채워 전송)
응답 `201` → `Event`(`status: "empty"`).

#### `GET /events/:id` — 이벤트 상세 · 화면 06-E / 08
응답 `200` → `Event`.

#### `PATCH /events/:id` — 이벤트 이름 수정 · 화면 08
요청 `{ "name": "6.15 운동회 오전" }`
응답 `200` → `Event`.

---

### 3.4 업로드 / 분석

#### `POST /events/:id/photos` — 사진 업로드 · 화면 06-U
요청 `multipart/form-data`
- `files[]`: 이미지 파일(다중)
- `excludeEyesClosed`: `true|false` (기본 true)
- `excludeBlurry`: `true|false` (기본 true)

응답 `202`
```json
{ "uploaded": 3, "eventId": "evt_1", "photoIds": ["pht_1","pht_2","pht_3"] }
```
오류: `413 PAYLOAD_TOO_LARGE`.

#### `POST /events/:id/analyze` — AI 분석 시작 · 화면 06-U
요청 `{}` (옵션은 업로드 시 전달분 사용)
응답 `202` → `AnalysisJob`(`status: "analyzing", progress: 0`). 이벤트 `status`→`analyzing`.

#### `GET /events/:id/analysis` — 분석 진행률(폴링) · 화면 06-U/05
응답 `200` → `AnalysisJob`. 완료 시 `{ "status": "done", "progress": 100 }`, 이벤트 `status`→`review`.

#### `GET /events/:id/review-summary` — 공개 전 검수 요약 · 화면 14
응답 `200`
```json
{ "photoCount": 124, "albumCount": 8, "reviewedAlbumCount": 8, "totalAlbumCount": 8, "uncertainCount": 6, "previewPhotoIds": ["pht_10","pht_22"] }
```

#### `POST /events/:id/publish` — 공개하기 · 화면 14
요청 `{}` (서버가 공유 토큰/비밀번호 생성·반환)
응답 `200`
```json
{ "id": "evt_1", "status": "published", "publishedAt": "...", "share": { "token": "shr_abc123", "url": "https://app.cheesemoa.kr/share/shr_abc123", "password": "7421", "hasPassword": true } }
```
> 공유 비밀번호 평문은 **이 응답에서만** 반환(학부모 전달용). 이후 조회 시엔 `hasPassword`만.
> 정책(구현 시 확정): 미검토 앨범 존재 시 `?force=true` 없이는 `409 HAS_UNREVIEWED_ALBUMS` 경고 반환 가능.

---

### 3.5 앨범 / 사진 (검수)

#### `GET /events/:id/albums` — 앨범 그리드 · 화면 08
응답 `200`
```json
{ "albums": [
  { "id": "alb_1", "type": "person", "personId": "psn_minjun", "name": "김민준", "photoCount": 18, "reviewStatus": "reviewed", "coverPhotoId": "pht_10", "visibleToViewer": true },
  { "id": "alb_6", "type": "uncertain", "personId": null, "name": "분류가 어려워요", "photoCount": 6, "reviewStatus": "unreviewed", "coverPhotoId": null, "visibleToViewer": false },
  { "id": "alb_7", "type": "eyes_closed", "personId": null, "name": "눈감은 사진", "photoCount": 6, "reviewStatus": "unreviewed", "coverPhotoId": null, "visibleToViewer": false },
  { "id": "alb_8", "type": "blurry", "personId": null, "name": "흔들린 사진", "photoCount": 6, "reviewStatus": "unreviewed", "coverPhotoId": null, "visibleToViewer": false }
] }
```

#### `GET /albums/:id` — 앨범 상세(사진 목록) · 화면 09
응답 `200`
```json
{ "album": { "id": "alb_1", "type": "person", "personId": "psn_minjun", "name": "김민준", "reviewStatus": "reviewed" },
  "photos": [ { "id": "pht_10", "albumIds": ["alb_1","alb_2"], "url": "...", "thumbnailUrl": "...", "flags": { "eyesClosed": false, "blurry": false } } ] }
```
> 사진의 `albumIds`로 "이 사진이 다른 아이 앨범에도 있음"을 FE가 표시할 수 있다(다대다).

#### `PATCH /albums/:id` — 검토 완료 / 인물 이름 변경 · 화면 08/09
요청(부분 업데이트)
```json
{ "reviewStatus": "reviewed", "name": "김민준" }
```
응답 `200` → `Album`.
> `reviewStatus`는 **앨범-로컬**: 모든 앨범 `reviewed` 시 이벤트 `status`→`ready`.
> **`name` 변경은 모임-단위 인물(대표 벡터) 이름 갱신 → 그 모임 내 모든 이벤트의 같은 `personId` 앨범 이름이 함께 바뀐다**(그룹 전체 전파). 인물 앨범(`type: person`)에서만 허용.
> FE 캐시: rename 성공 시 같은 `personId`를 쓰는 다른 이벤트의 앨범 목록도 무효화(refetch) 대상. 특수 앨범은 `name` 변경 불가(`400 VALIDATION_ERROR`).

#### `GET /albums/:id/move-suggestions` — 이동 추천 · 화면 09-1
쿼리: `?photoIds=pht_11,pht_12` (선택 사진 기준)
응답 `200`
```json
{ "suggestions": [
  { "albumId": "alb_2", "name": "서연", "similarity": 0.92 },
  { "albumId": "alb_1", "name": "민준", "similarity": 0.78 },
  { "albumId": "alb_3", "name": "하린", "similarity": 0.65 },
  { "albumId": "alb_common", "name": "공통", "similarity": null }
] }
```
> `similarity` 내림차순. 유사도는 **대표 벡터 기반(BE 계산)**, FE는 % 표시만. `공통`은 추천 무관 고정 옵션(`similarity: null`).

#### `POST /photos/move` — 사진 이동(앨범 재배치) · 화면 09-1
> 다대다 모델에서 "이동" = **현재(source) 앨범 연결 해제 + 대상(target) 앨범 연결**(오분류 보정). 복사가 아님.

요청 `{ "photoIds": ["pht_11","pht_12"], "sourceAlbumId": "alb_1", "targetAlbumId": "alb_2" }`
응답 `200` `{ "movedCount": 2, "sourceAlbumId": "alb_1", "targetAlbumId": "alb_2" }`

#### `DELETE /photos` — 사진 삭제(이벤트에서 영구) · 화면 09
> 다대다라도 삭제는 **이벤트 전체에서 영구 제거**(연결된 모든 앨범에서 사라짐). 휴지통 없음.

요청 `{ "eventId": "evt_1", "photoIds": ["pht_11","pht_12"] }`
응답 `200` `{ "deletedCount": 2 }`

---

### 3.6 학부모 뷰어 (무로그인, 이벤트별 공유 토큰)

> 진입: 공유 URL `…/share/:token`. 비밀번호 잠금 해제 후 발급된 `viewerToken`으로 이후 요청.

#### `POST /share/:token/unlock` — 잠금 해제 · 화면 15 진입 전
요청 `{ "password": "7421" }`
응답 `200`
```json
{ "viewerToken": "<viewer-jwt>", "event": { "id": "evt_1", "name": "6.15 운동회 오전", "status": "published", "publishedAt": "..." } }
```
오류: `403 WRONG_PASSWORD`, `404 NOT_FOUND`, `410 GONE`(공개 취소 등).

#### `GET /share/:token` — 공개 이벤트 앨범 · 화면 15
헤더 `Authorization: Bearer <viewerToken>`
응답 `200`
```json
{ "event": { "id": "evt_1", "name": "6.15 운동회 오전" },
  "albums": [
    { "id": "alb_1", "type": "person", "name": "김민준", "photoCount": 18, "coverPhotoId": "pht_10" },
    { "id": "alb_common", "type": "common", "name": "공통", "photoCount": 24, "coverPhotoId": "pht_99" }
  ] }
```
> **`person`/`common`만 반환**(특수 앨범 비노출).

#### `GET /share/:token/albums/:albumId` — 인물 앨범 상세 · 화면 16
응답 `200`
```json
{ "album": { "id": "alb_1", "name": "김민준", "photoCount": 18 },
  "photos": [ { "id": "pht_10", "url": "...", "thumbnailUrl": "...", "downloadUrl": "..." } ] }
```

#### `GET /share/:token/albums/:albumId/download` — 앨범 일괄 다운로드 · 화면 16
응답 `200` `application/zip` (스트림) 또는
```json
{ "downloadUrl": "https://cdn.cheesemoa.kr/zip/evt_1_alb_1.zip", "expiresAt": "..." }
```
> 개별 사진은 `photos[].downloadUrl` 사용. MVP는 **다운로드 한도 없음**.

---

## 4. 엔드포인트 ↔ 화면 매핑(추적표)

| 엔드포인트 | 화면(코드) |
|---|---|
| `POST /auth/signup` | 01-2 |
| `POST /auth/login` | 01-1 |
| `GET /me` · `PATCH /me` | 설정/프로필 편집 |
| `GET /groups` | 02 |
| `POST /groups` | 03 |
| `GET /groups/:id` | 05 |
| `POST /groups/join` | 02-1 |
| `GET /groups/:id/invite` | 초대(211:1556) |
| `GET /groups/:id/events` | 05 |
| `POST /groups/:id/events` | 06-M |
| `GET /events/:id` · `PATCH /events/:id` | 06-E / 08 |
| `POST /events/:id/photos` | 06-U |
| `POST /events/:id/analyze` · `GET /events/:id/analysis` | 06-U / 05 |
| `GET /events/:id/review-summary` · `POST /events/:id/publish` | 14 |
| `GET /events/:id/albums` | 08 |
| `GET /albums/:id` · `PATCH /albums/:id` | 09 / 08 |
| `GET /albums/:id/move-suggestions` · `POST /photos/move` | 09-1 |
| `DELETE /photos` | 09 |
| `POST /share/:token/unlock` · `GET /share/:token` | 15 |
| `GET /share/:token/albums/:albumId` (+ `/download`) | 16 |

---

## 5. FE 개발 메모 (목 데이터)
- 모든 엔드포인트는 MSW 핸들러로 목업 → 위 응답 예시를 픽스처로 사용.
- 폴링(`/events/:id/analysis`)은 목업에서 progress를 0→100으로 증가시키는 타이머로 시뮬레이션.
- `publish` 응답의 `share.password`는 화면 노출 1회용 → 클라이언트가 별도 보관/표시.
- 인증 토큰/뷰어 토큰은 메모리+localStorage 저장(뷰어 토큰은 token별 분리).
- 인물 이름은 `personId` 단위 공유 → 목업도 앨범 단위가 아니라 **`personId`별 이름 맵**으로 보관해, rename 시 같은 `personId`의 모든 이벤트 앨범이 함께 바뀌도록 시뮬레이션.
- 사진은 다대다 → 목업 픽스처에서 사진을 `albumIds` 배열로 보유. move는 source 제거+target 추가, delete는 모든 앨범에서 제거.
