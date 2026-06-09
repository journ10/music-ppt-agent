import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCurriculumContext } from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-curriculum-loader-"));
	tempDirs.push(projectRoot);
	return projectRoot;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadCurriculumContext", () => {
	it("reads all Markdown files under the curriculum folder in deterministic order", async () => {
		const projectRoot = await createTempProject();
		const curriculumRoot = join(projectRoot, ".pi", "presentation", "curriculum");
		await mkdir(join(curriculumRoot, "nested"), { recursive: true });
		await writeFile(join(curriculumRoot, "teaching-guidance.md"), "# Teaching\n课堂活动建议\n", "utf-8");
		await writeFile(join(curriculumRoot, "primary-music-curriculum.md"), "# Curriculum\n核心要求\n", "utf-8");
		await writeFile(join(curriculumRoot, "nested", "extra.md"), "# Extra\n补充建议\n", "utf-8");
		await writeFile(join(curriculumRoot, "notes.txt"), "ignore me", "utf-8");

		const context = await loadCurriculumContext(projectRoot);

		expect(context.warnings).toEqual([]);
		expect(context.files.map((file) => file.relativePath)).toEqual([
			"nested/extra.md",
			"primary-music-curriculum.md",
			"teaching-guidance.md",
		]);
		expect(context.combinedMarkdown).toContain("# Extra\n补充建议");
		expect(context.combinedMarkdown).toContain("# Curriculum\n核心要求");
		expect(context.combinedMarkdown).toContain("# Teaching\n课堂活动建议");
		expect(context.combinedMarkdown).not.toContain("ignore me");
	});

	it("returns an empty context with a warning when the curriculum folder is missing", async () => {
		const projectRoot = await createTempProject();

		const context = await loadCurriculumContext(projectRoot);

		expect(context.files).toEqual([]);
		expect(context.combinedMarkdown).toBe("");
		expect(context.warnings).toHaveLength(1);
		expect(context.warnings[0]).toContain("Missing curriculum folder");
	});
});
