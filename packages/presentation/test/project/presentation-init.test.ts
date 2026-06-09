import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_LEARNED_REQUIREMENTS,
	DEFAULT_PPT_REQUIREMENTS,
	initializePresentationProject,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-presentation-init-"));
	tempDirs.push(projectRoot);
	return projectRoot;
}

async function readProjectFile(projectRoot: string, path: string) {
	return readFile(join(projectRoot, ".pi", "presentation", path), "utf-8");
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("initializePresentationProject", () => {
	it("creates the full presentation tree with default requirements", async () => {
		const projectRoot = await createTempProject();

		const result = await initializePresentationProject(projectRoot);

		expect(result.presentationRoot).toBe(join(projectRoot, ".pi", "presentation"));
		expect(result.createdFiles.sort()).toEqual([
			"PPT.md",
			"curriculum/primary-music-curriculum.md",
			"curriculum/teaching-guidance.md",
			"index/textbooks.index.json",
			"memory/learned-requirements.md",
			"textbooks/put-textbook-pdfs-here.md",
		]);
		expect(result.createdDirectories.sort()).toEqual([
			"curriculum",
			"index",
			"index/pages",
			"index/units",
			"memory",
			"projects",
			"templates",
			"templates/primary-music-default",
			"textbooks",
		]);
		expect(await readProjectFile(projectRoot, "PPT.md")).toBe(DEFAULT_PPT_REQUIREMENTS);
		expect(await readProjectFile(projectRoot, "curriculum/primary-music-curriculum.md")).toContain(
			"# Primary Music Curriculum Guidance",
		);
		expect(await readProjectFile(projectRoot, "curriculum/teaching-guidance.md")).toContain("# Teaching Guidance");
		expect(await readProjectFile(projectRoot, "memory/learned-requirements.md")).toBe(DEFAULT_LEARNED_REQUIREMENTS);
		expect(JSON.parse(await readProjectFile(projectRoot, "index/textbooks.index.json"))).toEqual({
			version: 1,
			books: [],
			generatedAt: "1970-01-01T00:00:00.000Z",
		});
	});

	it("is idempotent and does not overwrite existing user requirements", async () => {
		const projectRoot = await createTempProject();
		await initializePresentationProject(projectRoot);
		await writeFile(join(projectRoot, ".pi", "presentation", "PPT.md"), "# Custom PPT rules\n", "utf-8");
		await writeFile(
			join(projectRoot, ".pi", "presentation", "memory", "learned-requirements.md"),
			"# Custom memory\n",
			"utf-8",
		);

		const result = await initializePresentationProject(projectRoot);

		expect(result.createdFiles).toEqual([]);
		expect(await readProjectFile(projectRoot, "PPT.md")).toBe("# Custom PPT rules\n");
		expect(await readProjectFile(projectRoot, "memory/learned-requirements.md")).toBe("# Custom memory\n");
	});

	it("recreates missing learned requirements memory without touching PPT.md", async () => {
		const projectRoot = await createTempProject();
		await initializePresentationProject(projectRoot);
		await writeFile(join(projectRoot, ".pi", "presentation", "PPT.md"), "# Keep me\n", "utf-8");
		await rm(join(projectRoot, ".pi", "presentation", "memory", "learned-requirements.md"));

		const result = await initializePresentationProject(projectRoot);

		expect(result.createdFiles).toEqual(["memory/learned-requirements.md"]);
		expect(await readProjectFile(projectRoot, "PPT.md")).toBe("# Keep me\n");
		expect(await readProjectFile(projectRoot, "memory/learned-requirements.md")).toBe(DEFAULT_LEARNED_REQUIREMENTS);
	});
});
