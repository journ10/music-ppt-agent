# Presentation Generation

Pi includes a presentation workflow for小学音乐教学 PPT generation.

## Project Layout

Run `/ppt-init` from a trusted project to create:

```text
.pi/presentation/
  PPT.md
  curriculum/
  textbooks/
  index/
  memory/
  projects/
```

Place music textbook PDFs in `.pi/presentation/textbooks/`, then run `/ppt-index rebuild`.

## Commands

- `/ppt-init` initializes `.pi/presentation`.
- `/ppt-index status` shows indexed textbook count.
- `/ppt-index rebuild` hashes textbook PDFs and writes deterministic page and lesson indexes.
- `/ppt-index inspect <lesson>` resolves a lesson against indexed textbooks.
- `/music-ppt <request>` creates a deterministic PPTX project from an indexed lesson request.

Generated projects are written under `.pi/presentation/projects/<project-id>/` with:

- `lesson-plan.md`
- `storyboard.json`
- `media-manifest.json`
- `qa-report.json`
- `qa-report.md`
- `exports/<project-id>.pptx`

## Tools

The built-in presentation extension registers:

- `presentation_init`
- `presentation_index_status`
- `presentation_index_rebuild`
- `presentation_resolve_lesson`
- `presentation_generate_music_deck`
- `presentation_audit_pptx`
- `presentation_remember_requirement`

## Skill Rules

The `primary-music-ppt` skill keeps curriculum language out of student-facing slide text, treats textbook pages as source content, and requires media manifests plus PPTX audit output for generated decks.
