# Pi Primary Music PPT Agent Development Plan

> **For agentic workers:** Start from this document in a clean folder. The target is a TypeScript-native presentation subsystem integrated into `earendil-works/pi`, focused first on小学音乐教学 PPT. Implement task-by-task, with tests at each layer before wiring the full agent flow.

**Goal:** Build a Pi-integrated agent that can generate editable PowerPoint decks for小学音乐教学 from a short user request, automatically using curriculum guidance, indexed textbook PDFs, persistent PPT requirements, and embedded audio/video objects inside PPTX.

**Architecture:** Add a new workspace package, `@earendil-works/pi-presentation`, that owns project context, textbook indexing, lesson resolution, slide/storyboard models, PPTX OOXML export, and embedded media support. `@earendil-works/pi-coding-agent` only exposes commands, tools, and skills that call this package. `ppt-master` is a behavior reference, not a runtime dependency.

**Tech Stack:** TypeScript, Node.js `>=22.19.0`, Pi monorepo workspaces, Vitest, OOXML/PPTX ZIP generation, PDF text extraction, deterministic JSON indexes, project-local `.pi/presentation` configuration.

---

## 1. Starting From An Empty Folder

Use this when the next session begins with no repo checked out.

```bash
mkdir pi-primary-music-ppt
cd pi-primary-music-ppt
git clone https://github.com/earendil-works/pi.git
cd pi
npm install --ignore-scripts
```

Create a feature branch before edits:

```bash
git switch -c feat/primary-music-ppt-agent
```

Pi's repo rules matter:

- Use pinned exact dependency versions when adding direct dependencies.
- Do not run `npm test` or `npm run build` unless explicitly needed.
- After code changes, run `npm run check`.
- For targeted tests, run package-specific Vitest commands.
- Do not put this feature directly into `packages/coding-agent` unless it is only the integration surface.

## 2. Product Scope

The first version supports:

- `/ppt-init`: initialize `.pi/presentation`, create `PPT.md`, scan textbook PDFs, and build a reusable index.
- One-shot generation from natural language, such as `做三年级上册《小雨沙沙》的教学PPT`.
- Automatic loading of curriculum/teaching guidance as hidden instructional context.
- Automatic loading of `PPT.md` and learned requirements.
- Textbook lookup from a dedicated PDF folder without re-scanning all PDFs every task.
- Editable PPTX output with shapes, text, images, score/page crops, speaker notes, and embedded music/video objects.
- Media QA that proves audio/video are embedded in the PPTX package rather than left as fragile external links.

The first version does not need:

- Full `ppt-master` feature parity.
- DOCX/PPTX template-fill.
- Full animation authoring.
- TTS narration.
- Exporting the deck to MP4.
- Complex cross-slide background music.

## 3. Repository Structure

Create this package inside the Pi monorepo:

```text
packages/presentation/
  package.json
  tsconfig.json
  src/
    index.ts
    project/
      presentation-config.ts
      presentation-init.ts
      ppt-requirements.ts
      requirements-memory.ts
    curriculum/
      curriculum-loader.ts
      forbidden-slide-terms.ts
    textbooks/
      textbook-indexer.ts
      textbook-resolver.ts
      pdf-text-extractor.ts
      textbook-types.ts
    lesson/
      lesson-request.ts
      lesson-context-builder.ts
      music-lesson-schema.ts
    storyboard/
      slide-spec.ts
      storyboard-builder.ts
    media/
      media-types.ts
      media-prober.ts
      media-manifest.ts
      media-embedder.ts
    ooxml/
      pptx-package.ts
      content-types.ts
      relationships.ts
      slide-writer.ts
      media-writer.ts
    qa/
      pptx-audit.ts
      slide-text-audit.ts
      media-audit.ts
    test-fixtures/
      sample-project/
  test/
    project/
    curriculum/
    textbooks/
    media/
    ooxml/
    qa/
```

Modify Pi integration later:

```text
packages/coding-agent/
  src/
    core/...
    extensions or resource registration area...
  docs/
    presentation.md
```

If Pi's current extension discovery does not expose a built-in place for bundled commands, implement the presentation agent first as a project-local Pi package under `.pi/extensions` during development, then fold it into `packages/coding-agent` after the API boundary is stable.

## 4. Project-Local Data Layout

