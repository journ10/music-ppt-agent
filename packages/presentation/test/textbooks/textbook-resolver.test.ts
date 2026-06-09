import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexTextbooks, initializePresentationProject, resolveTextbookLesson } from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-textbook-resolver-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	return projectRoot;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveTextbookLesson", () => {
	it("matches lesson title against indexed lessons and pages", async () => {
		const projectRoot = await createTempProject();
		const pdfPath = join(projectRoot, ".pi", "presentation", "textbooks", "人音版-三年级上册.pdf");
		await writeFile(pdfPath, minimalPdfFixture(["# 第2单元\n《小雨沙沙》", "节奏练习"]));
		await indexTextbooks(projectRoot);

		const result = await resolveTextbookLesson(projectRoot, {
			title: "小雨沙沙",
			grade: "三年级",
			volume: "上册",
		});

		expect(result.matches).toEqual([
			expect.objectContaining({
				bookId: "ren-yin-ban-san-nian-ji-shang-ce",
				lessonTitle: "小雨沙沙",
				pageStart: 1,
				pageEnd: 2,
				confidence: "high",
			}),
		]);
		expect(result.ambiguous).toBe(false);
	});

	it("marks multiple comparable matches as ambiguous", async () => {
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

		const result = await resolveTextbookLesson(projectRoot, { title: "小雨沙沙" });

		expect(result.matches).toHaveLength(2);
		expect(result.ambiguous).toBe(true);
	});
});
