import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	extractGuidanceSources,
	initializePresentationProject,
	loadGuidanceIndex,
	rebuildGuidanceIndex,
	writePresentationSourceManifest,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-guidance-extractor-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	return projectRoot;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("guidance extractor", () => {
	it("extracts hidden teaching constraints from manifest guidance PDFs", async () => {
		const projectRoot = await createTempProject();
		const guidancePath = join(projectRoot, "guidance.pdf");
		await writeFile(
			guidancePath,
			minimalPdfFixture([
				"音乐课堂要重视聆听、审美感受和情感体验。",
				"通过小组合作、节奏拍击、律动和家庭延伸实践活动组织学习。",
			]),
		);
		await writePresentationSourceManifest(projectRoot, {
			version: 1,
			sources: [
				{
					id: "guidance-1",
					kind: "guidance",
					path: guidancePath,
					title: "小学音乐指导思想",
				},
			],
		});

		const index = await rebuildGuidanceIndex(projectRoot, { generatedAt: "2026-06-09T00:00:00.000Z" });
		const loaded = await loadGuidanceIndex(projectRoot);

		expect(index.generatedAt).toBe("2026-06-09T00:00:00.000Z");
		expect(loaded.sources).toHaveLength(1);
		expect(loaded.sources[0]).toMatchObject({
			sourceId: "guidance-1",
			title: "小学音乐指导思想",
			status: "indexed",
			pageCount: 2,
		});
		expect(loaded.sources[0].constraints.map((constraint) => constraint.kind)).toEqual([
			"activity",
			"emotion",
			"cooperation",
			"aesthetic-listening",
			"performance",
			"home-connection",
		]);
		expect(loaded.hiddenContextMarkdown).toContain("Do not copy source-policy wording");
	});

	it("reports missing text without failing the whole guidance index", async () => {
		const projectRoot = await createTempProject();

		const index = await extractGuidanceSources(projectRoot, {
			manifest: {
				version: 1,
				sources: [{ id: "empty", kind: "guidance", path: "empty.pdf" }],
			},
			extractPdfText: async () => [],
			generatedAt: "2026-06-09T00:00:00.000Z",
		});

		expect(index.sources[0]).toMatchObject({ status: "missing-text", pageCount: 0 });
		expect(index.warnings[0]).toContain("produced no extractable text");
	});
});