`/ppt-init` creates this layout in the user's project:

```text
.pi/presentation/
  PPT.md
  curriculum/
    primary-music-curriculum.md
    teaching-guidance.md
  textbooks/
    put-textbook-pdfs-here.md
  index/
    textbooks.index.json
    pages/
      <book-id>.pages.json
    units/
      <book-id>.units.json
  memory/
    learned-requirements.md
  templates/
    primary-music-default/
  projects/
    <generated-project-id>/
      project.json
      lesson-plan.md
      storyboard.json
      media-manifest.json
      exports/
```

`PPT.md` is a stable, user-editable requirements file. It is similar to `CLAUDE.md`, but only for presentation generation.

Default `PPT.md` content:

```markdown
# PPT Requirements

## Scope
用于小学音乐教学 PPT。

## Content Rules
- 课标和教学指导只用于教学设计，不直接出现在学生可见页面。
- 学生页文字短、活动导向、适合投影。
- 每页围绕一个明确课堂动作：听、唱、拍、动、看、想、说、创、评。

## Media Rules
- 音乐课件优先嵌入本地音频，不只放链接。
- 视频必须有封面图。
- 音频和视频必须作为 PPTX 内嵌媒体对象，除非用户明确要求外链。
- 音频按钮需标注用途：原唱、伴奏、听辨片段、律动示范。

## Output
- 生成可编辑 PPTX。
- 同时输出教学设计、素材清单、媒体清单和质量检查报告。
```

`learned-requirements.md` stores inferred preferences. It should not silently rewrite `PPT.md`.

Default `learned-requirements.md` content:

```markdown
# Learned PPT Requirements

## Stable Preferences

## Provisional Observations
```

Promotion rule:

- If the user says "以后都这样", "加入规范", "作为默认要求", write to `PPT.md`.
- If the agent infers a preference from conversation, write to `learned-requirements.md` under `Provisional Observations`.
- Each generation task loads both files, but `PPT.md` has higher priority.

## 5. Curriculum Guidance Rules

Curriculum and teaching guidance are always loaded for PPT tasks, but they are not content sources. They guide pedagogy, lesson objectives, classroom rhythm, activity design, and QA.

Forbidden student-facing slide terms:

```ts
export const FORBIDDEN_STUDENT_SLIDE_TERMS = [
  "指导思想",
  "习近平新时代中国特色社会主义思想",
  "立德树人",
  "核心素养",
  "课程性质",
  "课程理念",
  "审美感知",
  "艺术表现",
  "创意实践",
  "文化理解",
  "教学建议",
  "评价建议",
  "课程标准",
] as const;
```

Allowed places for these ideas:

- Internal lesson planning.
- Teacher notes.
- QA report.
- Rationale sections not shown on student slides.

Disallowed places:

- Slide titles.
- Student instructions.
- Student-facing cards.
- Cover/subtitle/footer text.

## 6. Textbook Indexing

`/ppt-init` and `/ppt-index rebuild` generate stable indexes so future tasks do not rescan large PDF files.

Book-level schema:

```ts
export type TextbookIndex = {
  version: 1;
  books: TextbookBookIndex[];
  generatedAt: string;
};

export type TextbookBookIndex = {
  bookId: string;
  title: string;
  subject: "music";
  publisher?: string;
  grade?: string;
  volume?: "上册" | "下册";
  filePath: string;
  fileHash: string;
  pageCount: number;
  unitsIndexPath: string;
  pagesIndexPath: string;
};
```

Page-level schema:

```ts
export type TextbookPageIndex = {
  pageNumber: number;
  text: string;
  headings: string[];
  detectedSongs: string[];
  detectedActivities: string[];
  hasScore: boolean;
  hasLyrics: boolean;
  hasImage: boolean;
};
```

Unit/lesson schema:

```ts
export type TextbookLessonIndex = {
  lessonId: string;
  unitTitle?: string;
  lessonTitle: string;
  pageStart: number;
  pageEnd: number;
  songs: string[];
  activities: string[];
  confidence: "high" | "medium" | "low";
};
```

Indexing rules:

- Hash each PDF. If the hash is unchanged, skip re-indexing.
- Save page text and lesson ranges, not full rendered page images by default.
- Extract page images or score crops only when a generation task needs them.
- If a lesson match is ambiguous, surface the top matches and ask once.

