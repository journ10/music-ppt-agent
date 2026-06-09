import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	generateMusicDeck,
	indexTextbooks,
	initializePresentationProject,
	planMusicDeck,
	rebuildGuidanceIndex,
	renderMusicDeckSvgProject,
	writePresentationSourceManifest,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture, tinyMp3Fixture, tinyMp4Fixture, tinyPngFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createFixtureProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-e2e-music-deck-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	await writeFile(
		join(projectRoot, ".pi", "presentation", "textbooks", "人音版-三年级上册.pdf"),
		minimalPdfFixture(["# 第2单元\n《小雨沙沙》\n歌词：小雨沙沙\n谱例：1 2 3", "# 聆听活动\n拍一拍节奏"]),
	);
	const audioPath = join(projectRoot, "rain.mp3");
	const videoPath = join(projectRoot, "movement.mp4");
	const posterPath = join(projectRoot, "poster.png");
	await writeFile(audioPath, tinyMp3Fixture());
	await writeFile(videoPath, tinyMp4Fixture());
	await writeFile(posterPath, tinyPngFixture());
	await indexTextbooks(projectRoot);
	return { projectRoot, audioPath, videoPath, posterPath };
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("generateMusicDeck", () => {
	it("plans a golden lesson case with full context and storyboard artifacts", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "pi-e2e-warm-home-plan-"));
		tempDirs.push(projectRoot);
		await initializePresentationProject(projectRoot);
		const guidancePath = join(projectRoot, "guidance.pdf");
		await writeFile(guidancePath, minimalPdfFixture(["音乐课堂重视聆听、情感体验、小组合作和实践活动。"]));
		await writePresentationSourceManifest(projectRoot, {
			version: 1,
			sources: [{ id: "guidance", kind: "guidance", path: guidancePath, title: "指导思想" }],
		});
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "粤教版-一年级下册.pdf"),
			minimalPdfFixture([
				"目录\n第5单元 幸福的一家 / 31\n演唱 温暖的家 / 33",
				"幸福的一家\n31",
				"温暖的家\n想想：你能为家人做些什么事情来表达自己的爱呢？\n33",
			]),
		);
		await rebuildGuidanceIndex(projectRoot);
		await indexTextbooks(projectRoot);

		const result = await planMusicDeck(projectRoot, "做一年级下册《温暖的家》的教学PPT", {
			projectId: "golden-warm-home",
		});

		expect(result.context.request).toMatchObject({ title: "温暖的家", grade: "一年级", volume: "下册" });
		expect(result.context.sourcePdfPageRefs.map((ref) => ref.pageNumber)).toEqual([3]);
		expect(result.context.guidance.sources[0].constraints.length).toBeGreaterThan(0);
		expect(result.storyboard.lessonTitle).toBe("温暖的家");
		expect(result.storyboard.slides.map((slide) => slide.title).join("\n")).not.toContain("小雨");
		expect(result.storyboard.slides.flatMap((slide) => slide.assets)).toContainEqual({
			assetId: "yue-jiao-ban-yi-nian-ji-xia-ce-page-3",
			kind: "textbook-page",
			role: "main",
		});
		expect(await readFile(result.files.lessonContextPath, "utf-8")).toContain('"title": "温暖的家"');
		expect(await readFile(result.files.storyboardPath, "utf-8")).toContain('"lessonTitle": "温暖的家"');
		expect(await readFile(result.files.planReportPath, "utf-8")).toContain("Storyboard 页数：12");
	});

	it("renders a PPT Master-style SVG project with a textbook page asset", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "pi-e2e-warm-home-svg-"));
		tempDirs.push(projectRoot);
		await initializePresentationProject(projectRoot);
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "粤教版-一年级下册.pdf"),
			minimalPdfFixture([
				"目录\n第5单元 幸福的一家 / 31\n演唱 温暖的家 / 33",
				"幸福的一家\n31",
				"温暖的家\n想想：你能为家人做些什么事情来表达自己的爱呢？\n33",
			]),
		);
		await indexTextbooks(projectRoot);

		const result = await renderMusicDeckSvgProject(projectRoot, "做一年级下册《温暖的家》的教学PPT", {
			projectId: "golden-warm-home-svg",
			renderPdfPage: async (options) => {
				await writeFile(options.outputPath, tinyPngFixture());
				return {
					outputPath: options.outputPath,
					widthPx: 1600,
					heightPx: 2263,
				};
			},
		});

		expect(result.files.svgPaths).toHaveLength(12);
		expect(result.audit.errors).toEqual([]);
		expect(result.assetManifest.assets).toHaveLength(1);
		expect(result.assetManifest.assets[0]).toMatchObject({
			assetId: "yue-jiao-ban-yi-nian-ji-xia-ce-page-3",
			pageNumber: 3,
			relativeOutputPath: "yue-jiao-ban-yi-nian-ji-xia-ce-page-3.png",
		});
		expect(await readFile(result.files.svgPaths[5], "utf-8")).toContain(
			"../assets/yue-jiao-ban-yi-nian-ji-xia-ce-page-3.png",
		);
		expect(await readFile(result.files.designSpecPath, "utf-8")).toContain("PPT Master-compatible SVG");
		expect(await readFile(result.files.specLockPath, "utf-8")).toContain("Slides: 12");
		expect(await readFile(result.files.svgQaMarkdownPath, "utf-8")).toContain("Errors: 0");
		expect(await readFile(join(result.files.notesDir, "slide-01.md"), "utf-8")).toContain("Source pages: 3");
	});

	it("resolves one indexed lesson, writes a deck, embeds audio/video, and passes audit", async () => {
		const { projectRoot, audioPath, videoPath, posterPath } = await createFixtureProject();

		const result = await generateMusicDeck(projectRoot, "做三年级上册《小雨沙沙》的教学PPT", {
			media: [
				{
					mediaId: "audio-original",
					kind: "audio",
					sourcePath: audioPath,
					embedMode: "embedded",
					startMode: "on-click",
					display: "icon",
					label: "原唱",
				},
				{
					mediaId: "video-demo",
					kind: "video",
					sourcePath: videoPath,
					embedMode: "embedded",
					startMode: "on-click",
					display: "poster",
					label: "律动示范",
					posterPath,
				},
			],
		});

		expect(result.context.resolution.matches).toHaveLength(1);
		expect(result.storyboard.slides.length).toBeGreaterThanOrEqual(12);
		expect(result.audit.errors).toEqual([]);
		expect(result.audit.media.map((item) => item.embedded)).toEqual([true, true]);
		expect(result.files.pptxPath).toContain(".pi/presentation/projects/");
	});
});
