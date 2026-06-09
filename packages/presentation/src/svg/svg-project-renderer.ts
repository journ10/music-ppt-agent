import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type MaterializeTextbookAssetsOptions,
	materializeTextbookAssets,
	type TextbookAssetManifest,
	type TextbookPageAsset,
} from "../assets/textbook-assets.ts";
import { type PlannedMusicDeck, planMusicDeck } from "../lesson/music-deck-generator.ts";
import { auditSvgProject, formatSvgProjectAuditMarkdown, type SvgProjectAuditReport } from "../qa/svg-project-audit.ts";
import type { SlideSpec } from "../storyboard/slide-spec.ts";

export type RenderMusicDeckSvgProjectOptions = MaterializeTextbookAssetsOptions & {
	projectId?: string;
};

export type RenderedMusicDeckSvgFiles = {
	projectDir: string;
	svgDir: string;
	assetsDir: string;
	notesDir: string;
	assetManifestPath: string;
	designSpecPath: string;
	specLockPath: string;
	svgQaJsonPath: string;
	svgQaMarkdownPath: string;
	svgPaths: string[];
};

export type RenderedMusicDeckSvgProject = {
	plan: PlannedMusicDeck;
	assetManifest: TextbookAssetManifest;
	audit: SvgProjectAuditReport;
	files: RenderedMusicDeckSvgFiles;
};

const SVG_WIDTH = 1280;
const SVG_HEIGHT = 720;

function escapeXml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function wrapText(text: string, maxChars: number) {
	const normalized = text.trim();
	const lines: string[] = [];
	for (let index = 0; index < normalized.length; index += maxChars) {
		lines.push(normalized.slice(index, index + maxChars));
	}
	return lines.length > 0 ? lines : [""];
}

function textBlock(
	lines: string[],
	x: number,
	y: number,
	fontSize: number,
	fill: string,
	lineHeight = fontSize * 1.35,
) {
	return `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${fill}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${lines
		.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
		.join("")}</text>`;
}

function slideBackground(slide: SlideSpec) {
	const accentByLayout: Record<SlideSpec["layout"], string> = {
		cover: "#E65F4F",
		map: "#2A7C84",
		listening: "#4C6FAE",
		song: "#8A6A3A",
		activity: "#5C8A58",
		summary: "#7A5EA8",
		ending: "#B85C38",
	};
	const accent = accentByLayout[slide.layout];
	return `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#FFF8EF"/>
<rect x="0" y="0" width="${SVG_WIDTH}" height="96" fill="${accent}"/>
<circle cx="1120" cy="80" r="48" fill="#F8D36B" opacity="0.9"/>
<path d="M0 650 C220 620 360 700 560 660 C820 610 1040 690 1280 640 L1280 720 L0 720 Z" fill="#F3E2C4"/>`;
}

function renderImageAsset(asset: TextbookPageAsset) {
	const href = `../assets/${asset.relativeOutputPath}`;
	return `<rect x="74" y="142" width="524" height="430" rx="8" fill="#FFFFFF" stroke="#B88B50" stroke-width="3"/>
<image href="${escapeXml(href)}" x="92" y="160" width="488" height="394" preserveAspectRatio="xMidYMid meet"/>
<text x="92" y="610" font-size="24" fill="#6C4C2F" font-family="PingFang SC, Microsoft YaHei, sans-serif">教材页 ${asset.pageNumber}</text>`;
}

function renderStudentText(slide: SlideSpec, hasMainAsset: boolean) {
	const x = hasMainAsset ? 660 : 96;
	const y = hasMainAsset ? 214 : 206;
	const width = hasMainAsset ? 500 : 920;
	const lines = slide.studentVisibleText.flatMap((text) => wrapText(text, hasMainAsset ? 15 : 22));
	const body = textBlock(lines, x + 32, y + 58, hasMainAsset ? 34 : 40, "#31261E");
	return `<rect x="${x}" y="${y}" width="${width}" height="${hasMainAsset ? 260 : 250}" rx="8" fill="#FFFFFF" stroke="#E1C78F" stroke-width="3"/>
${body}`;
}

function renderMapChips(slide: SlideSpec) {
	if (slide.layout !== "map") {
		return "";
	}
	return slide.studentVisibleText
		.map((text, index) => {
			const x = 136 + index * 204;
			return `<rect x="${x}" y="340" width="132" height="96" rx="8" fill="#FFFFFF" stroke="#2A7C84" stroke-width="3"/>
<text x="${x + 66}" y="400" text-anchor="middle" font-size="40" fill="#2A4C50" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(text)}</text>`;
		})
		.join("");
}

