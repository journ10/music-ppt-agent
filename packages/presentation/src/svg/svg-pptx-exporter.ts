import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { readPresentationRuntimeConfig } from "../project/runtime-config.ts";
import { type RenderMusicDeckSvgProjectOptions, renderMusicDeckSvgProject } from "./svg-project-renderer.ts";

export type SvgPptxExportOptions = {
	projectDir: string;
	outputPath?: string;
	svgToPptxScript?: string;
	pythonPath?: string;
	source?: string;
	format?: "ppt169" | "ppt43";
};

export type SvgPptxExportResult = {
	projectDir: string;
	outputPath: string;
	scriptPath: string;
};

export type SvgPptxExporter = (options: SvgPptxExportOptions) => Promise<SvgPptxExportResult>;

export type RenderAndExportMusicDeckOptions = RenderMusicDeckSvgProjectOptions & {
	outputPath?: string;
	svgToPptxScript?: string;
	pythonPath?: string;
	exportSvgProject?: SvgPptxExporter;
};

export type RenderedAndExportedMusicDeck = Awaited<ReturnType<typeof renderMusicDeckSvgProject>> & {
	pptxExport: SvgPptxExportResult;
};

function defaultOutputPath(projectDir: string) {
	return join(projectDir, "exports", `${basename(projectDir)}.pptx`);
}

export async function exportSvgProjectToPptx(options: SvgPptxExportOptions): Promise<SvgPptxExportResult> {
	const scriptPath = options.svgToPptxScript ?? process.env.PI_PRESENTATION_SVG_TO_PPTX_SCRIPT;
	if (!scriptPath) {
		throw new Error("Missing PI_PRESENTATION_SVG_TO_PPTX_SCRIPT for PPT Master SVG to PPTX export.");
	}
	const outputPath = options.outputPath ?? defaultOutputPath(options.projectDir);
	await mkdir(join(options.projectDir, "exports"), { recursive: true });
	const pythonPath = options.pythonPath ?? process.env.PI_PRESENTATION_PYTHON ?? "python3";

	return new Promise((resolve, reject) => {
		const child = spawn(
			pythonPath,
			[
				scriptPath,
				options.projectDir,
				"-s",
				options.source ?? "svg_output",
				"--only",
				"native",
				"-f",
				options.format ?? "ppt169",
				"-o",
				outputPath,
				"-t",
				"none",
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let stderr = "";
		child.stderr.setEncoding("utf-8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`PPT Master SVG export failed with exit code ${code}: ${stderr.trim()}`));
				return;
			}
			resolve({
				projectDir: options.projectDir,
				outputPath,
				scriptPath,
			});
		});
	});
}

export async function renderAndExportMusicDeck(
	projectRoot: string,
	rawRequest: string,
	options: RenderAndExportMusicDeckOptions = {},
): Promise<RenderedAndExportedMusicDeck> {
	const rendered = await renderMusicDeckSvgProject(projectRoot, rawRequest, options);
	if (rendered.audit.errors.length > 0) {
		throw new Error(`SVG project failed QA: ${rendered.audit.errors.join("; ")}`);
	}
	const runtimeConfig = await readPresentationRuntimeConfig(projectRoot);
	const exportSvgProject = options.exportSvgProject ?? exportSvgProjectToPptx;
	const pptxExport = await exportSvgProject({
		projectDir: rendered.files.projectDir,
		outputPath: options.outputPath,
		svgToPptxScript: options.svgToPptxScript ?? runtimeConfig.pptMaster?.svgToPptxScript,
		pythonPath: options.pythonPath ?? runtimeConfig.pptMaster?.pythonPath,
	});

	return {
		...rendered,
		pptxExport,
	};
}
