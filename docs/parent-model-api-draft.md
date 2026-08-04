# 학부모 전환 API 계약 초안 (FE 제안)

> `parent-model-proposal.md` §1~7 **확정 사항**을 엔드포인트 계약으로 정리한 초안입니다.
> 경로·필드명은 제안이며 BE 재량입니다(FE는 매퍼가 흡수) — 단 **의미(누가·무엇을·언제)는 협의로 확정된 내용**입니다.
> BE 확정 후 이 문서가 MSW 목 선행 구현의 기준이 되고, `api-spec.md` 반영은 후속(CHMO-196 방식)으로 합니다.

**공통 규약(기존 그대로)**: 봉투 `{isSuccess, code, message, result}` · 숫자 ID(int64) · 대문자 enum · `/api/v1` 프리픽스 없음.

## 변경 요약

| 구분 | 엔드포인트 |
|---|---|
| 변경 4 | `GET /groups` · `GET /groups/:id` · `GET /groups/:id/events` · `POST /groups/join` · `GET /groups/:id/invite` |
| 신설 6 | join-requests 2종 · members · person-parents 2종 · parent-photos 2종 |
| 폐기 6 | `/share/:token` 계열 4종 · `GET /groups/:id/share` · viewerToken 개념 |

---

## 0. 승인제는 role 무관 (BE 확정 — CHMO-475, 2026-07-28)

초안 §1은 "합류는 승인제"를 학부모 기준으로 썼지만, BE가 **선생님 키 합류도 PENDING 신청으로 통일**했다.
joinKey는 "누가 신청할 수 있나(=어떤 role로)"만 정하고, "누가 들어오나"는 그 모임의 ACTIVE 선생님이 승인으로 정한다.

- 새 엔드포인트·새 상태값 없음 — 기존 승인 API(§3)를 role만 섞어서 그대로 쓴다.
- **모임 생성자만 예외** — `POST /groups`는 종전대로 즉시 TEACHER/ACTIVE(승인해 줄 사람이 필요하다).
- 승인 전 모임 API(상세·이벤트·앨범) 접근은 전부 **`SPACE403`(NOT_SPACE_MEMBER)** — §1의 "BE 재량" 표기를 이 값으로 확정한다.
- 멤버 수 집계는 종전대로 ACTIVE 기준이라 대기 중인 선생님은 세지 않는다.

## 1. 모임 목록·상세 (변경)

### GET /groups — 항목에 `myMembership` 추가
- **PENDING인 모임도 목록에 포함**한다(홈 비활성 카드용). PENDING 사용자는 이 응답 하나로 끝 — 다른 모임 API를 호출하지 않는다.
- **승인 대기 항목은 `memberCount` 생략 + `eventCount` 0**(role 무관 — BE 완료 공지 2026-07-28). 멤버 수는 승인 전 정보 노출 0 원칙이고, 이벤트 수 0은 사실 그대로다. FE는 대기 카드에서 카운트 줄 자체를 그리지 않는다 — 선생님 신청은 자녀 이름조차 없어(`claimedChildNames` 빈 배열) 카운트로 폴백하면 "이벤트 0개"가 빈 모임처럼 읽힌다.

```jsonc
// GroupSummaryResponse 항목 (추가 필드만)
{
  "groupId": 1,
  "name": "햇살반",
  "myMembership": {
    "role": "PARENT",             // TEACHER | PARENT
    "status": "PENDING",          // PENDING | ACTIVE
    "claimedChildNames": ["김민준"], // 신청 원문 — 홈 카드 "신청: 김민준" 표기용. TEACHER는 생략 가능
    "linkedChildNames": ["김민준"]  // ⚠ CHMO-448 FE 추가 제안(BE 미협의) — §4 매핑에서 파생한 연결 인물 이름
  }
}
```

- **`linkedChildNames`(CHMO-448 추가 제안 — §1~7 확정 밖, BE 협의 필요)**: 학부모 화면(18·19) 헤더의
  "학부모 · {자녀명}" 원천. 매핑 조회(`/members`)가 TEACHER 전용(§4)이라 학부모 본인은 연결 인물명을
  알 방법이 없어 목록 응답에 싣는다. 미연결·PENDING은 빈 배열, TEACHER는 생략 가능(FE 매퍼가 빈 배열 정규화).

