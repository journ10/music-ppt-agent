export const presentationPackageName = "@earendil-works/pi-presentation";

export type {
	PdfPageRenderer,
	PdfPageRenderOptions,
	PdfPageRenderResult,
} from "./assets/pdf-page-renderer.ts";
export { renderPdfPageToPng } from "./assets/pdf-page-renderer.ts";
export type {
	MaterializeTextbookAssetsOptions,
	TextbookAssetManifest,
	TextbookPageAsset,
} from "./assets/textbook-assets.ts";
export { materializeTextbookAssets } from "./assets/textbook-assets.ts";
export type { MusicPptCliOptions } from "./cli/music-ppt-cli.ts";
export { runMusicPptCli } from "./cli/music-ppt-cli.ts";
export type { CurriculumContext, CurriculumMarkdownFile } from "./curriculum/curriculum-loader.ts";
export { loadCurriculumContext } from "./curriculum/curriculum-loader.ts";
export { DEFAULT_PRIMARY_MUSIC_CURRICULUM, DEFAULT_TEACHING_GUIDANCE } from "./curriculum/default-curriculum.ts";
export type {
	ForbiddenStudentSlideTermMatch,
	StudentSlideText,
} from "./curriculum/forbidden-slide-terms.ts";
export {
	FORBIDDEN_STUDENT_SLIDE_TERMS,
	scanStudentSlideTextForForbiddenTerms,
} from "./curriculum/forbidden-slide-terms.ts";
export type {
	GuidanceConstraint,
	GuidanceConstraintKind,
	GuidanceExtractionOptions,
	GuidanceIndex,
	GuidanceSourceIndex,
} from "./curriculum/guidance-extractor.ts";
export {
	EMPTY_GUIDANCE_INDEX,
	extractGuidanceSources,
	listForbiddenGuidanceSlideTerms,
	loadGuidanceIndex,
	rebuildGuidanceIndex,
} from "./curriculum/guidance-extractor.ts";
export type { MusicLessonContext, SourcePdfPageRef } from "./lesson/lesson-context-builder.ts";
export { buildMusicLessonContext } from "./lesson/lesson-context-builder.ts";
export type { NormalizedMusicLessonRequest } from "./lesson/lesson-request.ts";
export { normalizeMusicLessonRequest } from "./lesson/lesson-request.ts";
export type {
	GeneratedMusicDeck,
	GeneratedMusicDeckFiles,
	GenerateMusicDeckOptions,
	PlanMusicDeckOptions,
	PlannedMusicDeck,
	PlannedMusicDeckFiles,
} from "./lesson/music-deck-generator.ts";
export { generateMusicDeck, planMusicDeck } from "./lesson/music-deck-generator.ts";
export type { MusicLessonActivity, MusicLessonPlan } from "./lesson/music-lesson-schema.ts";
export { writePptxPackageWithMedia } from "./media/media-embedder.ts";
export type { MediaManifest, MediaManifestItem } from "./media/media-manifest.ts";
export { buildMediaManifest } from "./media/media-manifest.ts";
export type { MediaProbeResult } from "./media/media-prober.ts";
export { probeMediaFile } from "./media/media-prober.ts";
export type { SlideMedia } from "./media/media-types.ts";
export type { PptxPackageBuildOptions, PptxPackagePart } from "./ooxml/pptx-package.ts";
export { buildPptxParts, listPptxPackageEntries, readPptxPackageText, writePptxPackage } from "./ooxml/pptx-package.ts";
export { DEFAULT_PPT_REQUIREMENTS } from "./project/ppt-requirements.ts";
export { getPresentationProjectPaths } from "./project/presentation-config.ts";
export type { PresentationInitResult } from "./project/presentation-init.ts";
export { initializePresentationProject } from "./project/presentation-init.ts";
export { DEFAULT_LEARNED_REQUIREMENTS } from "./project/requirements-memory.ts";
export type { PresentationRuntimeConfig } from "./project/runtime-config.ts";
export {
	EMPTY_PRESENTATION_RUNTIME_CONFIG,
	formatPresentationRuntimeConfig,
	readPresentationRuntimeConfig,
	rememberPptMasterExportConfig,
	writePresentationRuntimeConfig,
} from "./project/runtime-config.ts";
export type {
	PresentationSourceEntry,
	PresentationSourceKind,
	PresentationSourceManifest,
	PresentationSourceVolume,
} from "./project/source-manifest.ts";
export {
	EMPTY_PRESENTATION_SOURCE_MANIFEST,
	formatPresentationSourceManifest,
	getEnabledPresentationSources,
	readPresentationSourceManifest,
	resolvePresentationSourcePath,
	writePresentationSourceManifest,
} from "./project/source-manifest.ts";
export type { PptxMediaAuditItem } from "./qa/media-audit.ts";
export { auditMediaParts } from "./qa/media-audit.ts";
export type { PptxAuditOptions, PptxAuditReport } from "./qa/pptx-audit.ts";
export { auditPptxPackage, formatPptxAuditMarkdown } from "./qa/pptx-audit.ts";
export type {
	PptxReviewCommandRunner,
	PptxReviewRenderer,
	PptxReviewReport,
	RenderPptxReviewOptions,
} from "./qa/pptx-review-renderer.ts";
export { renderPptxReview } from "./qa/pptx-review-renderer.ts";
export type { ForbiddenTermFinding } from "./qa/slide-text-audit.ts";
export { auditSlideText } from "./qa/slide-text-audit.ts";
export type { SvgProjectAuditOptions, SvgProjectAuditReport } from "./qa/svg-project-audit.ts";
export { auditSvgProject, formatSvgProjectAuditMarkdown } from "./qa/svg-project-audit.ts";
export type { MusicLessonStoryboard, SlideAssetRef, SlideSpec } from "./storyboard/slide-spec.ts";
export { buildMusicLessonStoryboard } from "./storyboard/storyboard-builder.ts";
export type {
	RenderAndExportMusicDeckOptions,
	RenderedAndExportedMusicDeck,
	SvgPptxExporter,
	SvgPptxExportOptions,
	SvgPptxExportResult,
} from "./svg/svg-pptx-exporter.ts";
export { exportSvgProjectToPptx, renderAndExportMusicDeck } from "./svg/svg-pptx-exporter.ts";
export type {
	RenderedMusicDeckSvgFiles,
	RenderedMusicDeckSvgProject,
	RenderMusicDeckSvgProjectOptions,
} from "./svg/svg-project-renderer.ts";
export { renderMusicDeckSvgProject } from "./svg/svg-project-renderer.ts";
export type { PdfTextExtractor, PdfTextPage } from "./textbooks/pdf-text-extractor.ts";
export { extractPdfTextPages } from "./textbooks/pdf-text-extractor.ts";
export type { TextbookIndexOptions, TextbookIndexResult } from "./textbooks/textbook-indexer.ts";
export { indexTextbooks, slugifyTextbookId } from "./textbooks/textbook-indexer.ts";
export { resolveTextbookLesson } from "./textbooks/textbook-resolver.ts";
export type {
	LessonResolutionRequest,
	ResolvedTextbookLesson,
	TextbookBookIndex,
	TextbookIndex,
	TextbookLessonIndex,
	TextbookLessonResolution,
	TextbookPageIndex,
} from "./textbooks/textbook-types.ts";
