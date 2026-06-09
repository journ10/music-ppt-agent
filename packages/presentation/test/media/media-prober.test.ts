import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeMediaFile } from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { tinyMp3Fixture, tinyMp4Fixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function tempMediaPath(fileName: string, contents: Buffer) {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-media-prober-"));
	tempDirs.push(tempDir);
	const filePath = join(tempDir, fileName);
	await writeFile(filePath, contents);
	return filePath;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("probeMediaFile", () => {
	it("accepts supported extensions only when the file signature matches", async () => {
		const audioPath = await tempMediaPath("rain.mp3", tinyMp3Fixture());
		const videoPath = await tempMediaPath("movement.mp4", tinyMp4Fixture());

		expect(await probeMediaFile(audioPath)).toMatchObject({
			kind: "audio",
			extension: "mp3",
			supported: true,
			warnings: [],
		});
		expect(await probeMediaFile(videoPath)).toMatchObject({
			kind: "video",
			extension: "mp4",
			supported: true,
			warnings: [],
		});
	});

	it("rejects fake media bytes even when the extension is supported", async () => {
		const audioPath = await tempMediaPath("rain.mp3", Buffer.from("fake mp3"));
		const videoPath = await tempMediaPath("movement.mp4", Buffer.from("fake mp4"));

		expect(await probeMediaFile(audioPath)).toMatchObject({
			kind: "audio",
			extension: "mp3",
			supported: false,
			warnings: ["Media signature does not match .mp3"],
		});
		expect(await probeMediaFile(videoPath)).toMatchObject({
			kind: "video",
			extension: "mp4",
			supported: false,
			warnings: ["Media signature does not match .mp4"],
		});
	});
});
