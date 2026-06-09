import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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
});
