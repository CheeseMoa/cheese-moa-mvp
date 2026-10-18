---
name: finish-story
description: >-
  현재 스토리 브랜치 작업을 마무리한다 — 커밋·푸시, develop 대상 PR 생성, 테스트 가이드 출력,
  Jira PR 링크 코멘트, develop 머지, 원격·로컬 브랜치 정리, Jira '완료' 전환까지. main 머지는 릴리즈 성격이라
  사용자가 명시 지시할 때만 한다. 사용자가 "/finish-story", "스토리 마무리", "PR 올려"로 요청할 때 사용.
---

공통 스킬 정본 `.agents/skills/finish-story/SKILL.md`를 읽고 따른다.
Claude에서는 `/finish-story`, Codex에서는 `$finish-story`로 호출한다.
