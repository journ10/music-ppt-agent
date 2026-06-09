# Presentation Generation

Pi includes a presentation workflow for小学音乐教学 PPT generation. The dedicated `music-ppt` CLI can run the
same pipeline without entering Pi interactive mode.

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

Place music textbook PDFs in `.pi/presentation/textbooks/`, then run `/ppt-index rebuild` or `music-ppt index rebuild`.

## Standalone CLI

Use the dedicated CLI when validating the PPT pipeline directly. From this source checkout, prefix commands with
`npm run music-ppt --`; after package build or install, use `music-ppt` directly.

```bash
music-ppt init
music-ppt sources add guidance /path/to/guidance.pdf --id guidance-2022 --title "指导思想"
music-ppt sources add textbook /path/to/textbook.pdf --id yue-grade1-volume2 --title "粤教版一年级下册" --publisher "粤教版" --grade "一年级" --volume "下册"
music-ppt sources status
music-ppt guidance rebuild
music-ppt index rebuild
music-ppt index inspect "温暖的家"
music-ppt config set ppt-master /path/to/ppt-master/skills/ppt-master/scripts/svg_to_pptx.py
music-ppt doctor
music-ppt plan "做一年级下册《温暖的家》的教学PPT"
music-ppt svg "做一年级下册《温暖的家》的教学PPT"
music-ppt pptx "做一年级下册《温暖的家》的教学PPT"
music-ppt pptx "做一年级下册《温暖的家》的教学PPT" --rebuild --audit --review
music-ppt pptx "做一年级下册《温暖的家》的教学PPT" --audit
music-ppt pptx "做一年级下册《温暖的家》的教学PPT" --review
music-ppt audit .pi/presentation/projects/<project-id>/exports/<project-id>.pptx
music-ppt review .pi/presentation/projects/<project-id>/exports/<project-id>.pptx
```

For PPT Master SVG export, either save the script path once with `music-ppt config set ppt-master`, or set:

```bash
export PI_PRESENTATION_SVG_TO_PPTX_SCRIPT=/path/to/ppt-master/skills/ppt-master/scripts/svg_to_pptx.py
```

The saved CLI configuration lives in `.pi/presentation/config.json`.

`music-ppt <lesson request>` is shorthand for `music-ppt pptx <lesson request>`.
`music-ppt pptx <request> --rebuild` refreshes guidance and textbook indexes from registered sources before export.
`music-ppt pptx <request> --audit` exports the deck and immediately writes OOXML package QA reports.
`music-ppt audit <pptx>` runs that structural package audit later for an existing PPTX.
`music-ppt pptx <request> --review` exports the deck and immediately renders visual QA artifacts. `music-ppt
review <pptx>` runs that review later for an existing PPTX when LibreOffice, `pdftoppm`, Python, and Pillow are
available. The CLI checks PATH plus common macOS locations such as `/Applications/LibreOffice.app` and
`/opt/homebrew/bin/pdftoppm`.
`music-ppt doctor` reports those dependencies separately from core PPTX generation readiness.

## Commands

- `/ppt-init` initializes `.pi/presentation`.
- `/ppt-index status` shows indexed textbook count.
- `/ppt-index rebuild` hashes textbook PDFs and writes deterministic page and lesson indexes.
- `/ppt-index inspect <lesson>` resolves a lesson against indexed textbooks.
- `/music-ppt plan <request>` writes lesson context and storyboard artifacts.
- `/music-ppt svg <request>` writes a PPT Master-style SVG project with textbook page assets.
- `/music-ppt pptx-svg <request>` exports that SVG project through PPT Master's native PPTX adapter.
- `/music-ppt <request>` creates the TypeScript OOXML PPTX project with embedded media support.

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
- `presentation_plan_music_deck`
- `presentation_render_svg_project`
- `presentation_export_svg_pptx`
- `presentation_audit_pptx`
- `presentation_remember_requirement`

## Skill Rules

The `primary-music-ppt` skill keeps curriculum language out of student-facing slide text, treats textbook pages as source content, and requires media manifests plus PPTX audit output for generated decks.