function renderSlideSvg(slide: SlideSpec, index: number, assetsById: Map<string, TextbookPageAsset>) {
	const mainAssetRef = slide.assets.find((asset) => asset.kind === "textbook-page" && asset.role === "main");
	const mainAsset = mainAssetRef ? assetsById.get(mainAssetRef.assetId) : undefined;
	const titleLines = wrapText(slide.title, 18);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
${slideBackground(slide)}
<text x="72" y="62" font-size="40" fill="#FFFFFF" font-weight="700" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(titleLines[0])}</text>
<text x="1172" y="62" text-anchor="end" font-size="24" fill="#FFFFFF" font-family="PingFang SC, Microsoft YaHei, sans-serif">${String(index + 1).padStart(2, "0")}</text>
${mainAsset ? renderImageAsset(mainAsset) : ""}
${renderStudentText(slide, mainAsset !== undefined)}
${renderMapChips(slide)}
</svg>
`;
}

function designSpecMarkdown(plan: PlannedMusicDeck) {
	return `# Design Spec

- Canvas: 1280x720, 16:9.
- Audience: primary school music classroom projection.
- Lesson: ${plan.context.request.title}
- Visual direction: warm classroom palette, high contrast text, restrained cards, PPT Master-compatible SVG.
- Source pages: ${plan.context.sourcePdfPageRefs.map((ref) => ref.pageNumber).join(", ") || "none"}
- Student text: short action-oriented prompts only.
- Teacher guidance and OCR source excerpts: notes/internal context only.
`;
}

function specLockMarkdown(plan: PlannedMusicDeck, assetManifest: TextbookAssetManifest) {
	return `# Spec Lock

- Slides: ${plan.storyboard.slides.length}
- Notes: ${plan.storyboard.slides.length}
- Textbook assets: ${assetManifest.assets.length}
- Forbidden guidance terms are not allowed in title or studentVisibleText.
- Main textbook images must not be covered by colored teaching boxes.
`;
}

export async function renderMusicDeckSvgProject(
	projectRoot: string,
	rawRequest: string,
	options: RenderMusicDeckSvgProjectOptions = {},
): Promise<RenderedMusicDeckSvgProject> {
	const plan = await planMusicDeck(projectRoot, rawRequest, { projectId: options.projectId });
	const projectDir = plan.files.projectDir;
	const svgDir = join(projectDir, "svg_output");
	const notesDir = join(projectDir, "notes");
	const assetsDir = join(projectDir, "assets");
	await Promise.all([mkdir(svgDir, { recursive: true }), mkdir(notesDir, { recursive: true })]);
	const assetManifest = await materializeTextbookAssets(projectRoot, plan.context, projectDir, {
		renderPdfPage: options.renderPdfPage,
	});
	const assetsById = new Map(assetManifest.assets.map((asset) => [asset.assetId, asset]));
	const svgPaths: string[] = [];

	for (const [index, slide] of plan.storyboard.slides.entries()) {
		const svgPath = join(svgDir, `slide-${String(index + 1).padStart(2, "0")}.svg`);
		await writeFile(svgPath, renderSlideSvg(slide, index, assetsById), "utf-8");
		await writeFile(
			join(notesDir, `slide-${String(index + 1).padStart(2, "0")}.md`),
			`${slide.teacherNotes}\n`,
			"utf-8",
		);
		svgPaths.push(svgPath);
	}

	const files: RenderedMusicDeckSvgFiles = {
		projectDir,
		svgDir,
		assetsDir,
		notesDir,
		assetManifestPath: join(assetsDir, "asset-manifest.json"),
		designSpecPath: join(projectDir, "design_spec.md"),
		specLockPath: join(projectDir, "spec_lock.md"),
		svgQaJsonPath: join(projectDir, "svg-qa-report.json"),
		svgQaMarkdownPath: join(projectDir, "svg-qa-report.md"),
		svgPaths,
	};
	const audit = await auditSvgProject({
		storyboard: plan.storyboard,
		assetManifest,
		svgPaths,
		notesDir,
	});
	await Promise.all([
		writeFile(files.designSpecPath, designSpecMarkdown(plan), "utf-8"),
		writeFile(files.specLockPath, specLockMarkdown(plan, assetManifest), "utf-8"),
		writeFile(files.svgQaJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf-8"),
		writeFile(files.svgQaMarkdownPath, formatSvgProjectAuditMarkdown(audit), "utf-8"),
	]);

	return {
		plan,
		assetManifest,
		audit,
		files,
	};
}
