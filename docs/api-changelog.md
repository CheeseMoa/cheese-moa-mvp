# API 계약 변경 이력

> 현재 계약의 소스 오브 트루스는 항상 [`api-spec.md`](api-spec.md)다.
> 이 문서는 **계약이 언제·왜 바뀌었는지**를 스토리 단위로 기록한다 — BE 구현 시 의사결정 배경 참고용.
> 새 변경은 맨 위에 추가한다.

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
