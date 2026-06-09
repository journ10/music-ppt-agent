---
name: primary-music-ppt
description: Use when the user asks to create or modify 小学音乐教学 PPT, music lesson slides, /music-ppt output, textbook-indexed lesson decks, or embedded audio/video PPTX courseware.
---

# Primary Music PPT Generation

Use this skill for小学音乐教学 PPT work.

Rules:

- Treat curriculum and teaching guidance as hidden pedagogy, not student-facing slide copy.
- Use textbook pages and indexed lesson matches as content sources.
- Always load `.pi/presentation/PPT.md` and `.pi/presentation/memory/learned-requirements.md` when generating.
- Keep student-facing slide text short and action-oriented.
- Do not place these terms in student-facing slide titles or instructions: 指导思想, 习近平新时代中国特色社会主义思想, 立德树人, 核心素养, 课程性质, 课程理念, 审美感知, 艺术表现, 创意实践, 文化理解, 教学建议, 评价建议, 课程标准.
- Audio and video should be embedded media objects in PPTX unless the user explicitly requests links.
- Every generated deck must include `storyboard.json`, `media-manifest.json`, and a PPTX audit report before final response.
- Write inferred preferences to `memory/learned-requirements.md`; write permanent norms to `PPT.md` only when the user explicitly says it should become a default.
