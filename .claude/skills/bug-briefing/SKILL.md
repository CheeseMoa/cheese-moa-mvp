---
name: bug-briefing
description: >-
  버그(또는 코드리뷰에서 확정된 결함)를 개발 지식이 깊지 않아도 따라갈 수 있는
  "무슨 코드인지 → 언제 터지는지 → 왜 그렇게 됐는지 → 어떻게 고치는지" 4단 형식으로
  브리핑한다. 각 버그에 코드 위치 링크(file:line)를 걸고, 마지막에 한눈 요약 표를 붙인다.
  사용자가 "버그 브리핑", "버그 설명해줘", "이 버그 뭔지 정리해줘", "리뷰 결과 설명해줘",
  "고친 거 설명해줘"라고 요청하거나, /code-review·/simplify 결과를 사람이 읽을 형태로
  풀어 달라고 할 때 사용.
---

공통 스킬 정본 `.agents/skills/bug-briefing/SKILL.md`를 읽고 따른다.
Claude에서는 `/bug-briefing`, Codex에서는 `$bug-briefing`로 호출한다.
