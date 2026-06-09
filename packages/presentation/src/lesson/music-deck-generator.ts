import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writePptxPackageWithMedia } from "../media/media-embedder.ts";
import { buildMediaManifest, type MediaManifest } from "../media/media-manifest.ts";
import type { SlideMedia } from "../media/media-types.ts";
import { writePptxPackage } from "../ooxml/pptx-package.ts";
import { auditPptxPackage, formatPptxAuditMarkdown, type PptxAuditReport } from "../qa/pptx-audit.ts";
import type { MusicLessonStoryboard } from "../storyboard/slide-spec.ts";
import { buildMusicLessonStoryboard } from "../storyboard/storyboard-builder.ts";
import { slugifyTextbookId } from "../textbooks/textbook-indexer.ts";
import { buildMusicLessonContext, type MusicLessonContext } from "./lesson-context-builder.ts";

export type GenerateMusicDeckOptions = {
	media?: SlideMedia[];
	projectId?: string;
};

export type PlanMusicDeckOptions = {
	projectId?: string;
};

export type PlannedMusicDeckFiles = {
	projectDir: string;
	lessonContextPath: string;
	lessonPlanPath: string;
	storyboardPath: string;
	planReportPath: string;
};

export type GeneratedMusicDeckFiles = {
	projectDir: string;
	pptxPath: string;
	lessonPlanPath: string;
	storyboardPath: string;
	mediaManifestPath: string;
	auditJsonPath: string;
	auditMarkdownPath: string;
};

export type PlannedMusicDeck = {
	projectId: string;
	context: MusicLessonContext;
	storyboard: MusicLessonStoryboard;
	files: PlannedMusicDeckFiles;
};

export type GeneratedMusicDeck = {
	projectId: string;
	context: MusicLessonContext;
	storyboard: MusicLessonStoryboard;
	mediaManifest: MediaManifest;
	audit: PptxAuditReport;
	files: GeneratedMusicDeckFiles;
};

function attachMedia(storyboard: MusicLessonStoryboard, media: SlideMedia[] = []): MusicLessonStoryboard {
	const slides = storyboard.slides.map((slide) => ({ ...slide, media: [...slide.media] }));
	for (const [index, item] of media.entries()) {
		const slide = slides[Math.min(index, slides.length - 1)];
		slide.media.push(item);
	}
	return { ...storyboard, slides };
}

function assertSingleTextbookMatch(context: MusicLessonContext) {
	if (context.resolution.matches.length !== 1) {
		throw new Error(
			context.resolution.ambiguous
				? `Ambiguous textbook matches for ${context.request.title}`
				: `No textbook match for ${context.request.title}`,
		);
	}
}

function createProjectId(context: MusicLessonContext, projectId?: string) {
	return projectId ?? `${slugifyTextbookId(context.request.title)}-${Date.now()}`;
}

function lessonPlanMarkdown(context: MusicLessonContext) {
	const guidanceSources = context.guidance.sources
		.filter((source) => source.status === "indexed")
		.map((source) => source.title)
		.join(", ");
	return `# ${context.request.title}

- 年级：${context.request.grade ?? "未指定"}
- 册次：${context.request.volume ?? "未指定"}
- 来源页：${context.sourcePdfPageRefs.map((ref) => ref.pageNumber).join(", ") || "未匹配"}
- 指导思想来源：${guidanceSources || "未索引"}
`;
}

function planReportMarkdown(context: MusicLessonContext, storyboard: MusicLessonStoryboard) {
	const match = context.resolution.matches[0];
	const guidanceConstraints = context.guidance.sources.flatMap((source) =>
		source.constraints.map((constraint) => `${source.title}: ${constraint.label}`),
	);
	return `# Music PPT Plan Report

- 课题：${context.request.title}
- 教材：${match?.bookTitle ?? "未匹配"}
- 教材页：${context.sourcePdfPageRefs.map((ref) => ref.pageNumber).join(", ") || "未匹配"}
- Storyboard 页数：${storyboard.slides.length}
- 指导约束：${guidanceConstraints.length}

## Guidance Constraints

${guidanceConstraints.map((constraint) => `- ${constraint}`).join("\n") || "- 未索引"}

## Slides

${storyboard.slides.map((slide, index) => `${index + 1}. ${slide.title} (${slide.layout})`).join("\n")}
`;
}

