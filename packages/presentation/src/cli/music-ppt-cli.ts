import { access, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { PdfPageRenderer } from "../assets/pdf-page-renderer.ts";
import { loadGuidanceIndex, rebuildGuidanceIndex } from "../curriculum/guidance-extractor.ts";
import { normalizeMusicLessonRequest } from "../lesson/lesson-request.ts";
import { planMusicDeck } from "../lesson/music-deck-generator.ts";
import { initializePresentationProject } from "../project/presentation-init.ts";
import { readPresentationRuntimeConfig, rememberPptMasterExportConfig } from "../project/runtime-config.ts";
import { readPresentationSourceManifest } from "../project/source-manifest.ts";
import { type PptxReviewRenderer, renderPptxReview } from "../qa/pptx-review-renderer.ts";
import { resolveVisualQaToolPaths } from "../qa/visual-qa-tools.ts";
import { renderAndExportMusicDeck, type SvgPptxExporter } from "../svg/svg-pptx-exporter.ts";
import { renderMusicDeckSvgProject } from "../svg/svg-project-renderer.ts";
import { indexTextbooks } from "../textbooks/textbook-indexer.ts";
import { resolveTextbookLesson } from "../textbooks/textbook-resolver.ts";

type OutputWriter = (line: string) => void;

export type MusicPptCliOptions = {
	cwd?: string;
	stdout?: OutputWriter;
	stderr?: OutputWriter;
	renderPdfPage?: PdfPageRenderer;
	exportSvgProject?: SvgPptxExporter;
	renderPptxReview?: PptxReviewRenderer;
};

type ParsedCliArgs = {
	command: string;
	commandArgs: string[];
	projectRoot: string;
	projectId?: string;
	outputPath?: string;
	reviewOutputDir?: string;
	svgToPptxScript?: string;
	pythonPath?: string;
	reviewAfterExport: boolean;
	showHelp: boolean;
};

const COMMANDS = new Set(["init", "sources", "guidance", "index", "config", "doctor", "review", "plan", "svg", "pptx"]);

const HELP_TEXT = `music-ppt - primary music teacher PPT generator

Usage:
  music-ppt init [--root <dir>]
  music-ppt sources status [--root <dir>]
  music-ppt guidance status|rebuild [--root <dir>]
  music-ppt index status|rebuild|inspect <lesson> [--root <dir>]
  music-ppt config show [--root <dir>]
  music-ppt config set ppt-master <svg_to_pptx.py> [--root <dir>] [--python <python>]
  music-ppt doctor [--root <dir>]
  music-ppt review <pptx> [--root <dir>] [--out <dir>]
  music-ppt plan <lesson request> [--root <dir>] [--project-id <id>]
  music-ppt svg <lesson request> [--root <dir>] [--project-id <id>]
  music-ppt pptx <lesson request> [--root <dir>] [--project-id <id>] [--output <file>] [--svg-to-pptx-script <file>] [--review]
  music-ppt <lesson request> [--root <dir>] [--project-id <id>] [--output <file>]

Environment:
  PI_PRESENTATION_SVG_TO_PPTX_SCRIPT  PPT Master svg_to_pptx.py path
  PI_PRESENTATION_LIBREOFFICE          LibreOffice executable for visual review
  PI_PRESENTATION_PDFTOPPM             Poppler pdftoppm executable for visual review
  PI_PRESENTATION_PYTHON              Python executable for PPT Master export
`;

function isNotFoundError(error: unknown) {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function fileExists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function nextValue(args: string[], index: number, flag: string) {
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

function parseArgs(argv: string[], cwd: string): ParsedCliArgs {
	const commandArgs: string[] = [];
	let projectRoot = cwd;
	let projectId: string | undefined;
	let outputPath: string | undefined;
	let reviewOutputDir: string | undefined;
	let svgToPptxScript: string | undefined;
	let pythonPath: string | undefined;
	let reviewAfterExport = false;
	let showHelp = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") {
			showHelp = true;
			continue;
		}
		if (arg === "--root") {
			projectRoot = resolve(cwd, nextValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--project-id") {
			projectId = nextValue(argv, index, arg);
			index += 1;
			continue;
		}
		if (arg === "--output") {
			outputPath = resolve(cwd, nextValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--out") {
			reviewOutputDir = resolve(cwd, nextValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--svg-to-pptx-script") {
			svgToPptxScript = resolve(cwd, nextValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--python") {
			pythonPath = nextValue(argv, index, arg);
			index += 1;
			continue;
		}
		if (arg === "--review") {
			reviewAfterExport = true;
			continue;
		}
		if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		commandArgs.push(arg);
	}

	if (showHelp || commandArgs.length === 0) {
		return {
			command: "help",
			commandArgs: [],
			projectRoot,
			projectId,
			outputPath,
			reviewOutputDir,
			svgToPptxScript,
			pythonPath,
			reviewAfterExport,
			showHelp: true,
		};
	}

	const [firstArg = "", ...restArgs] = commandArgs;
	if (COMMANDS.has(firstArg)) {
		return {
			command: firstArg,
			commandArgs: restArgs,
			projectRoot,
			projectId,
			outputPath,
			reviewOutputDir,
			svgToPptxScript,
			pythonPath,
			reviewAfterExport,
			showHelp,
		};
	}

	return {
		command: "pptx",
		commandArgs,
		projectRoot,
		projectId,
		outputPath,
		reviewOutputDir,
		svgToPptxScript,
		pythonPath,
		reviewAfterExport,
		showHelp,
	};
}

async function ensurePresentationInitialized(projectRoot: string) {
	const presentationRoot = join(projectRoot, ".pi", "presentation");
	if (!(await fileExists(presentationRoot))) {
		throw new Error(
			`Presentation context is not initialized at ${presentationRoot}. Run: music-ppt init --root ${projectRoot}`,
		);
	}
}

function formatSourceManifestStatus(manifest: Awaited<ReturnType<typeof readPresentationSourceManifest>>) {
	const counts = new Map<string, number>();
	for (const source of manifest.sources.filter((item) => item.enabled !== false)) {
		counts.set(source.kind, (counts.get(source.kind) ?? 0) + 1);
	}
	const summary = [...counts.entries()].map(([kind, count]) => `${kind}: ${count}`).join(", ") || "empty";
	return `Presentation sources: ${summary}`;
}

function formatGuidanceStatus(index: Awaited<ReturnType<typeof loadGuidanceIndex>>) {
	const indexed = index.sources.filter((source) => source.status === "indexed").length;
	const constraints = index.sources.reduce((total, source) => total + source.constraints.length, 0);
	return `Guidance index: ${indexed}/${index.sources.length} sources indexed, ${constraints} constraints`;
}

async function formatTextbookIndexStatus(projectRoot: string) {
	const indexPath = join(projectRoot, ".pi", "presentation", "index", "textbooks.index.json");
	try {
		const index = JSON.parse(await readFile(indexPath, "utf-8")) as { books?: unknown[] };
		return `Textbook index: ${Array.isArray(index.books) ? index.books.length : 0} books`;
	} catch (error) {
		if (isNotFoundError(error)) {
			return "Textbook index: 0 books";
		}
		throw error;
	}
}

async function countIndexedTextbooks(projectRoot: string) {
	const indexPath = join(projectRoot, ".pi", "presentation", "index", "textbooks.index.json");
	try {
		const index = JSON.parse(await readFile(indexPath, "utf-8")) as { books?: unknown[] };
		return Array.isArray(index.books) ? index.books.length : 0;
	} catch (error) {
		if (isNotFoundError(error)) {
			return 0;
		}
		throw error;
	}
}

function requestFromArgs(args: string[]) {
	const request = args.join(" ").trim();
	if (!request) {
		throw new Error("Missing lesson request.");
	}
	return request;
}

async function runSourcesCommand(parsed: ParsedCliArgs, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const [subcommand = "status"] = parsed.commandArgs;
	if (subcommand !== "status") {
		throw new Error(`Unknown sources command: ${subcommand}`);
	}
	const manifest = await readPresentationSourceManifest(parsed.projectRoot);
	stdout(formatSourceManifestStatus(manifest));
}

async function runGuidanceCommand(parsed: ParsedCliArgs, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const [subcommand = "status"] = parsed.commandArgs;
	if (subcommand === "rebuild") {
		const index = await rebuildGuidanceIndex(parsed.projectRoot);
		stdout(formatGuidanceStatus(index));
		return;
	}
	if (subcommand === "status") {
		const index = await loadGuidanceIndex(parsed.projectRoot);
		stdout(formatGuidanceStatus(index));
		return;
	}
	throw new Error(`Unknown guidance command: ${subcommand}`);
}

async function runIndexCommand(parsed: ParsedCliArgs, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const [subcommand = "status", ...restArgs] = parsed.commandArgs;
	if (subcommand === "rebuild") {
		const result = await indexTextbooks(parsed.projectRoot);
		stdout(`Indexed ${result.indexedBookIds.length}, skipped ${result.skippedBookIds.length}`);
		return;
	}
	if (subcommand === "inspect") {
		const request = normalizeMusicLessonRequest(requestFromArgs(restArgs));
		const resolution = await resolveTextbookLesson(parsed.projectRoot, request);
		if (resolution.matches.length === 0) {
			stdout(`No textbook match for ${request.title}`);
			return;
		}
		for (const match of resolution.matches) {
			stdout(`${match.bookTitle}《${match.lessonTitle}》第${match.pageStart}-${match.pageEnd}页`);
		}
		return;
	}
	if (subcommand === "status") {
		stdout(await formatTextbookIndexStatus(parsed.projectRoot));
		return;
	}
	throw new Error(`Unknown index command: ${subcommand}`);
}

async function runConfigCommand(parsed: ParsedCliArgs, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const [subcommand = "show", target, value] = parsed.commandArgs;
	if (subcommand === "show") {
		const config = await readPresentationRuntimeConfig(parsed.projectRoot);
		stdout(JSON.stringify(config, null, 2));
		if (config.pptMaster?.svgToPptxScript) {
			stdout(`PPT Master SVG exporter: ${config.pptMaster.svgToPptxScript}`);
		}
		return;
	}
	if (subcommand === "set" && target === "ppt-master") {
		if (!value) {
			throw new Error("Missing svg_to_pptx.py path for config set ppt-master.");
		}
		const config = await rememberPptMasterExportConfig(parsed.projectRoot, {
			svgToPptxScript: resolve(parsed.projectRoot, value),
			pythonPath: parsed.pythonPath,
		});
		stdout(`PPT Master SVG exporter: ${config.pptMaster?.svgToPptxScript ?? ""}`);
		return;
	}
	throw new Error(`Unknown config command: ${parsed.commandArgs.join(" ")}`);
}

async function runDoctorCommand(parsed: ParsedCliArgs, stdout: OutputWriter) {
	const presentationRoot = join(parsed.projectRoot, ".pi", "presentation");
	const initialized = await fileExists(presentationRoot);
	stdout(`Presentation root: ${initialized ? presentationRoot : "missing"}`);
	if (!initialized) {
		stdout("Doctor: missing presentation context");
		return;
	}

	const manifest = await readPresentationSourceManifest(parsed.projectRoot);
	stdout(formatSourceManifestStatus(manifest));
	const guidanceIndex = await loadGuidanceIndex(parsed.projectRoot);
	stdout(formatGuidanceStatus(guidanceIndex));
	stdout(`Textbook index: ${await countIndexedTextbooks(parsed.projectRoot)} books`);

	const config = await readPresentationRuntimeConfig(parsed.projectRoot);
	const scriptPath = config.pptMaster?.svgToPptxScript ?? process.env.PI_PRESENTATION_SVG_TO_PPTX_SCRIPT;
	let scriptExists = false;
	if (scriptPath) {
		scriptExists = await fileExists(scriptPath);
		stdout(`PPT Master SVG exporter: ${scriptPath}`);
		stdout(`PPT Master SVG exporter exists: ${scriptExists ? "yes" : "no"}`);
	} else {
		stdout("PPT Master SVG exporter: missing");
	}
	const visualQaTools = await resolveVisualQaToolPaths({ config: config.visualQa });
	stdout(`Visual QA LibreOffice: ${visualQaTools.libreOfficePath ?? "missing"}`);
	stdout(`Visual QA PDF renderer: ${visualQaTools.pdfToPngPath ?? "missing"}`);
	stdout(`Visual QA Python: ${visualQaTools.pythonPath ?? "missing"}`);
	stdout(initialized && scriptExists ? "Doctor: ready" : "Doctor: needs configuration");
}

async function runReviewCommand(parsed: ParsedCliArgs, options: MusicPptCliOptions, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const pptxPath = resolve(parsed.projectRoot, requestFromArgs(parsed.commandArgs));
	await runReviewForPptx(parsed.projectRoot, pptxPath, parsed.reviewOutputDir, options, stdout);
}

async function runReviewForPptx(
	projectRoot: string,
	pptxPath: string,
	reviewOutputDir: string | undefined,
	options: MusicPptCliOptions,
	stdout: OutputWriter,
) {
	const outputDir = reviewOutputDir ?? join(dirname(pptxPath), `${basename(pptxPath)}.review`);
	const config = await readPresentationRuntimeConfig(projectRoot);
	const visualQaTools = await resolveVisualQaToolPaths({ config: config.visualQa });
	const renderer = options.renderPptxReview ?? renderPptxReview;
	const report = await renderer({
		pptxPath,
		outputDir,
		libreOfficePath: visualQaTools.libreOfficePath,
		pdfToPngPath: visualQaTools.pdfToPngPath,
		pythonPath: visualQaTools.pythonPath,
	});
	stdout(`Review contact sheet: ${report.contactSheetPath}`);
	stdout(`Review report: ${report.reportMarkdownPath}`);
	stdout(`Review page images: ${report.pageImagePaths.length}`);
}

async function runPlanCommand(parsed: ParsedCliArgs, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const result = await planMusicDeck(parsed.projectRoot, requestFromArgs(parsed.commandArgs), {
		projectId: parsed.projectId,
	});
	stdout(`Planned ${result.context.request.title}: ${result.files.storyboardPath}`);
}

async function runSvgCommand(parsed: ParsedCliArgs, options: MusicPptCliOptions, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const result = await renderMusicDeckSvgProject(parsed.projectRoot, requestFromArgs(parsed.commandArgs), {
		projectId: parsed.projectId,
		renderPdfPage: options.renderPdfPage,
	});
	stdout(`Rendered SVG project ${result.files.svgDir}`);
	stdout(`SVG QA errors: ${result.audit.errors.length}, warnings: ${result.audit.warnings.length}`);
}

async function runPptxCommand(parsed: ParsedCliArgs, options: MusicPptCliOptions, stdout: OutputWriter) {
	await ensurePresentationInitialized(parsed.projectRoot);
	const result = await renderAndExportMusicDeck(parsed.projectRoot, requestFromArgs(parsed.commandArgs), {
		projectId: parsed.projectId,
		outputPath: parsed.outputPath,
		svgToPptxScript: parsed.svgToPptxScript,
		pythonPath: parsed.pythonPath,
		renderPdfPage: options.renderPdfPage,
		exportSvgProject: options.exportSvgProject,
	});
	stdout(`Exported PPTX ${result.pptxExport.outputPath}`);
	stdout(`SVG QA errors: ${result.audit.errors.length}, warnings: ${result.audit.warnings.length}`);
	if (parsed.reviewAfterExport) {
		await runReviewForPptx(parsed.projectRoot, result.pptxExport.outputPath, parsed.reviewOutputDir, options, stdout);
	}
}

export async function runMusicPptCli(argv: string[], options: MusicPptCliOptions = {}): Promise<number> {
	const stdout = options.stdout ?? ((line: string) => console.log(line));
	const stderr = options.stderr ?? ((line: string) => console.error(line));
	try {
		const parsed = parseArgs(argv, options.cwd ?? process.cwd());
		if (parsed.showHelp || parsed.command === "help") {
			stdout(HELP_TEXT);
			return 0;
		}

		if (parsed.command === "init") {
			const result = await initializePresentationProject(parsed.projectRoot);
			stdout(`Initialized ${result.presentationRoot}`);
			return 0;
		}
		if (parsed.command === "sources") {
			await runSourcesCommand(parsed, stdout);
			return 0;
		}
		if (parsed.command === "guidance") {
			await runGuidanceCommand(parsed, stdout);
			return 0;
		}
		if (parsed.command === "index") {
			await runIndexCommand(parsed, stdout);
			return 0;
		}
		if (parsed.command === "config") {
			await runConfigCommand(parsed, stdout);
			return 0;
		}
		if (parsed.command === "doctor") {
			await runDoctorCommand(parsed, stdout);
			return 0;
		}
		if (parsed.command === "review") {
			await runReviewCommand(parsed, options, stdout);
			return 0;
		}
		if (parsed.command === "plan") {
			await runPlanCommand(parsed, stdout);
			return 0;
		}
		if (parsed.command === "svg") {
			await runSvgCommand(parsed, options, stdout);
			return 0;
		}
		if (parsed.command === "pptx") {
			await runPptxCommand(parsed, options, stdout);
			return 0;
		}

		throw new Error(`Unknown command: ${parsed.command}`);
	} catch (error) {
		stderr(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
