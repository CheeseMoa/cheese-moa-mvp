# API 계약 변경 이력

> 현재 계약의 소스 오브 트루스는 항상 [`api-spec.md`](api-spec.md)다.
> 이 문서는 **계약이 언제·왜 바뀌었는지**를 스토리 단위로 기록한다 — BE 구현 시 의사결정 배경 참고용.
> 새 변경은 맨 위에 추가한다.

---

## CHMO-959 — dev 조회 실응답 회귀 검증 (2026-10-24, 진행 중)

- staging 공개 `/app/config`와 무인증 `/admin/operation-settings`의 실제 본문을 채집했다. 공개 설정 형식과 result 없는 COMMON401 처리를 회귀 검증한다.
- 관리자 로그인·저장·충돌·복원·권한 회수·쓰기 잠금 및 저장 후 공개 설정 일치는 미검증이다. 범위별 증빙과 남은 절차는 [admin-spec의 CHMO-959 기록](admin-spec.md#chmo-959-dev-실서버-검증-기록-2026-10-24)에 둔다.

## CHMO-978 — 퀘스트·월 구독 운영 설정 FE 연결 (2026-10-24)

- BE CHMO-973의 `quest.enabled`·세 보상과 CHMO-978 PR #347의 `institutionSubscription.offerEnabled`·`purchaseEnabled`를 기존 조회/부분 PATCH/이력/복원에 연결한다. 보상 양의 정수·초대 보상 우위·10,000장 상한, 안내 OFF·구매 ON 거절을 현재 값과 함께 검사한다.
- 현재 정책 기본값 보충과 이력 누락을 구분한다. 옛 이력의 null/누락 정책은 현재 값을 유지하며 FE는 이를 명시한다. 복원 미리보기에서도 고정 가입자 기준일과 누락 정책을 보존한다.
- 소스 규칙·요청·폼 테스트와 로컬 목 브라우저 검증이다. 실 BE 저장·보상 지급·APP 및 Sandbox는 별도이며 운영 판매를 활성화하지 않았다.

## CHMO-957 — 운영 설정 (2026-10-19 · BE CHMO-958 PR #329)

- 관리자 설정 조회·부분 변경·revision 충돌 감지·변경 사유·감사 이력·BEFORE/AFTER 복원 계약을 연결했다. 앱용 `/app/config`의 기존 최상위 JSON은 유지한다.
- 기존 출석 설정 GET/PUT과 날짜별 통계를 재사용한다. PUT에 ETag 기반 `If-Match`와 UTF-8 percent 인코딩 `X-Change-Reason`을 전달한다.
- 차감 시작일과 고정 가입자 기준일을 구분하고, 기간은 ISO Duration으로 교환한다. APP 호환 후속 전 일일 지급량·적립 상한 편집/해당 값 복원은 제한한다.
- 초기 구현은 CHMO-934 대기로 FE 쓰기를 잠갔으나, 2026-10-19 사용자 변경 지시에 따라 그 잠금을 제거했다. 보안 강화는 후속으로 두고 기존 관리자 세션의 저장·복원 기능을 제공한다. 서버의 권한/쓰기 잠금 응답과 revision 검증은 유지한다.
- 상세 계약은 [api-spec 운영 설정](api-spec.md#운영-설정--관리자-계약-chmo-957--be-chmo-958), 화면·제한은 [admin-spec §3-10](admin-spec.md#3-10-운영-설정-chmo-957--be-chmo-958).

---

## CHMO-117 — 학부모 뷰어 (2026-07-08 · [PR #19](https://github.com/CheeseMoa/cheese-moa-mvp/pull/19))

### 1. `ViewerEvent` / `ViewerAlbum`에 `coverThumbnailUrl` 추가 (additive)

| | |
|---|---|
| 대상 | `GET /share/:token` (15-L) · `GET /share/:token/events/:eventId` (15) 응답 |
| 변경 | `coverThumbnailUrl: string \| null` 필드 추가 (**파생값**) |
| 하위 호환 | ✅ 필드 추가만 — 기존 소비자 영향 없음 |

```json
{ "id": "evt_2", "coverPhotoId": "pht_99", "coverThumbnailUrl": "https://cdn.cheesemoa.kr/p/pht_99_thumb.jpg" }
```

- **왜**: 15-L 이벤트 카드·15 앨범 카드에 커버 썸네일이 필요한데, FE는 `coverPhotoId`(id)만으로 URL을 조립할 수 없다. 제작자 쪽 `Album.coverThumbnailUrl`(CHMO-114)·`ReviewSummary.previewThumbnailUrls`(CHMO-116)와 같은 "서버가 완성 URL을 내려준다" 선례를 따랐다. (api-spec에 "뷰어에도 후속 도입 예정"으로 예고돼 있던 확장)
- **파생 규칙**: 뷰어 노출 사진(**검토 완료**) 기준. 앨범 커버 사진이 미검토면 첫 번째 검토 완료 사진으로 대체, 노출 사진이 없으면 `null`. 이벤트 커버 = 첫 번째 뷰어 노출 앨범의 커버.
- 구현: `src/types/api.ts`(ViewerEvent·ViewerAlbum) · 목 `src/mocks/handlers/serializers.ts`(toViewerEvent·toViewerAlbum) · [api-spec §3.6](api-spec.md)

### 2. 앨범 일괄 다운로드 응답을 JSON 단일로 확정 (계약 축소)

| | |
|---|---|
| 대상 | `GET /share/:token/events/:eventId/albums/:albumId/download` (16) |
| 변경 전 | `200` `application/zip`(스트림) **또는** JSON `{ downloadUrl, expiresAt }` 양자택일 |
| 변경 후 | **JSON `{ downloadUrl, expiresAt }` 하나로 확정** — zip 직접 스트리밍 금지 |
| 하위 호환 | BE 미구현 단계의 계약 확정이라 실질 영향 없음 |

```json
{ "downloadUrl": "https://cdn.cheesemoa.kr/zip/evt_2_alb_1.zip", "expiresAt": "..." }
```

- **왜**: ① 코드리뷰에서 FE가 JSON만 처리해 스트림 변형이 오면 오작동함을 확인 — 두 갈래 계약을 코드가 아니라 계약 쪽에서 좁힘. ② 업로드가 presigned S3 직접 PUT인 것과 동일한 "**서명된 임시 URL → 직접 전송**" 패턴(`expiresAt`이 이미 그 의도). ③ Lambda 서버리스 구조에서 zip 스트리밍은 부담이 크고, FE 공통 fetch 래퍼(`apiFetch`)는 JSON 전용 설계다.
- **BE 구현 시**: zip을 만들어 CDN(또는 S3)에 두고 서명 URL을 발급해 반환한다. 응답 본문으로 zip을 직접 흘려보내지 않는다.

### 3. 15-L 응답 예시 수치 정정 (문서만)

- `GET /share/:token` 예시의 `photoCount: 128, albumCount: 8`(제작자 총계 복사본) → `96, 6`으로 정정.
- **왜**: 같은 절의 규칙("뷰어 카운트·커버는 **검토 완료 사진 기준 파생값**")과 예시가 모순 — 예시를 따라 구현하면 뷰어 카드 숫자와 실제 노출 사진 수가 어긋난다. 계약 자체는 불변, 예시만 규칙에 맞췄다.

### 4. (참고 — 계약 아님, FE 공통 동작) 401 시 뷰어 토큰 자동 삭제

- FE `apiFetch`가 뷰어 토큰을 붙인 요청에서 `401`을 받으면 해당 공유 토큰의 `viewerToken`을 로컬에서 삭제한다 → 뷰어 화면이 잠금 해제 화면으로 복귀(제작자 accessToken 401 처리와 동일 규칙).
- **BE 구현 시**: 무효·만료된 `viewerToken`에는 `401`만 일관되게 응답하면 된다(별도 갱신 엔드포인트 불필요 — 학부모가 비밀번호로 다시 해제).
