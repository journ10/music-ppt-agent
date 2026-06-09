import { access, readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { TextbookAssetManifest } from "../assets/textbook-assets.ts";
import { scanStudentSlideTextForForbiddenTerms } from "../curriculum/forbidden-slide-terms.ts";
import type { MusicLessonStoryboard } from "../storyboard/slide-spec.ts";

export type SvgProjectAuditOptions = {
	storyboard: MusicLessonStoryboard;
	assetManifest: TextbookAssetManifest;
	svgPaths: string[];
	notesDir: string;
};

export type SvgProjectAuditReport = {
	errors: string[];
	warnings: string[];
	slideCount: number;
	svgCount: number;
	notesCount: number;
	assetCount: number;
};

async function fileExists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function countMarkdownFiles(directory: string) {
	const entries = await readdir(directory, { withFileTypes: true });
	return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
}

export async function auditSvgProject(options: SvgProjectAuditOptions): Promise<SvgProjectAuditReport> {
	const errors: string[] = [];
	const warnings: string[] = [];
	const notesCount = await countMarkdownFiles(options.notesDir);

	if (options.svgPaths.length !== options.storyboard.slides.length) {
		errors.push(`Expected ${options.storyboard.slides.length} SVG files, found ${options.svgPaths.length}.`);
	}
	if (notesCount !== options.storyboard.slides.length) {
		errors.push(`Expected ${options.storyboard.slides.length} note files, found ${notesCount}.`);
	}

	for (const match of scanStudentSlideTextForForbiddenTerms(options.storyboard.slides)) {
		errors.push(`Forbidden term ${match.term} in ${match.slideId} ${match.field}.`);
	}

	for (const svgPath of options.svgPaths) {
		const svg = await readFile(svgPath, "utf-8");
		if (!svg.includes('viewBox="0 0 1280 720"')) {
			errors.push(`${basename(svgPath)} is not locked to 1280x720.`);
		}
		if (svg.includes("小雨")) {
			warnings.push(`${basename(svgPath)} contains rain-specific copy.`);
		}
	}

	for (const asset of options.assetManifest.assets) {
		if (!(await fileExists(asset.outputPath))) {
			errors.push(`Missing textbook asset: ${asset.outputPath}`);
		}
		if (asset.widthPx <= 0 || asset.heightPx <= 0) {
			errors.push(`Invalid textbook asset dimensions for ${asset.assetId}.`);
		}
	}

	return {
		errors,
		warnings,
		slideCount: options.storyboard.slides.length,
		svgCount: options.svgPaths.length,
		notesCount,
		assetCount: options.assetManifest.assets.length,
	};
}

export function formatSvgProjectAuditMarkdown(report: SvgProjectAuditReport) {
	return `# SVG Project QA

- Slides: ${report.slideCount}
- SVG files: ${report.svgCount}
- Notes: ${report.notesCount}
- Textbook assets: ${report.assetCount}
- Errors: ${report.errors.length}
- Warnings: ${report.warnings.length}

## Errors

${report.errors.map((error) => `- ${error}`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