### GET /groups/:id — ACTIVE 멤버 전용 · 카운트 분리 (§7-3)
- `memberCount` 대신 **`teacherCount` / `parentCount` 분리**(과도기 병행 후 제거 제안). 헤더 표기: "선생님 3 · 학부모 12".
- **PARENT 호출 시 멤버 관련 필드(카운트·명단)는 생략** — 학부모에게 멤버 정보 일절 미노출.
- PENDING 접근은 거부 — **`SPACE403`(NOT_SPACE_MEMBER) 확정**(CHMO-475 AC2). FE는 `errors.ts`에서 `PENDING_APPROVAL`로 정규화하고, 재시도 대신 홈 복귀 CTA로 받는다(ROLE403 = 기다려도 안 열림과 구분).

### GET /groups/:id/events — PARENT엔 published + 아이 등장 이벤트만
- PARENT 호출 시 **published 이벤트만 서버 필터**(뷰어 필터 로직 이관 — Q4 확정). TEACHER는 기존 그대로.
- **⚠ CHMO-448 강화 제안(BE 미협의 — Q4 확정을 좁힘)**: published에 더해 **매핑된 인물의 노출 사진이
  1장 이상인 이벤트만** 노출한다. 매핑은 인물 앨범 단위 권한이므로 아이가 안 나온 이벤트는
  (공통 사진이 있어도) 통째로 은닉하고, **미연결(매핑 0건) 학부모에겐 이벤트가 0개**다.
  이벤트 딥링크(parent-photos §5)도 같은 판정으로 404 은닉 — 목록·상세가 한 규칙을 탄다.

## 2. 초대 (변경 — Q2·Q3 확정)

### GET /groups/:id/invite — TEACHER 전용, 2종 반환
- PARENT 호출 시 **ROLE403** (Q3).
- 학부모용 비밀번호는 **기존 sharePassword 재사용** (Q2).
- `joinUrl`은 FE가 경로형(`/join/:joinKey`)으로 파생하므로(CHMO-237) 응답에서 빼도 된다.

```jsonc
{
  "teacher": { "joinKey": "HAETSAL-T", "password": "482AVX" },
  "parent":  { "joinKey": "HAETSAL-P", "password": "7421" }   // 기존 sharePassword
}
```
- 기존 `/invite`(선생님)·`/share`(학부모 공유) 2엔드포인트를 유지·의미변경해도 무방(BE 재량) — FE 제안은 통합 1개(초대 시트 하나에서 사용).

## 3. 합류 신청·승인 (§1·7-2 확정)

### POST /groups/join — 즉시 합류 → **신청(PENDING) 생성**으로 변경
- role은 joinKey 종류에서 파생(링크 2종 — 역할 선택 화면 없음, Q6). **선생님 키도 PENDING**(§0 — CHMO-475).
- `childNames`: 학부모 joinKey일 때 필수(1개 이상, 자유 텍스트). 시도 제한은 기존 리미터 재사용(Q2).
- `childConsentVersion`: 학부모 joinKey일 때 필수(**확정 — BE CHMO-586·FE CHMO-587**): 자녀 정보 처리 동의(`GUARDIAN_CHILD_CONSENT`)의 버전. `GET /agreements` `currentVersion` 에코이며 누락·구버전은 `VALID400`(신청째 거부). 선생님 키 경로는 무변경.

```jsonc
// req
{ "joinKey": "HAETSAL-P", "password": "7421", "childNames": ["김민준"], "childConsentVersion": "1.0" }
// res
{ "groupId": 1, "groupName": "햇살반", "role": "PARENT", "status": "PENDING" }
```

### GET /groups/:id/join-requests?status=PENDING — 신설, TEACHER 전용
- **PARENT·TEACHER 신청이 섞여서 온다**(§0) — `role`로 구분한다. 선생님 신청은 `childNames`가 빈 배열(BE는 생략 가능 — FE 매퍼가 빈 배열 정규화).
```jsonc
[{ "joinRequestId": 10, "userId": 55, "nickname": "치즈냥이88",
   "role": "PARENT", "childNames": ["김민준"], "createdAt": "..." },
 { "joinRequestId": 11, "userId": 58, "nickname": "신입쌤",
   "role": "TEACHER", "childNames": [], "createdAt": "..." }]
```

### PATCH /join-requests/:id — 신설, TEACHER 전용
- **`personId` 없음** — 승인은 멤버 확정만, 인물 연결은 §4의 별도 API (승인·매핑 분리 확정).
```jsonc
{ "status": "APPROVED" }   // APPROVED | REJECTED
```

## 4. 멤버·인물 매핑 (신설, TEACHER 전용 — §2·7-1 확정)

