import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildMusicLessonContext,
	indexTextbooks,
	initializePresentationProject,
	rebuildGuidanceIndex,
	writePresentationSourceManifest,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-lesson-context-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	return projectRoot;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("buildMusicLessonContext", () => {
	it("combines request, requirements, memory, curriculum, textbook match, and relevant pages", async () => {
		const projectRoot = await createTempProject();
		await writeFile(join(projectRoot, ".pi", "presentation", "PPT.md"), "# Custom PPT\n短文字\n", "utf-8");
		await writeFile(
			join(projectRoot, ".pi", "presentation", "memory", "learned-requirements.md"),
			"# Learned\n偏好蓝色\n",
			"utf-8",
		);
		await writeFile(
			join(projectRoot, ".pi", "presentation", "curriculum", "teaching-guidance.md"),
			"# Guide\n课堂律动\n",
			"utf-8",
		);
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "人音版-三年级上册.pdf"),
			minimalPdfFixture(["# 第2单元\n《小雨沙沙》\n歌词", "节奏练习"]),
		);
		const guidancePath = join(projectRoot, "guidance.pdf");
		await writeFile(guidancePath, minimalPdfFixture(["音乐课堂重视聆听、情感体验和小组合作。"]));
		await writePresentationSourceManifest(projectRoot, {
			version: 1,
			sources: [{ id: "guidance", kind: "guidance", path: guidancePath, title: "指导思想" }],
		});
		await rebuildGuidanceIndex(projectRoot);
		await indexTextbooks(projectRoot);

		const context = await buildMusicLessonContext(projectRoot, "做三年级上册《小雨沙沙》的教学PPT");

		expect(context.request).toMatchObject({ title: "小雨沙沙", grade: "三年级", volume: "上册" });
		expect(context.pptRequirements).toBe("# Custom PPT\n短文字\n");
		expect(context.learnedRequirements).toBe("# Learned\n偏好蓝色\n");
		expect(context.curriculum.combinedMarkdown).toContain("课堂律动");
		expect(context.guidance.sources[0]).toMatchObject({ sourceId: "guidance", status: "indexed" });
		expect(context.resolution.matches).toHaveLength(1);
		expect(context.selectedPages.map((page) => page.pageNumber)).toEqual([1, 2]);
		expect(context.sourcePdfPageRefs).toEqual([
			{ bookId: "ren-yin-ban-san-nian-ji-shang-ce", pageNumber: 1 },
			{ bookId: "ren-yin-ban-san-nian-ji-shang-ce", pageNumber: 2 },
		]);
	});

	it("represents ambiguous textbook matches without selecting pages", async () => {
		const projectRoot = await createTempProject();
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "A版-三年级上册.pdf"),
			minimalPdfFixture(["《小雨沙沙》"]),
		);
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "B版-三年级上册.pdf"),
			minimalPdfFixture(["《小雨沙沙》"]),
		);
		await indexTextbooks(projectRoot);

		const context = await buildMusicLessonContext(projectRoot, "做《小雨沙沙》的PPT");

		expect(context.resolution.ambiguous).toBe(true);
		expect(context.resolution.matches).toHaveLength(2);
		expect(context.selectedPages).toEqual([]);
		expect(context.sourcePdfPageRefs).toEqual([]);
	});
});
