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

### 요청 추적 (X-Request-Id)

BE는 **모든 응답**에 `X-Request-Id`를 싣는다(BE CHMO-493). 서버가 그 요청에 대해 남긴 모든 로그 줄에 같은 값이 붙어 있어, 이 값 하나로 CloudWatch에서 해당 요청을 특정할 수 있다.

- 값: ASCII 영숫자·`-`·`_`, 64자 이내 (2026-07-30 실서버 실측값은 12자 hex — `db0cdc31fb2c`)
- CORS `exposedHeaders`에 등록돼 있어 **교차 출처(`app.` → `api.`)에서도 브라우저가 읽는다**(실측: `access-control-expose-headers: X-Request-Id`)
- 요청 헤더로 보내면 BE가 그 값을 그대로 쓴다(형식을 벗어나면 무시하고 새로 만든다 — 로그 주입 방지). **FE는 보내지 않는다** — 이을 세션 추적 ID가 없어 BE 생성분으로 충분하다
- FE 소비: `client.ts`가 실패 응답에서 읽어 `ApiRequestError.requestId`에 담고, 에러 화면(`ErrorState`)이 `코드 · 추적ID` 한 줄로 노출한다(CHMO-500). 사용자가 캡처해 보내오면 그 줄로 로그를 짚는다

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
> `coverThumbnailUrl`: 커버 사진(`coverPhotoId`) 썸네일 URL(**파생값** — 커버가 없으면 `null`). 08 앨범 그리드 카드 커버용(`coverPhotoId`만으로 URL을 조립할 수 없어 표면화). 뷰어 응답(`ViewerEvent`/`ViewerAlbum`)에도 동일 규칙으로 도입(§3.6 — 커버는 검토 완료 사진 기준).
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
요청 `{ "name": "햇살반", "groupType": "BUSINESS" }` — `groupType`은 `BUSINESS`|`GENERAL`(선택 — 생략 시 BUSINESS), 생성 후 변경 불가(ADR 020).
응답 `201` → `Group`(생성자는 자동 멤버 · `groupType` 포함 — 목록/상세/이름변경 응답도 동일).
오류: `400 VALIDATION_ERROR`.
> **참여 비밀번호는 요청으로 받지 않는다**(BE CHMO-599 — 4자리 PIN 자동 발급, `GET /groups/:id/invite`로만 노출. 구 FE가 보내는 `password`는 무시).

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

> **업로드 = presigned URL 3-step**(CHMO-194). 파일 바이트는 서버를 거치지 않고 **FE→S3로 직접 `PUT`**. 흐름: **① presign(`s3Key` 발급) → ② S3 PUT(직접) → ③ 등록**. ③이 서버에 사진이 생기는 시점이고, **등록이 곧 분석 시작이다**(BE가 `analyzing` 전이 + 분류 발행). FE는 `POST /analyze`를 부르지 않는다 — 부르면 같은 사진이 두 job으로 발행돼 앞 job의 결과가 버려진다.
>
> **재업로드가 가능하다**(2026-08-06 정책 반전 — CHMO-606, BE 소스 대조. 종전 이벤트당 1회는 CHMO-485·486 — 서버 게이트 CHMO-485는 끝내 미구현). presign·등록 어디에도 1회 게이트·분석중 게이트가 없다: 분석 중 등록도 새 job이 이전 job을 대체하고(`assignCurrentJob` 신선도 판정 — CHMO-460), 같은 사진 재업로드는 내용 지문(CRC64NVME)으로 걸러진다(CHMO-254). 진입 차단(분석 중)은 화면(06-U)의 몫이다.