Commands:

```text
/ppt-init
/ppt-index status
/ppt-index rebuild
/ppt-index add <pdf-path>
/ppt-index inspect <课题名>
```

Expected `inspect` output:

```text
匹配到：
- 人音版 三年级上册，第2单元，《小雨沙沙》，第18-21页
- 包含：歌曲谱例、歌词、节奏练习、聆听活动
```

## 7. Generation Pipeline

User prompt:

```text
做三年级上册《小雨沙沙》的教学PPT
```

Pipeline:

```text
1. Detect presentation task.
2. Load `.pi/presentation/PPT.md`.
3. Load `.pi/presentation/memory/learned-requirements.md`.
4. Load `.pi/presentation/curriculum/*` as hidden teaching guidance.
5. Read `textbooks.index.json`.
6. Resolve grade, volume, publisher, lesson title, and page range.
7. Load only relevant page indexes.
8. Read source PDF pages only for selected lesson pages.
9. Build LessonPlan.
10. Build SlideStoryboard.
11. Build MediaManifest.
12. Export editable PPTX.
13. Embed local audio/video media objects.
14. Audit slide text, forbidden terms, package structure, and media relationships.
15. Output PPTX, lesson plan, storyboard, media list, and QA report.
```

## 8. Lesson And Slide Models

Music lesson schema:

```ts
export type MusicLessonPlan = {
  title: string;
  grade?: string;
  volume?: string;
  textbook?: string;
  sourcePages: number[];
  teachingGoals: string[];
  keyPoints: string[];
  difficultPoints: string[];
  classroomFlow: MusicLessonActivity[];
};

export type MusicLessonActivity = {
  phase: "导入" | "聆听" | "演唱" | "律动" | "节奏" | "创编" | "评价" | "总结";
  teacherAction: string;
  studentAction: string;
  mediaCueIds: string[];
};
```

Slide schema:

```ts
export type SlideSpec = {
  slideId: string;
  title: string;
  studentVisibleText: string[];
  teacherNotes: string;
  layout: "cover" | "map" | "song" | "listening" | "activity" | "summary" | "ending";
  assets: SlideAssetRef[];
  media: SlideMedia[];
};

export type SlideAssetRef = {
  assetId: string;
  kind: "textbook-page" | "score-crop" | "image" | "icon";
  role: "main" | "supporting" | "background" | "poster";
};
```

Embedded media schema:

```ts
export type SlideMedia = {
  mediaId: string;
  kind: "audio" | "video";
  sourcePath: string;
  embedMode: "embedded" | "linked";
  startMode: "on-click" | "auto";
  display: "icon" | "poster" | "player" | "hidden";
  label: string;
  posterPath?: string;
  trim?: { startMs: number; endMs?: number };
  loop?: boolean;
  volume?: number;
};
```

MVP media constraints:

- Use `embedded`.
- Use `on-click`.
- Use audio icon for audio.
- Use poster image for video.
- Support `mp3`, `wav`, `m4a`, and `mp4`.
- Warn for unsupported formats instead of silently linking.

## 9. PPTX Embedded Audio And Video

This is not narration. It is a real slide media object.

For each media object, exporter writes:

```text
ppt/media/media<N>.<ext>
ppt/media/poster<N>.png
ppt/slides/slide<N>.xml
ppt/slides/_rels/slide<N>.xml.rels
[Content_Types].xml
```

Audio object:

- Media file is embedded in `ppt/media`.
- Slide shows a clickable icon.
- Slide XML contains an audio file reference.
- `hlinkClick` uses `ppaction://media`.
- Relationships include media and icon image parts.

Video object:

- Media file is embedded in `ppt/media`.
- Slide shows poster frame.
- Slide XML contains a video file reference.
- `hlinkClick` uses `ppaction://media`.
- Relationships include media and poster image parts.

Implementation rule:

- Build golden PPTX fixtures by inserting one audio and one video manually in PowerPoint, then inspect the zip package.
- Write the TypeScript exporter to reproduce the minimal stable OOXML structure.
- The audit must fail if media exists only as an external path.

## 10. QA Requirements

Run QA after every generated deck:

```ts
export type PptxAuditReport = {
  zipValid: boolean;
  slideCount: number;
  forbiddenTerms: Array<{ slideId: string; term: string }>;
  media: Array<{
    mediaId: string;
    kind: "audio" | "video";
    embedded: boolean;
    contentTypePresent: boolean;
    relationshipPresent: boolean;
    visualPlaceholderPresent: boolean;
  }>;
  errors: string[];
  warnings: string[];
};
```

Pass conditions:

- Zip opens.
- Expected slide count exists.
- No forbidden curriculum terms appear in student-visible slide text.
- Every declared embedded audio/video has a `ppt/media/*` part.
- Every media object has a slide relationship.
- Every media object has a visible icon/poster unless `display: "hidden"`.
- Generated `media-manifest.json` matches the package audit.

## 11. Pi Agent Integration

Expose these tools to the agent:

```ts
presentation_init
presentation_index_status
presentation_index_rebuild
presentation_resolve_lesson
presentation_generate_music_deck
presentation_audit_pptx
presentation_remember_requirement
```

Expose these slash commands:

```text
/ppt-init
/ppt-index status
/ppt-index rebuild
/ppt-index inspect <lesson>
/music-ppt <lesson request>
```

Agent behavior:

- If user asks for a PPT and `.pi/presentation` does not exist, recommend `/ppt-init`.
- If `.pi/presentation` exists, load its context automatically.
- If textbook index is stale, ask to rebuild or run incremental indexing when safe.
- At task end, summarize possible new preferences.
- Write inferred preferences to `learned-requirements.md`.
- Write permanent norms to `PPT.md` only when user explicitly asks.

## 12. Implementation Tasks

### Task 1: Scaffold `packages/presentation`

Files:

- Create `packages/presentation/package.json`
- Create `packages/presentation/tsconfig.json`
- Create `packages/presentation/src/index.ts`
- Create `packages/presentation/test/smoke.test.ts`

Acceptance:

- `npm run check` sees the new package without TypeScript errors.
- A package-level smoke test imports `@earendil-works/pi-presentation`.

### Task 2: Add Configuration And Init

Files:

- Create `src/project/presentation-config.ts`
- Create `src/project/presentation-init.ts`
- Create `src/project/ppt-requirements.ts`
- Create `src/project/requirements-memory.ts`
- Test under `test/project/`

Acceptance:

- Init creates the full `.pi/presentation` tree.
- Init is idempotent.
- Existing `PPT.md` is not overwritten.
- Missing `memory/learned-requirements.md` is recreated.

### Task 3: Add Curriculum Loader

Files:

- Create `src/curriculum/curriculum-loader.ts`
- Create `src/curriculum/forbidden-slide-terms.ts`
- Test under `test/curriculum/`

Acceptance:

- Loader reads all Markdown files under `.pi/presentation/curriculum`.
- Missing curriculum folder returns an empty context with a warning.
- Forbidden term scan catches terms in slide text.

### Task 4: Add Textbook Indexer

Files:

- Create `src/textbooks/textbook-types.ts`
- Create `src/textbooks/pdf-text-extractor.ts`
- Create `src/textbooks/textbook-indexer.ts`
- Create `src/textbooks/textbook-resolver.ts`
- Test under `test/textbooks/`

Acceptance:

- Indexer hashes PDF files.
- Unchanged files are skipped.
- Page index JSON is deterministic.
- Resolver can match lesson title against indexed pages.

### Task 5: Add Lesson Context Builder

Files:

- Create `src/lesson/lesson-request.ts`
- Create `src/lesson/lesson-context-builder.ts`
- Create `src/lesson/music-lesson-schema.ts`
- Test under `test/lesson/`

Acceptance:

- Natural language request is normalized into grade, volume, title, and optional publisher.
- Builder combines curriculum, PPT requirements, memory, textbook pages, and source PDF page refs.
- Ambiguous textbook matches are represented explicitly.

### Task 6: Add Storyboard Schema

Files:

- Create `src/storyboard/slide-spec.ts`
- Create `src/storyboard/storyboard-builder.ts`
- Test under `test/storyboard/`

Acceptance:

- Storyboard uses 12-18 slides by default.
- Slides include student-visible text and teacher notes separately.
- Student-visible text does not contain forbidden curriculum terms.

### Task 7: Add PPTX Package Writer

Files:

- Create `src/ooxml/pptx-package.ts`
- Create `src/ooxml/content-types.ts`
- Create `src/ooxml/relationships.ts`
- Create `src/ooxml/slide-writer.ts`
- Test under `test/ooxml/`

Acceptance:

- Writer creates a valid PPTX zip structure.
- Slides, relationships, content types, and presentation metadata exist.
- A minimal two-slide deck can be opened by PowerPoint after manual verification.

### Task 8: Add Embedded Media Writer

Files:

- Create `src/media/media-types.ts`
- Create `src/media/media-prober.ts`
- Create `src/media/media-manifest.ts`
- Create `src/media/media-embedder.ts`
- Create `src/ooxml/media-writer.ts`
- Test under `test/media/`

Acceptance:

- MP3 and MP4 fixtures are embedded into `ppt/media`.
- Slide relationships point to embedded media parts.
- Audio icon and video poster are included.
- Audit fails if media is linked instead of embedded when `embedMode: "embedded"`.

### Task 9: Add Audit Layer

Files:

- Create `src/qa/pptx-audit.ts`
- Create `src/qa/slide-text-audit.ts`
- Create `src/qa/media-audit.ts`
- Test under `test/qa/`

Acceptance:

- Audit reads generated PPTX zip.
- Audit reports forbidden terms.
- Audit validates media package parts and relationships.
- Audit result is serializable to Markdown and JSON.

### Task 10: Wire Pi Commands And Tools

Files:

- Add coding-agent integration files after locating the current extension/tool registration pattern.
- Add docs page `packages/coding-agent/docs/presentation.md`.
- Add a project-local extension prototype first if direct built-in integration is unclear.

Acceptance:

- `/ppt-init` initializes presentation context.
- `/ppt-index inspect <lesson>` returns indexed matches.
- `/music-ppt <request>` starts the generation flow.
- Agent automatically loads curriculum, `PPT.md`, memory, and textbook index for PPT tasks.

### Task 11: Add Primary Music Skill

Files:

- Create a Pi skill for小学音乐 PPT generation.
- Include rules for curriculum-as-guidance, textbook-as-content, media embedding, and PPT.md requirements.

Acceptance:

- Skill loads when user asks for小学音乐 PPT.
- Skill forbids student-facing curriculum jargon.
- Skill requires media manifest and PPTX audit before final answer.

### Task 12: End-To-End Fixture

Files:

- Create a tiny test textbook PDF fixture with one lesson.
- Create one MP3 fixture and one MP4 fixture.
- Create an end-to-end generation test that writes a deck and audits it.

Acceptance:

- Starting from initialized `.pi/presentation`, a lesson request resolves to one lesson.
- A deck is generated.
- Audio and video are embedded.
- Audit passes.

## 13. Verification Commands

Use targeted checks during development:

```bash
npm --prefix packages/presentation test
npm run check
```

If package-level scripts do not exist yet, use the root Vitest binary against specific files:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/project/presentation-init.test.ts
```

Run full Pi checks only after the implementation is wired:

```bash
npm run check
```

## 14. First Session Prompt For The Next Agent

Paste this into the next development session:

```text
请根据 outputs/pi-primary-music-ppt-development-plan.md 从空目录开始开发。

目标：在 earendil-works/pi 中新增 TypeScript-native 的 packages/presentation，并接入 coding-agent，支持小学音乐 PPT 生成、/ppt-init 课本索引、自动加载 curriculum/PPT.md/memory、以及 PPTX 内嵌音频和视频对象。

先执行 Task 1-3：scaffold presentation package、实现 .pi/presentation 初始化、实现 curriculum loader 和 forbidden term scan。每个任务写测试并运行 targeted tests。不要先做完整 PPTX exporter。
```

## 15. Design Decisions To Preserve

- `ppt-master` is a reference workflow, not a runtime dependency.
- Curriculum guidance is hidden teaching guidance, not student-facing slide content.
- Textbook PDFs remain the authoritative source for lesson content.
- `PPT.md` is stable user-authored or user-approved requirements.
- Inferred preferences go to `memory/learned-requirements.md`.
- Audio/video are real embedded PPTX media objects, not narration tracks and not export-to-video.
- Build small vertical slices; do not attempt full `ppt-master` parity in the first implementation pass.
