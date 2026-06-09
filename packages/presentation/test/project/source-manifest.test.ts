import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addPresentationSource,
	getEnabledPresentationSources,
	initializePresentationProject,
	readPresentationSourceManifest,
	resolvePresentationSourcePath,
	writePresentationSourceManifest,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-source-manifest-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	return projectRoot;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("presentation source manifest", () => {
	it("stores enabled guidance and textbook sources with resolvable paths", async () => {
		const projectRoot = await createTempProject();
		await writePresentationSourceManifest(projectRoot, {
			version: 1,
			sources: [
				{
					id: "music-guidance",
					kind: "guidance",
					path: "sources/guidance.pdf",
					title: "Music Guidance",
				},
				{
					id: "disabled-textbook",
					kind: "textbook",
					path: "/tmp/disabled.pdf",
					enabled: false,
				},
			],
		});

		const manifest = await readPresentationSourceManifest(projectRoot);

		expect(getEnabledPresentationSources(manifest).map((source) => source.id)).toEqual(["music-guidance"]);
		expect(resolvePresentationSourcePath(projectRoot, manifest.sources[0])).toBe(
			join(projectRoot, "sources/guidance.pdf"),
		);
	});

	it("adds or replaces a source by id without duplicating entries", async () => {
		const projectRoot = await createTempProject();

		await addPresentationSource(projectRoot, {
			id: "grade1-textbook",
			kind: "textbook",
			path: "/tmp/old.pdf",
			title: "旧教材",
			subject: "music",
		});
		const manifest = await addPresentationSource(projectRoot, {
			id: "grade1-textbook",
			kind: "textbook",
			path: "/tmp/new.pdf",
			title: "粤教版一年级下册",
			subject: "music",
			publisher: "粤教版",
			grade: "一年级",
			volume: "下册",
		});

		expect(manifest.sources).toEqual([
			{
				id: "grade1-textbook",
				kind: "textbook",
				path: "/tmp/new.pdf",
				title: "粤教版一年级下册",
				subject: "music",
				publisher: "粤教版",
				grade: "一年级",
				volume: "下册",
			},
		]);
		expect((await readPresentationSourceManifest(projectRoot)).sources).toHaveLength(1);
	});
});