#### `POST /events/:id/photos/presign` — 업로드 URL 발급(①) · 화면 06-U
요청
```json
{ "files": [ { "fileName": "img_001.jpg", "size": 3145728 } ] }
```
응답 `200` — 요청 `files`와 **같은 순서의 bare 배열**
```json
[ { "s3Key": "originals/events/1/3f9a....jpg", "uploadUrl": "https://cheesemoa-uploads.s3.ap-northeast-2.amazonaws.com/originals/events/1/3f9a....jpg?X-Amz-...", "contentType": "image/jpeg" } ]
```
> **사진 레코드는 여기서 생기지 않는다** — 발급되는 건 `s3Key`와 presigned URL(짧은 TTL)뿐이다. `contentType`은 **BE가 파일명 확장자로 정한다**(요청이 MIME을 보내지 않는다) — 화이트리스트 밖 확장자는 `400 PHOTO400`.
> 제약(단일 원천 `src/lib/upload.ts`): 확장자 jpg/jpeg/png/heic/webp · 파일당 20MB · 요청당 **500장**(`MAX_UPLOAD_BATCH` — 2026-07-28 실측, BE CHMO-482). 웹 화면은 별도로 **100장**에서 캡한다(`MAX_UPLOAD_PICK` — 브라우저 디코드 부담, CHMO-497).
> 오류: `400 VALID400`(빈 목록·상한 초과·크기 초과) · `400 PHOTO400`(미지원 확장자) · `428 AGREEMENT428`(보호자 동의 확보 확인 전 — CHMO-514·516).

#### (②) S3 직접 업로드 — **API 아님**
FE가 각 파일을 `uploadUrl`로 직접 `PUT`한다(동시 실행 수 제한·진행률은 FE가 측정). **`Content-Type` 헤더가 presign 응답의 `contentType`과 정확히 같아야 한다** — 서명에 묶여 있어 다르면 `403 SignatureDoesNotMatch`.
> presign만 하고 `PUT` 후 등록하지 않으면 **사진 레코드는 생기지 않는다**(빈 이벤트면 `empty` 그대로). 다만 S3 객체는 DB 기록 없이 남으므로 정리 주체가 필요하다 — **BE CHMO-484**(미등록 원본 정리)에서 다룬다.

#### `POST /events/:id/photos` — 업로드 완료 등록(③) = **분석 시작** · 화면 06-U
요청
```json
{ "s3Keys": ["originals/events/1/3f9a....jpg"], "excludeEyesClosed": true, "excludeBlurry": true }
```
응답 `200` → `{ "jobId": "...", "registeredCount": 42, "duplicateCount": 3 }`. 이벤트 `status`→`analyzing`(**`published`는 무전이** — 공개를 유지한 채 증분 분석, CHMO-216). `duplicateCount`는 같은 이벤트에 이미 있는 동일 사진(내용 지문 일치)이라 제외된 수(CHMO-254) — 재업로드에서만 0보다 클 수 있다.
> 등록이 곧 분류 시작이라 **품질 제외 옵션을 여기서 함께 받는다**(기본 각각 `true`) — ON이면 해당 사진은 인물 앨범 대신 `eyes_closed`/`blurry`로 라우팅.
> 오류: `404 PHOTO404`(S3에 없는 키 — `PUT` 전) · `400 VALID400`(다른 이벤트의 키·빈 목록·상한 초과·**전량 중복** — "모든 사진이 이미 이 이벤트에 있는 사진입니다.").
> 예외 하나: **등록 성공 + 응답 유실** — 서버는 분석을 시작했는데 FE는 실패로 본다. 그대로 재시도하면 전량 중복 `VALID400`으로 굳으므로, FE는 등록 실패 시 이벤트 상세를 되물어 실제로 시작됐으면 에러 대신 진행으로 인계한다(CHMO-486 안전망 존치).

#### 분석 진행률 — `GET /events/:id` 폴링 · 화면 06-U → 08
분석 중 이벤트 상세가 `progress`(`{processed,total,percent}`)를 담는다. 화면이 **2초 간격**으로 폴링해 진행률을 표시하고, 완료되면(`review` 전이) 08 앨범 그리드로 자동 전환한다(CHMO-244·287).
> `progress`는 **분석 job 중에만 non-null**이고 **목록 응답엔 없다**. null이면 인디터미넌트 폴백으로 표시한다 — 등록 직후엔 AI 첫 진행률 메시지 전이라 잠시 null인 공백이 있어, 06-U가 navigate state로 '분석 시작' 킥을 넘겨 상세가 폴링을 켠다(CHMO-443).
> `GET /events/:id/analysis`(`AnalysisJob`)는 계약상 남아 있으나 **화면은 쓰지 않는다** — 진행률이 없고 분석 **실패**를 표현하지 못한다(이벤트를 `EMPTY`로 되돌려 미시작과 구분 불가 — CHMO-218).

