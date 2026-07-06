# 치즈모아 MVP — API 명세서 (FE 소비용 계약)

> 함께 보기: [화면 명세](./screen-spec.md) · [기능 명세서](./feature-spec.md)
> 성격: **프론트엔드가 소비할 계약(contract).** BE/AI 구현은 본 문서 범위 밖. FE는 본 계약에 맞춰 **목(mock) 데이터/MSW**로 개발한다.
> 본 문서의 필드/형식은 FE 개발 기준안이며, 실제 BE 확정 시 동기화한다.

---

## 1. 공통 규약

- **Base URL**: `/api/v1`
- **포맷**: 요청/응답 `application/json`. **사진 파일 자체는 presigned URL로 S3에 직접 `PUT`**(우리 API는 JSON만 주고받고 multipart 없음).
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
| 모임 | `Group` | password 미노출, `memberCount`/`joinKey`, `share`(학부모 공유·모임 단위) |
| 유저↔모임(멤버십) | **BE 내부** (`Membership`, N:M) | `GET /groups`·`POST /groups/join`로 반영, `Group.memberCount` |
| 이벤트 | `Event` | `status`/`publishedAt`(공개 단위). 학부모 공유는 모임(`Group.share`)으로 이동 |
| 앨범 | `Album` | 인물 앨범에 `personId`+`name` |
| 대표 벡터 | **BE 내부(비노출)** | 모임-단위 인물 정체성+이름 보유. FE엔 `Album.personId`/`name`으로만. 벡터 raw 절대 미노출 |
| 사진 | `Photo` | 앨범과 **다대다** → `Photo.albumIds[]` |
| 앨범↔사진 | **BE 내부** (`AlbumPhoto`, N:M) | 앨범별 사진 목록으로 표면화 |
| (없음) | `AnalysisJob` | ERD 미모델, 분석 상태 확인용(파생) |

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
  "share": {
    "token": "shr_grp1",
    "url": "https://app.cheesemoa.kr/share/shr_grp1",
    "hasPassword": true
  },
  "createdAt": "2026-05-01T09:00:00+09:00"
}
```
> `joinKey` = 참여 링크용 식별자(`/join/:joinKey`). `role`은 MVP에서 항상 `null`(권한 등급 없음). 제작자 합류용 모임 비밀번호는 응답에 미포함.
> **`share`** = **학부모 무로그인 공유(모임 단위).** 모임 생성 시 자동 발급(항상 존재, `hasPassword: true`). 학부모 전용 비밀번호는 **제작자 합류용 모임 비밀번호와 별개**이며 평문은 여기 미포함 → `GET /groups/:id/share`로 멤버만 조회. 학부모는 이 링크로 들어와 **공개(published)된 이벤트만** 골라 본다.

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
  "createdAt": "2026-06-15T09:00:00+09:00",
  "publishedAt": null
}
```
> `status` ∈ `empty | analyzing | review | ready | published`.
> **이벤트는 자체 공유 링크가 없다.** `published`가 되면 그 이벤트가 **모임 학부모 공유 목록**에 노출된다(공유 링크/비밀번호는 모임 단위 → `Group.share`). `publishedAt`은 공개 시각.

### AnalysisJob (분석 상태)
```json
{ "eventId": "evt_1", "status": "analyzing" }
```
> `status` ∈ `analyzing | done | failed`. **진행률(%)은 MVP 제외** — 배지는 `분석중`만 표시(자동 폴링 없음, 완료는 화면 재진입/새로고침 시 상태로 확인).