export async function planMusicDeck(
	projectRoot: string,
	rawRequest: string,
	options: PlanMusicDeckOptions = {},
): Promise<PlannedMusicDeck> {
	const context = await buildMusicLessonContext(projectRoot, rawRequest);
	assertSingleTextbookMatch(context);

	const storyboard = buildMusicLessonStoryboard(context);
	const projectId = createProjectId(context, options.projectId);
	const projectDir = join(projectRoot, ".pi", "presentation", "projects", projectId);
	await mkdir(projectDir, { recursive: true });

	const files: PlannedMusicDeckFiles = {
		projectDir,
		lessonContextPath: join(projectDir, "lesson-context.json"),
		lessonPlanPath: join(projectDir, "lesson-plan.md"),
		storyboardPath: join(projectDir, "storyboard.json"),
		planReportPath: join(projectDir, "plan-report.md"),
	};

	await Promise.all([
		writeFile(files.lessonContextPath, `${JSON.stringify(context, null, 2)}\n`, "utf-8"),
		writeFile(files.lessonPlanPath, lessonPlanMarkdown(context), "utf-8"),
		writeFile(files.storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`, "utf-8"),
		writeFile(files.planReportPath, planReportMarkdown(context, storyboard), "utf-8"),
	]);

	return {
		projectId,
		context,
		storyboard,
		files,
	};
}

export async function generateMusicDeck(
	projectRoot: string,
	rawRequest: string,
	options: GenerateMusicDeckOptions = {},
): Promise<GeneratedMusicDeck> {
	const context = await buildMusicLessonContext(projectRoot, rawRequest);
	assertSingleTextbookMatch(context);

	const storyboard = attachMedia(buildMusicLessonStoryboard(context), options.media);
	const mediaManifest = buildMediaManifest(storyboard);
	const pptx =
		mediaManifest.items.length > 0 ? await writePptxPackageWithMedia(storyboard) : writePptxPackage(storyboard);
	const audit = auditPptxPackage(pptx, { expectedSlideCount: storyboard.slides.length, mediaManifest });
	const projectId = createProjectId(context, options.projectId);
	const projectDir = join(projectRoot, ".pi", "presentation", "projects", projectId);
	const exportsDir = join(projectDir, "exports");
	await mkdir(exportsDir, { recursive: true });

	const files: GeneratedMusicDeckFiles = {
		projectDir,
		pptxPath: join(exportsDir, `${projectId}.pptx`),
		lessonPlanPath: join(projectDir, "lesson-plan.md"),
		storyboardPath: join(projectDir, "storyboard.json"),
		mediaManifestPath: join(projectDir, "media-manifest.json"),
		auditJsonPath: join(projectDir, "qa-report.json"),
		auditMarkdownPath: join(projectDir, "qa-report.md"),
	};

	await Promise.all([
		writeFile(files.pptxPath, pptx),
		writeFile(files.lessonPlanPath, lessonPlanMarkdown(context), "utf-8"),
		writeFile(files.storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`, "utf-8"),
		writeFile(files.mediaManifestPath, `${JSON.stringify(mediaManifest, null, 2)}\n`, "utf-8"),
		writeFile(files.auditJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf-8"),
		writeFile(files.auditMarkdownPath, formatPptxAuditMarkdown(audit), "utf-8"),
	]);

	return {
		projectId,
		context,
		storyboard,
		mediaManifest,
		audit,
		files,
	};
}
