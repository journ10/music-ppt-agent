import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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

	it("falls back to a pypdf-compatible Python extractor when content streams have no text", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-pdf-extractor-"));
		tempDirs.push(tempDir);
		const pdfPath = join(tempDir, "empty-streams.pdf");
		const pythonPath = join(tempDir, "fake-python.js");
		await writeFile(pdfPath, minimalPdfFixture([""]));
		await writeFile(
			pythonPath,
			'#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([{ pageNumber: 1, text: "来自pypdf" }]));\n',
			"utf-8",
		);
		await chmod(pythonPath, 0o755);
		const previousPython = process.env.PI_PRESENTATION_PYPDF_PYTHON;
		process.env.PI_PRESENTATION_PYPDF_PYTHON = pythonPath;

		try {
			const pages = await extractPdfTextPages(pdfPath);

			expect(pages).toEqual([{ pageNumber: 1, text: "来自pypdf" }]);
		} finally {
			if (previousPython === undefined) {
				delete process.env.PI_PRESENTATION_PYPDF_PYTHON;
			} else {
				process.env.PI_PRESENTATION_PYPDF_PYTHON = previousPython;
			}
		}
	});

	it("falls back to macOS Vision OCR when PDF text extractors return blank pages", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-pdf-extractor-"));
		tempDirs.push(tempDir);
		const pdfPath = join(tempDir, "scanned.pdf");
		const pythonPath = join(tempDir, "fake-python.js");
		const swiftPath = join(tempDir, "fake-swift.js");
		await writeFile(pdfPath, minimalPdfFixture([""]));
		await writeFile(
			pythonPath,
			'#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([{ pageNumber: 1, text: "" }]));\n',
			"utf-8",
		);
		await writeFile(
			swiftPath,
			'#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([{ pageNumber: 1, text: "OCR指导思想" }]));\n',
			"utf-8",
		);
		await chmod(pythonPath, 0o755);
		await chmod(swiftPath, 0o755);
		const previousPython = process.env.PI_PRESENTATION_PYPDF_PYTHON;
		const previousSwift = process.env.PI_PRESENTATION_VISION_OCR_SWIFT;
		process.env.PI_PRESENTATION_PYPDF_PYTHON = pythonPath;
		process.env.PI_PRESENTATION_VISION_OCR_SWIFT = swiftPath;

		try {
			const pages = await extractPdfTextPages(pdfPath);

			expect(pages).toEqual([{ pageNumber: 1, text: "OCR指导思想" }]);
		} finally {
			if (previousPython === undefined) {
				delete process.env.PI_PRESENTATION_PYPDF_PYTHON;
			} else {
				process.env.PI_PRESENTATION_PYPDF_PYTHON = previousPython;
			}
			if (previousSwift === undefined) {
				delete process.env.PI_PRESENTATION_VISION_OCR_SWIFT;
			} else {
				process.env.PI_PRESENTATION_VISION_OCR_SWIFT = previousSwift;
			}
		}
	});
});
