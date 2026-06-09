import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPdfTextPages } from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("extractPdfTextPages", () => {
	it("extracts page text from real PDF content streams", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-pdf-extractor-"));
		tempDirs.push(tempDir);
		const pdfPath = join(tempDir, "人音版-三年级上册.pdf");
		await writeFile(
			pdfPath,
			minimalPdfFixture(["# 第2单元\n《小雨沙沙》\n歌词：小雨沙沙\n谱例：1 2 3", "# 聆听活动\n拍一拍节奏"]),
		);

		const pages = await extractPdfTextPages(pdfPath);

		expect(pages).toEqual([
			{
				pageNumber: 1,
				text: "# 第2单元\n《小雨沙沙》\n歌词：小雨沙沙\n谱例：1 2 3",
			},
			{
				pageNumber: 2,
				text: "# 聆听活动\n拍一拍节奏",
			},
		]);
	});
});
