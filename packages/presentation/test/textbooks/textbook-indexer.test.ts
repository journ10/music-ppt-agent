import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexTextbooks, initializePresentationProject } from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-textbook-indexer-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	return projectRoot;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("indexTextbooks", () => {
	it("hashes PDF files and writes deterministic page and lesson indexes", async () => {
		const projectRoot = await createTempProject();
		const pdfPath = join(projectRoot, ".pi", "presentation", "textbooks", "人音版-三年级上册.pdf");
		await writeFile(
			pdfPath,
			minimalPdfFixture(["# 第2单元\n《小雨沙沙》\n歌词：小雨沙沙\n谱例：1 2 3", "# 聆听活动\n拍一拍节奏"]),
		);

		const result = await indexTextbooks(projectRoot, { generatedAt: "2026-06-09T00:00:00.000Z" });

		expect(result.index.books).toHaveLength(1);
		expect(result.index.books[0]).toMatchObject({
			title: "人音版-三年级上册",
			subject: "music",
			publisher: "人音版",
			grade: "三年级",
			volume: "上册",
			pageCount: 2,
			pagesIndexPath: "index/pages/ren-yin-ban-san-nian-ji-shang-ce.pages.json",
			unitsIndexPath: "index/units/ren-yin-ban-san-nian-ji-shang-ce.units.json",
		});
		expect(result.index.generatedAt).toBe("2026-06-09T00:00:00.000Z");
		expect(result.indexedBookIds).toEqual(["ren-yin-ban-san-nian-ji-shang-ce"]);
		expect(result.skippedBookIds).toEqual([]);

		const pages = JSON.parse(
			await readFile(
				join(projectRoot, ".pi", "presentation", "index", "pages", "ren-yin-ban-san-nian-ji-shang-ce.pages.json"),
				"utf-8",
			),
		);
		expect(pages).toEqual([
			{
				pageNumber: 1,
				text: "# 第2单元\n《小雨沙沙》\n歌词：小雨沙沙\n谱例：1 2 3",
				headings: ["第2单元"],
				detectedSongs: ["小雨沙沙"],
				detectedActivities: [],
				hasScore: true,
				hasLyrics: true,
				hasImage: false,
			},
			{
				pageNumber: 2,
				text: "# 聆听活动\n拍一拍节奏",
				headings: ["聆听活动"],
				detectedSongs: [],
				detectedActivities: ["聆听活动", "拍一拍节奏"],
				hasScore: false,
				hasLyrics: false,
				hasImage: false,
			},
		]);

		const lessons = JSON.parse(
			await readFile(
				join(projectRoot, ".pi", "presentation", "index", "units", "ren-yin-ban-san-nian-ji-shang-ce.units.json"),
				"utf-8",
			),
		);
		expect(lessons).toEqual([
			{
				lessonId: "ren-yin-ban-san-nian-ji-shang-ce-xiao-yu-sha-sha",
				unitTitle: "第2单元",
				lessonTitle: "小雨沙沙",
				pageStart: 1,
				pageEnd: 2,
				songs: ["小雨沙沙"],
				activities: ["聆听活动", "拍一拍节奏"],
				confidence: "high",
			},
		]);
	});

	it("skips unchanged PDF files without extracting them again", async () => {
		const projectRoot = await createTempProject();
		const pdfPath = join(projectRoot, ".pi", "presentation", "textbooks", "三年级上册.pdf");
		await writeFile(pdfPath, minimalPdfFixture(["《小雨沙沙》"]));
		await indexTextbooks(projectRoot);

		const result = await indexTextbooks(projectRoot, {
			extractPdfText: async () => {
				throw new Error("extractor should not run for unchanged PDFs");
			},
		});

		expect(result.indexedBookIds).toEqual([]);
		expect(result.skippedBookIds).toEqual(["san-nian-ji-shang-ce"]);
	});

	it("indexes explicitly supplied PDF paths outside the textbook folder", async () => {
		const projectRoot = await createTempProject();
		const sourceDir = await mkdtemp(join(tmpdir(), "pi-textbook-source-"));
		tempDirs.push(sourceDir);
		const pdfPath = join(sourceDir, "粤教版-四年级下册.pdf");
		await writeFile(pdfPath, minimalPdfFixture(["《春晓》\n图片：插图"]));

		const result = await indexTextbooks(projectRoot, { pdfPaths: [pdfPath] });

		expect(result.index.books[0]).toMatchObject({
			bookId: "yue-jiao-ban-si-nian-ji-xia-ce",
			title: "粤教版-四年级下册",
			publisher: "粤教版",
			grade: "四年级",
			volume: "下册",
		});
	});
});