### Album (앨범)
```json
{
  "id": "alb_1",
  "eventId": "evt_1",
  "type": "person",
  "personId": "psn_minjun",
  "name": "김민준",
  "photoCount": 18,
  "unreviewedPhotoCount": 0,
  "coverPhotoId": "pht_10",
  "coverThumbnailUrl": "https://cdn.cheesemoa.kr/p/pht_10_thumb.jpg",
  "visibleToViewer": true
}
```
> `type` ∈ `person | common | uncertain | eyes_closed | blurry`.
> 검토 상태는 **사진 단위**(`Photo.reviewed`) — `unreviewedPhotoCount`는 앨범 내 미검토 사진 수(파생값). 앨범 자체는 검토 상태를 갖지 않는다.
> `coverThumbnailUrl`: 커버 사진(`coverPhotoId`) 썸네일 URL(**파생값** — 커버가 없으면 `null`). 08 앨범 그리드 카드 커버용(`coverPhotoId`만으로 URL을 조립할 수 없어 표면화). 뷰어 앨범(`ViewerAlbum`)에도 후속 도입 예정.
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
  "reviewed": true,
  "createdAt": "2026-06-15T09:05:00+09:00"
}
```
> **사진은 앨범과 다대다**(`AlbumPhoto` 조인). 여러 아이가 같이 찍힌 사진은 각 아이 앨범에 모두 속할 수 있어 `albumIds`가 여러 개일 수 있다. 사진은 이벤트에 1개(`eventId`)로 귀속.
> **`reviewed`(검토)는 사진 단위.** 앨범의 `검토 완료`는 일괄 처리 액션이며, **미검토 사진은 학부모 뷰어 응답에서 제외**된다(서버 필터링).

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

#### `PATCH /groups/:id` — 모임 이름 수정 · 화면 05(모임 설정 ⚙)
요청 `{ "name": "햇살반 2기" }`
응답 `200` → `Group`.
오류: `400 VALIDATION_ERROR`, `404 NOT_FOUND`.
> **이름(`name`)만 변경 가능.** 모임 비밀번호·`joinKey`·멤버 등 다른 필드는 이 엔드포인트로 변경 불가(MVP). `name` 외 필드 전송 시 무시.

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

#### `GET /groups/:id/share` — 학부모 공유 정보 · 화면 05(학부모 공유)
응답 `200`
```json
{ "token": "shr_grp1", "url": "https://app.cheesemoa.kr/share/shr_grp1", "password": "7421", "hasPassword": true }
```
> **학부모 무로그인 공유(모임 단위).** 링크 + **학부모 전용 비밀번호**(제작자 합류용 모임 비밀번호와 **별개**). 평문 비밀번호는 멤버에게만 노출(공유 화면 전용, 학부모 전달용). 모임 생성 시 자동 발급되어 항상 존재.

---

### 3.3 이벤트

#### `GET /groups/:id/events` — 이벤트 목록 · 화면 05
응답 `200`
```json
{ "events": [
  { "id": "evt_1", "name": "여름 물놀이", "date": "2026-06-27", "status": "analyzing", "photoCount": 210, "albumCount": 0, "createdAt": "..." },
  { "id": "evt_2", "name": "봄 소풍", "date": "2026-05-12", "status": "published", "photoCount": 128, "albumCount": 8, "publishedAt": "..." }
] }
```
> 카드 배지 매핑: `analyzing`→`분석중`, `ready`→`공개 준비`, `published`→`공개 완료`, `empty`→`NEW`.

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

> **업로드 = presigned URL 2-step.** 파일 바이트는 서버/Lambda를 거치지 않고 **FE→S3로 직접 `PUT`**. Lambda(IAM 역할)는 ① presigned URL 발급만 하고, ② S3 업로드가 끝나면 **S3 이벤트가 Lambda를 깨워 사진을 이벤트에 자동 등록**한다(FE의 별도 `complete`/커밋 호출 없음). 흐름: **① presign → ② S3 PUT(직접) → [AI 분석]**.

#### `POST /events/:id/photos/presign` — 업로드 URL 발급(①) · 화면 06-U
요청
```json
{ "files": [
  { "filename": "img_001.jpg", "contentType": "image/jpeg", "size": 3145728 }
] }
```
응답 `200`
```json
{ "uploads": [
  { "photoId": "pht_1", "uploadUrl": "https://cheesemoa-uploads.s3.ap-northeast-2.amazonaws.com/evt_1/pht_1.jpg?X-Amz-...", "method": "PUT", "headers": { "Content-Type": "image/jpeg" }, "expiresAt": "2026-06-27T09:51:00+09:00" }
] }
```
> Lambda가 파일별 `photoId`를 선발급 + **presigned URL**(짧은 TTL, 크기/타입 조건) 반환. FE는 AWS 자격증명 없이 이 URL로만 올린다. 오류: `400 VALIDATION_ERROR`, `413 PAYLOAD_TOO_LARGE`(size 초과).
> 업로드는 `analyzing` 상태에서만 거부(400). **`published` 이벤트에도 업로드 가능** — 새 사진은 `reviewed: false`로 등록되어 검토 완료 전까지 뷰어에 노출되지 않는다.

#### (②) S3 직접 업로드 — **API 아님**
FE가 각 파일을 `uploadUrl`로 직접 `PUT`한다(병렬·재시도, 진행률은 FE가 측정). 업로드 성공 시 **S3 이벤트 → Lambda가 해당 사진을 이벤트에 자동 등록**(`photoCount` 반영). presign만 하고 `PUT` 안 한 `photoId`는 등록되지 않는다(S3 lifecycle로 정리).

#### `POST /events/:id/analyze` — AI 분석 시작 · 화면 06-U
요청 `{ "excludeEyesClosed": true, "excludeBlurry": true }` (기본 각각 `true`)
응답 `202` → `AnalysisJob`(`status: "analyzing"`). 이벤트 `status`→`analyzing` (**`published`는 공개 유지** — 상태 전이 없이 분석 진행).
> `[AI 분석]`이 배치 종료 신호 — **아직 앨범에 속하지 않은 사진만 증분 분석**(기존 앨범·수동 배치·검토 상태 보존). `excludeEyesClosed`/`excludeBlurry` ON 시 해당 사진은 인물 앨범 대신 `eyes_closed`/`blurry`로 라우팅.
>
> ⚠️ **알려진 한계 — 고아 사진(후속 과제 · BE 대응 필요)**: 사진 등록(S3 `PUT` → Lambda 자동 등록)과 분석 시작(`analyze`, **FE가 보내는 신호**)이 분리돼 있어, **업로드는 끝났지만 `analyze` 전에 사용자가 이탈**(브라우저 뒤로가기·탭 닫기·앱 종료·통신 끊김)하면 **등록됐으나 분석되지 않은 '고아 사진'**이 남는다. 이때 이벤트는 `empty`(또는 이전 상태)에 머물러 화면은 "사진 없음"으로 오표시되고, 다음 업로드→분석 때 고아 사진이 한꺼번에 앨범에 편입된다(같은 파일을 다시 골랐다면 **중복 등록**). 프론트만으로는 서버 사진을 되돌릴 수단이 없어(취소/삭제 API 부재) **완전 해결 불가** — **근본 해결은 BE 몫**: ① 미분석 업로드 취소 API, 또는 ② `empty`인데 미분류 사진이 존재하면 재분석을 잇는 서버 트리거. FE 임시 완화안(빈 이벤트에서 `photoCount>0`을 감지해 "분석 이어서 시작" 유도)은 후속 스토리에서 검토. **→ CHMO 백로그 버그 등록 대상.**

#### `GET /events/:id/analysis` — 분석 상태 확인 · 화면 06-U/05
응답 `200` → `AnalysisJob`. 완료 시 `{ "eventId": "evt_1", "status": "done" }`, 이벤트 `status`→`review`(`published`였다면 그대로 유지).
> **진행률(%)·자동 폴링 없음**(MVP 제외). 완료는 화면 재진입/새로고침 시 상태로 확인.

#### `GET /events/:id/review-summary` — 공개 전 검수 요약 · 화면 14
응답 `200`
```json
{ "photoCount": 124, "albumCount": 8, "reviewedPhotoCount": 118, "totalPhotoCount": 124, "uncertainCount": 6, "previewPhotoIds": ["pht_10","pht_22"] }
```

#### `POST /events/:id/publish` — 공개하기 · 화면 14
요청 `{}`
응답 `200`
```json
{ "id": "evt_1", "status": "published", "publishedAt": "..." }
```
> 공개 = 이 이벤트를 **모임 학부모 공유 목록에 노출**(`published`). **이벤트별 공유 링크/비밀번호는 없다** — 학부모 공유는 **모임 단위**(`Group.share` / `GET /groups/:id/share`)이며 모임 생성 시 이미 발급돼 있다.
> 정책(확정): 미검토 사진 존재 시 `?force=true` 없이는 `409 HAS_UNREVIEWED_PHOTOS`를 반환하고, `?force=true`면 그대로 공개한다(미검토 사진은 공개 후에도 뷰어에 비노출). `review`/`ready` 상태에서만 공개 가능하며 사진 0장이면 `400`.

---

### 3.5 앨범 / 사진 (검수)

#### `GET /events/:id/albums` — 앨범 그리드 · 화면 08
응답 `200`
```json
{ "albums": [
  { "id": "alb_1", "type": "person", "personId": "psn_minjun", "name": "김민준", "photoCount": 18, "unreviewedPhotoCount": 0, "coverPhotoId": "pht_10", "coverThumbnailUrl": "https://cdn.cheesemoa.kr/p/pht_10_thumb.jpg", "visibleToViewer": true },
  { "id": "alb_6", "type": "uncertain", "personId": null, "name": "분류가 어려워요", "photoCount": 6, "unreviewedPhotoCount": 6, "coverPhotoId": null, "coverThumbnailUrl": null, "visibleToViewer": false },
  { "id": "alb_7", "type": "eyes_closed", "personId": null, "name": "눈감은 사진", "photoCount": 6, "unreviewedPhotoCount": 6, "coverPhotoId": null, "coverThumbnailUrl": null, "visibleToViewer": false },
  { "id": "alb_8", "type": "blurry", "personId": null, "name": "흔들린 사진", "photoCount": 6, "unreviewedPhotoCount": 6, "coverPhotoId": null, "coverThumbnailUrl": null, "visibleToViewer": false }
] }
```

#### `GET /albums/:id` — 앨범 상세(사진 목록) · 화면 09
응답 `200`
```json
{ "album": { "id": "alb_1", "type": "person", "personId": "psn_minjun", "name": "김민준", "unreviewedPhotoCount": 0 },
  "photos": [ { "id": "pht_10", "albumIds": ["alb_1","alb_2"], "url": "...", "thumbnailUrl": "...", "flags": { "eyesClosed": false, "blurry": false }, "reviewed": true } ] }