#### `GET /events/:id/review-summary` — 공개 전 검수 요약 · 화면 14
응답 `200`
```json
{ "eventId": 1, "eventStatus": "REVIEW", "totalAlbums": 8, "reviewedAlbums": 5, "unreviewedAlbums": 3,
  "totalPhotos": 124, "reviewedPhotoCount": 118, "uncertainCount": 6, "albums": [ /* AlbumSummary[] */ ] }
```
> **미리보기용 썸네일 배열(`previewThumbnailUrls`)은 없다** — 서버는 이벤트의 **앨범 전체**(특수 앨범 포함)를 `albums[]`로 주고, 무엇을 어떻게 보여줄지는 전부 FE 파생이다(14는 08과 같은 앨범 카드 그리드로 그린다 — CHMO-346).
> FE 파생 규칙(CHMO-488): **미리보기 = 전 사진 검토 완료된 인물·공통 앨범 = 발행 대상**이고, 같은 범위의 잔여분이 **공개를 막는 앨범**(14가 이름·남은 장수로 안내)이다. 검토 진척(`reviewedAlbumCount/reviewableAlbumCount`)도 여기서 앨범 단위로 센다 — BE `reviewedAlbums`는 특수 앨범까지 세어 화면과 어긋나므로 **쓰지 않는다**(CHMO-357).
> `totalPhotos`는 특수 앨범을 포함한 **이벤트 총량**이라 공개될 장수가 아니다. 사진이 앨범과 다대다라 앨범별 장수 합으로도 셀 수 없어(겹친 사진 중복) 화면이 `전체 사진`으로 라벨해 범위를 드러낸다 — BE `publishablePhotoCount`(CHMO-505) 배포 후 `공개할 사진`으로 전환한다.

#### `POST /events/:id/publish` — 공개하기 · 화면 14
요청 `{}`
응답 `200`
```json
{ "id": "evt_1", "status": "published", "publishedAt": "..." }
```
> 공개 = 이 이벤트를 **모임 학부모 공유 목록에 노출**(`published`). **이벤트별 공유 링크/비밀번호는 없다** — 학부모 공유는 **모임 단위**(`Group.share` / `GET /groups/:id/share`)이며 모임 생성 시 이미 발급돼 있다.
> 정책(확정 — 2026-07-28 변경, CHMO-487·488): **전량 검토 완료가 하드 게이트**다. 인물·공통 앨범에 미검토 사진이 1장이라도 남으면 **항상** `409 HAS_UNREVIEWED_PHOTOS`고, 종전의 `?force=true` 우회는 **폐기**됐다(쿼리가 와도 무시 — FE 미사용). 게이트 판정 범위가 인물·공통뿐인 이유: 특수 앨범(분류 애매·눈감음·흔들림)엔 검토 UI가 없어(CHMO-357) 포함하면 영영 공개할 수 없는 이벤트가 생긴다. `review`/`ready` 상태에서 공개 가능하며 사진 0장이면 `400`. **재공개(재호출)도 허용된다**(CHMO-606 — 재업로드 복원으로 재도달, BE CHMO-324 로직 존치): `published` 이벤트에 재호출하면 그동안 검토를 마친 발행 대기분(`pendingPublishCount`)이 추가 발행되고 `publishedAt`은 최초 공개 때만 남는다. 게이트는 재공개에도 동일하게 걸린다.

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
    { "id": "evt_2", "name": "봄 소풍", "date": "2026-05-12", "photoCount": 96, "albumCount": 6, "coverPhotoId": "pht_99", "coverThumbnailUrl": "https://cdn.cheesemoa.kr/p/pht_99_thumb.jpg", "publishedAt": "..." }
  ] }