### GET /groups/:id/members — 초대 관리 데이터 소스
- `childNames` = 신청 원문(**연결 전까지 보존** — 연결·재연결 때 선생님이 참조).
```jsonc
[{ "userId": 55, "nickname": "민준아빠", "role": "PARENT",
   "childNames": ["김민준"],
   "mappings": [{ "personId": 7, "personName": "김민준" }] }]
```

### POST / DELETE /groups/:id/person-parents
```jsonc
{ "userId": 55, "personId": 7 }
```
- 다대다 허용(다자녀·부모 2인).
- **인물 병합·소멸 정책(§7-1 — 2단 방어)**:
  - (예방 — AI 파이프라인) 매핑된 인물은 병합 시 남기는 쪽으로 흡수 · 양쪽 매핑이면 자동 병합 보류 · 자동 삭제 금지
  - (안전망) 그래도 소멸하면 매핑 **자동 해제만**(자동 승계·재매핑 금지) → 미연결(매핑 0건)로 회귀, 새 상태 없음

## 5. 학부모 사진 조회 (신설, PARENT 전용 — §3·Q1 확정, 뷰어 로직 이관)

### GET /events/:id/parent-photos
- 조건: 호출자가 해당 모임의 **ACTIVE PARENT** + **아이 등장 이벤트**(⚠ §1 강화 제안과 동일 판정 —
  published이면서 매핑 인물의 노출 사진 1장 이상, 아니면 404 은닉. 미연결이면 항상 404).
- 범위: **매핑된 인물의 사진 + COMMON**(Q1), **published만**, UNCERTAIN 등 특수 앨범 제외. 플랫 배열(앨범 계층 없음).
- 검토(reviewed)·발행 대기 등 제작자 필드는 응답에 싣지 않는다.
```jsonc
{ "eventId": 3, "eventName": "여름 운동회",
  "photos": [{ "photoId": 301, "thumbnailUrl": "...", "url": "..." }] }
```

### GET /events/:id/parent-photos/download
- 같은 범위의 이벤트 단위 zip — 기존 앨범 zip 응답(AlbumDownloadResponse) 형태 재사용.

## 6. 에러 코드 (Q5 확정)
- **ROLE403 신설**: 멤버지만 role 부족(예: PARENT가 업로드·검수·설정·초대 조회 호출). 멤버십 없음(SPACE403)과 구분 — FE `errors.ts`에 매핑 추가.
- 학부모가 못 하는 것 전부 **서버 403 강제**(업로드·분류·검토·공개·설정·삭제·초대·매핑) — FE 버튼 숨김은 보조.

## 7. 폐기 (FE 학부모 화면 전환 후 — 시점 조율)
- `POST /share/:token/unlock` · `GET /share/:token` · `GET /share/:token/events/:eventId` · `GET …/albums/:albumId`(+`/download`)
- `GET /groups/:id/share` (학부모 공유 시트 폐기 — sharePassword는 합류용으로 존속)
- viewerToken 개념 전체.

## 8. 동의 (자녀 정보 처리 동의 1건 확정 — 나머지는 법률 확정 대기)
- **자녀 정보 처리 동의는 확정됐다**(BE CHMO-586·FE CHMO-587) — 예상하던 `consents` 배열 대신 합류 신청 body의 **`childConsentVersion` 단일 필드**(§3). BE는 `AgreementType.GUARDIAN_CHILD_CONSENT`(GROUP 스코프, `GET /agreements` 카탈로그에 노출·`agreed`는 모임 단위라 항상 false)로 `UserAgreement`(spaceId=그 모임) 행을 남긴다: 기록 시점은 **신청 시**(승인 전 — 동의 의사표시 시각 기준)·append-only(거절돼도 행은 남는다)·같은 상태 재신청은 멱등(행이 늘지 않는다).
- 그 외 항목(공통 사진 제3자 제공 등 — 법률 확정 대기, app-copy.md §7 `[[검토필요]]`)은 확정 시 별도 협의.

---

## FE 후속 계획
1. BE 확정 회신 → 본 문서 고정 → MSW 목을 이 계약대로 선행 구현(스위치 양쪽 동일 계약 — CHMO-195 원칙)
2. `errors.ts` ROLE403 매핑 · 미채집 에러 코드는 `// BE 코드 미확인` 주석 원칙 유지
3. 실 BE 배포 후 실연동 검증(에러 코드 실서버 채집 → 목 반영)