```
> 사진의 `albumIds`로 "이 사진이 다른 아이 앨범에도 있음"을 FE가 표시할 수 있다(다대다).

#### `PATCH /albums/:id` — 검토 완료 / 인물 이름 변경 · 화면 08/09
요청(부분 업데이트)
```json
{ "reviewed": true, "name": "김민준" }
```
응답 `200` → `Album`.
> `reviewed: true` = **앨범 내 전 사진 일괄 검토 처리**(검토 상태는 사진 단위 저장 — 앨범은 상태를 갖지 않음). `reviewed: false`로 일괄 해제도 가능. 이벤트의 전 사진 `reviewed` 시 `status`→`ready`, 해제 시 `review` 복귀(`published`는 유지). (사진 개별 검토 토글 API는 미도입 — 앨범 단위 일괄만. 필요 시 후속 스토리에서 추가.)
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

#### `DELETE /photos` — 앨범에서 사진 제거(연결 해제) · 화면 09
> 다대다 모델에서 삭제 = **해당(source) 앨범 연결만 해제.** 사진은 이벤트와 **다른 앨범엔 그대로 남는다**(그 앨범들에서 사라지지 않음). 휴지통 없음.
> 사진이 그 앨범에만 속해 있었다면 이후 어떤 앨범에도 안 남아 이벤트에서 실질적으로 사라진다(마지막 연결 해제 = 완전 삭제, 복구 없음).

요청 `{ "albumId": "alb_1", "photoIds": ["pht_11","pht_12"] }`
응답 `200` `{ "removedCount": 2, "albumId": "alb_1" }`

---

### 3.6 학부모 뷰어 (무로그인, 모임 공유 토큰)

> 진입: 모임 공유 URL `…/share/:token`(token = **모임** 공유 토큰). 비밀번호 잠금 해제 후 발급된 `viewerToken`(모임 범위)으로 이후 요청.
> 뷰어 응답의 사진은 **검토 완료(`reviewed: true`)된 사진만** 포함 — 미검토 사진 필터링은 서버 책임(FE는 받은 대로 렌더).
> 흐름: 잠금 해제 → **공개 이벤트 목록**(15-L) → 이벤트 선택 → 앨범(15) → 인물 앨범(16).

#### `POST /share/:token/unlock` — 잠금 해제 · 화면 15 진입 전
요청 `{ "password": "7421" }`
응답 `200`
```json
{ "viewerToken": "<viewer-jwt>", "group": { "id": "grp_1", "name": "햇살반" } }
```
> `password` = 학부모 전용 비밀번호(모임 단위). 오류: `403 WRONG_PASSWORD`, `404 NOT_FOUND`.

#### `GET /share/:token` — 공개 이벤트 목록 · 화면 15-L
헤더 `Authorization: Bearer <viewerToken>`
응답 `200`
```json
{ "group": { "id": "grp_1", "name": "햇살반" },
  "events": [
    { "id": "evt_2", "name": "봄 소풍", "date": "2026-05-12", "photoCount": 128, "albumCount": 8, "coverPhotoId": "pht_99", "publishedAt": "..." }
  ] }
