import { access, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	auditPptxPackage,
	formatPptxAuditMarkdown,
	generateMusicDeck,
	indexTextbooks,
	initializePresentationProject,
	normalizeMusicLessonRequest,
	resolveTextbookLesson,
} from "@earendil-works/pi-presentation";
import { Type } from "typebox";
import type { ExtensionAPI } from "../extensions/index.ts";

const InitParams = Type.Object({
	projectRoot: Type.Optional(Type.String({ description: "Project root. Defaults to the current Pi cwd." })),
});

const EmptyParams = Type.Object({});

const LessonParams = Type.Object({
	request: Type.String({ description: "Music lesson request, for example: 做三年级上册《小雨沙沙》的教学PPT" }),
});

const AuditParams = Type.Object({
	pptxPath: Type.String({ description: "Path to a generated PPTX file." }),
});

const RememberParams = Type.Object({
	requirement: Type.String({ description: "Presentation requirement to remember." }),
	permanent: Type.Optional(Type.Boolean({ description: "Write to PPT.md instead of learned-requirements.md." })),
});

async function fileExists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function ensurePresentationInitialized(projectRoot: string) {
	const presentationRoot = join(projectRoot, ".pi", "presentation");
	if (!(await fileExists(presentationRoot))) {
		throw new Error("Presentation context is not initialized. Run /ppt-init first.");
	}
}

export default function presentationExtension(pi: ExtensionAPI) {
	pi.registerCommand("ppt-init", {
		description: "Initialize .pi/presentation for music PPT generation",
		handler: async (_args, ctx) => {
			const result = await initializePresentationProject(ctx.cwd);
			ctx.ui.notify(`Presentation initialized: ${result.presentationRoot}`, "info");
		},
	});

	pi.registerCommand("ppt-index", {
		description: "Manage presentation textbook index: status, rebuild, inspect <lesson>",
		handler: async (args, ctx) => {
			await ensurePresentationInitialized(ctx.cwd);
			const [command = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);
			if (command === "rebuild") {
				const result = await indexTextbooks(ctx.cwd);
				ctx.ui.notify(`Indexed ${result.indexedBookIds.length}, skipped ${result.skippedBookIds.length}`, "info");
				return;
			}
			if (command === "inspect") {
				const request = normalizeMusicLessonRequest(rest.join(" "));
				const resolution = await resolveTextbookLesson(ctx.cwd, request);
				ctx.ui.notify(
					resolution.matches.length > 0
						? resolution.matches
								.map(
									(match) =>
										`${match.bookTitle}《${match.lessonTitle}》第${match.pageStart}-${match.pageEnd}页`,
								)
								.join("\n")
						: `未找到：${request.title}`,
					resolution.ambiguous ? "warning" : "info",
				);
				return;
			}
			const indexPath = join(ctx.cwd, ".pi", "presentation", "index", "textbooks.index.json");
			const index = (await fileExists(indexPath)) ? JSON.parse(await readFile(indexPath, "utf-8")) : { books: [] };
			ctx.ui.notify(`Textbook index: ${Array.isArray(index.books) ? index.books.length : 0} books`, "info");
		},
	});

	pi.registerCommand("music-ppt", {
		description: "Generate a primary music PPT project from an indexed lesson request",
		handler: async (args, ctx) => {
			await ensurePresentationInitialized(ctx.cwd);
			try {
				const result = await generateMusicDeck(ctx.cwd, args);
				ctx.ui.notify(`已生成《${result.context.request.title}》PPT 项目：${result.projectId}`, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
			}
		},
	});

	pi.registerTool({
		name: "presentation_init",
		label: "Presentation Init",
		description: "Initialize .pi/presentation for PPT generation.",
		promptSnippet: "Initialize .pi/presentation for primary music PPT generation",
		parameters: InitParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await initializePresentationProject(params.projectRoot ?? ctx.cwd);
			return { content: [{ type: "text", text: `Initialized ${result.presentationRoot}` }], details: result };
		},
	});

	pi.registerTool({
		name: "presentation_index_status",
		label: "Presentation Index Status",
		description: "Read textbook index status.",
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const indexPath = join(ctx.cwd, ".pi", "presentation", "index", "textbooks.index.json");
			const index = (await fileExists(indexPath)) ? JSON.parse(await readFile(indexPath, "utf-8")) : { books: [] };
			return {
				content: [
					{ type: "text", text: `Textbook index: ${Array.isArray(index.books) ? index.books.length : 0} books` },
				],
				details: index,
			};
		},
	});

	pi.registerTool({
		name: "presentation_index_rebuild",
		label: "Presentation Index Rebuild",
		description: "Rebuild presentation textbook indexes.",
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const result = await indexTextbooks(ctx.cwd);
			return {
				content: [
					{
						type: "text",
						text: `Indexed ${result.indexedBookIds.length}, skipped ${result.skippedBookIds.length}`,
					},
				],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "presentation_resolve_lesson",
		label: "Presentation Resolve Lesson",
		description: "Resolve a natural-language music lesson request against indexed textbooks.",
		parameters: LessonParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const resolution = await resolveTextbookLesson(ctx.cwd, normalizeMusicLessonRequest(params.request));
			return { content: [{ type: "text", text: JSON.stringify(resolution.matches, null, 2) }], details: resolution };
		},
	});

	pi.registerTool({
		name: "presentation_generate_music_deck",
		label: "Presentation Generate Music Deck",
		description: "Generate a primary music PPT project from a lesson request.",
		parameters: LessonParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await generateMusicDeck(ctx.cwd, params.request);
			return {
				content: [{ type: "text", text: `Generated ${result.files.pptxPath}` }],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "presentation_audit_pptx",
		label: "Presentation Audit PPTX",
		description: "Audit a generated PPTX package.",
		parameters: AuditParams,
		async execute(_toolCallId, params) {
			const report = auditPptxPackage(await readFile(params.pptxPath));
			return { content: [{ type: "text", text: formatPptxAuditMarkdown(report) }], details: report };
		},
	});

	pi.registerTool({
		name: "presentation_remember_requirement",
		label: "Presentation Remember Requirement",
		description: "Remember a PPT generation requirement in PPT.md or learned-requirements.md.",
		parameters: RememberParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const target = params.permanent
				? join(ctx.cwd, ".pi", "presentation", "PPT.md")
				: join(ctx.cwd, ".pi", "presentation", "memory", "learned-requirements.md");
			await appendFile(target, `\n- ${params.requirement}\n`, "utf-8");
			return { content: [{ type: "text", text: `Remembered requirement in ${target}` }], details: { target } };
		},
	});
}
