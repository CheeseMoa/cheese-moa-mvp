# 협업 컨벤션 (Git 전략 · 커밋 메시지)

> 팀 표준. Claude와 팀원 모두 이 문서를 따른다. `CLAUDE.md`는 이 문서를 포인터로 참조한다.
> (`master`는 이 저장소에서 `main`을 가리킨다.)

## 브랜치 전략 (Git Flow)

| 브랜치 | 역할 |
|---|---|
| `main` | 기준 브랜치. 제품을 **배포**하는 브랜치 |
| `develop` | 개발 브랜치. 개발자들이 각자 작업한 기능을 이 브랜치로 Merge |
| `feature/*` | 단위 기능 개발. 완료되면 `develop`에 Merge |
| `release/*` | 배포 전 QA(품질검사)용. `main`으로 보내기 전 검증 |
| `hotfix/*` | `main` 배포 후 버그 발생 시 긴급 수정 |

**흐름**

- **기능**: `develop`에서 `feature/*` 분기 → 완료 후 `develop`로 PR·Merge.
- **배포**: `develop` → `release/*`(QA) → `main` (릴리스 후 `develop`에도 반영).
- **긴급**: `main`에서 `hotfix/*` 분기 → `main`으로 Merge (+ `develop` 반영).
- `main`·`develop`은 **직접 커밋 금지** — 항상 브랜치 → PR로만.

## 커밋 컨벤션

형식: **`[티켓-번호] type: 메세지`**

예: `[CHMO-106] feat: 얼굴 분류 구현`

| type | 용도 |
|---|---|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 수정 (코드 변경 없음) |
| `style` | 코드 포맷팅, 세미콜론 등 스타일 변경 (논리 변경 없음) |
| `refactor` | 리팩토링 (기능 변화 없음) |
| `test` | 테스트 관련 코드 추가/수정 |
| `chore` | 빌드, 패키지 매니저 설정 등 기타 작업 |

- 이 저장소의 티켓 접두어는 `CHMO` (예: `[CHMO-123]`).