```
> **공개(`published`)된 이벤트만** 반환. 없으면 `events: []`(빈 목록 화면).

#### `GET /share/:token/events/:eventId` — 공개 이벤트 앨범 · 화면 15
응답 `200`
```json
{ "event": { "id": "evt_2", "name": "봄 소풍" },
  "albums": [
    { "id": "alb_1", "type": "person", "name": "김민준", "photoCount": 18, "coverPhotoId": "pht_10" },
    { "id": "alb_common", "type": "common", "name": "공통", "photoCount": 24, "coverPhotoId": "pht_99" }
  ] }
```
> **`person`/`common`만 반환**(특수 앨범 비노출). `eventId`가 공개 이벤트가 아니면 `404 NOT_FOUND`.

#### `GET /share/:token/events/:eventId/albums/:albumId` — 인물 앨범 상세 · 화면 16
응답 `200`
```json
{ "album": { "id": "alb_1", "name": "김민준", "photoCount": 18 },
  "photos": [ { "id": "pht_10", "url": "...", "thumbnailUrl": "...", "downloadUrl": "..." } ] }
```

#### `GET /share/:token/events/:eventId/albums/:albumId/download` — 앨범 일괄 다운로드 · 화면 16
응답 `200` `application/zip` (스트림) 또는
```json
{ "downloadUrl": "https://cdn.cheesemoa.kr/zip/evt_2_alb_1.zip", "expiresAt": "..." }
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
| `GET /groups/:id` · `PATCH /groups/:id` | 05 |
| `POST /groups/join` | 02-1 |
| `GET /groups/:id/invite` | 초대(211:1556) |
| `GET /groups/:id/share` | 05(학부모 공유) |
| `GET /groups/:id/events` | 05 |
| `POST /groups/:id/events` | 06-M |
| `GET /events/:id` · `PATCH /events/:id` | 06-E / 08 |
| `POST /events/:id/photos/presign` (→ S3 직접 PUT) | 06-U |
| `POST /events/:id/analyze` · `GET /events/:id/analysis` | 06-U / 05 |
| `GET /events/:id/review-summary` · `POST /events/:id/publish` | 14 |
| `GET /events/:id/albums` | 08 |
| `GET /albums/:id` · `PATCH /albums/:id` | 09 / 08 |
| `GET /albums/:id/move-suggestions` · `POST /photos/move` | 09-1 |
| `DELETE /photos` | 09 |
| `POST /share/:token/unlock` | 15 진입 전(잠금) |
| `GET /share/:token` | 15-L(공개 이벤트 목록) |
| `GET /share/:token/events/:eventId` | 15(공개 이벤트 앨범) |
| `GET /share/:token/events/:eventId/albums/:albumId` (+ `/download`) | 16 |