```
> **공개(`published`)된 이벤트만** 반환. 없으면 `events: []`(빈 목록 화면).
> 카운트·커버는 뷰어 노출 사진(검토 완료) 기준 파생값 — `coverThumbnailUrl`은 `Album.coverThumbnailUrl`과 동일 규칙(서버가 완성 URL, 15-L 카드 커버용).

#### `GET /share/:token/events/:eventId` — 공개 이벤트 앨범 · 화면 15
응답 `200`
```json
{ "event": { "id": "evt_2", "name": "봄 소풍" },
  "albums": [
    { "id": "alb_1", "type": "person", "name": "김민준", "photoCount": 18, "coverPhotoId": "pht_10", "coverThumbnailUrl": "https://cdn.cheesemoa.kr/p/pht_10_thumb.jpg" },
    { "id": "alb_common", "type": "common", "name": "공통", "photoCount": 24, "coverPhotoId": "pht_99", "coverThumbnailUrl": "https://cdn.cheesemoa.kr/p/pht_99_thumb.jpg" }
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
응답 `200`
```json
{ "downloadUrl": "https://cdn.cheesemoa.kr/zip/evt_2_alb_1.zip", "expiresAt": "..." }
```
> **JSON(서명된 임시 URL)로 확정**(CHMO-117) — zip 스트림 직접 응답은 쓰지 않는다. 업로드 presign과 같은 "서명 URL → 직접 전송" 패턴이며, FE 공통 fetch 래퍼는 JSON 전용이다.
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
| `POST /events/:id/photos/presign` (→ S3 직접 PUT) · `POST /events/:id/photos`(등록=분석 시작) | 06-U |
| `GET /events/:id`(진행률 폴링) | 06-U → 08 |
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
- 업로드는 presigned **3-step**: 목의 `presign`은 사진을 만들지 않고 `originals/events/{id}/{uuid}.{ext}` 키만 발급하고, 가짜 S3 `PUT`(`/mock-s3/*`)이 업로드 사실을 기록하며, **등록(`POST /events/:id/photos`)이 사진 생성 + 분석 시작**을 맡는다(`PUT` 안 한 키는 `404`). 재업로드도 BE처럼 열려 있다(CHMO-606) — 단 목은 내용 지문이 없어 중복 판정을 생략한다(`duplicateCount` 항상 0).
- 분석은 목에서 일정 시간 후 완료로 전환되고, 그동안 `GET /events/:id`가 `progress`를 채운다(실 BE와 달리 **등록 즉시** progress가 붙는다 — 실서버의 초기 null 공백은 목으로 재현되지 않아 '분석 시작' 킥은 실 BE로만 검증 가능하다, CHMO-443).
- 학부모 공유는 **모임 단위**: 링크/비밀번호는 `GET /groups/:id/share`(멤버 전용)로 조회해 표시. `publish`는 이벤트를 목록에 노출만 시킬 뿐 비밀번호를 만들지 않음.
- 뷰어 목록(`GET /share/:token`)은 `published` 이벤트만 필터해 반환하도록 목업 구성.
- 인증 토큰/뷰어 토큰은 메모리+localStorage 저장(뷰어 토큰은 **모임 공유 token별** 분리).
- 인물 이름은 `personId` 단위 공유 → 목업도 앨범 단위가 아니라 **`personId`별 이름 맵**으로 보관해, rename 시 같은 `personId`의 모든 이벤트 앨범이 함께 바뀌도록 시뮬레이션.
- 사진은 다대다 → 목업 픽스처에서 사진을 `albumIds` 배열로 보유. move는 source 제거+target 추가, delete는 **해당(source) 앨범만 `albumIds`에서 제거**(다른 앨범 유지, `albumIds`가 비면 어떤 앨범에도 안 보임).