---

## 5. FE 개발 메모 (목 데이터)
- 모든 엔드포인트는 MSW 핸들러로 목업 → 위 응답 예시를 픽스처로 사용.
- `/events/:id/analysis`는 목업에서 일정 시간 후 `status`를 `analyzing`→`done`으로 전환(진행률 % 없음, 자동 폴링 없음 — 화면 재진입 시 상태 확인).
- 업로드는 presigned 2-step: 목업에서 `presign`은 가짜 `uploadUrl`을 반환하고, FE의 S3 `PUT`은 성공으로 시뮬레이션(실제 S3 미사용), 등록은 즉시 반영으로 간주. **`complete` 엔드포인트는 없음**(실제로는 S3 이벤트가 등록 담당).
- 학부모 공유는 **모임 단위**: 링크/비밀번호는 `GET /groups/:id/share`(멤버 전용)로 조회해 표시. `publish`는 이벤트를 목록에 노출만 시킬 뿐 비밀번호를 만들지 않음.
- 뷰어 목록(`GET /share/:token`)은 `published` 이벤트만 필터해 반환하도록 목업 구성.
- 인증 토큰/뷰어 토큰은 메모리+localStorage 저장(뷰어 토큰은 **모임 공유 token별** 분리).
- 인물 이름은 `personId` 단위 공유 → 목업도 앨범 단위가 아니라 **`personId`별 이름 맵**으로 보관해, rename 시 같은 `personId`의 모든 이벤트 앨범이 함께 바뀌도록 시뮬레이션.
- 사진은 다대다 → 목업 픽스처에서 사진을 `albumIds` 배열로 보유. move는 source 제거+target 추가, delete는 **해당(source) 앨범만 `albumIds`에서 제거**(다른 앨범 유지, `albumIds`가 비면 어떤 앨범에도 안 보임).
