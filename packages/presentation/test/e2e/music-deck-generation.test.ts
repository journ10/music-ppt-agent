import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMusicDeck, indexTextbooks, initializePresentationProject } from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture, tinyMp3Fixture, tinyMp4Fixture, tinyPngFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createFixtureProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-e2e-music-deck-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	await writeFile(
		join(projectRoot, ".pi", "presentation", "textbooks", "人音版-三年级上册.pdf"),
		minimalPdfFixture(["# 第2单元\n《小雨沙沙》\n歌词：小雨沙沙\n谱例：1 2 3", "# 聆听活动\n拍一拍节奏"]),
	);
	const audioPath = join(projectRoot, "rain.mp3");
	const videoPath = join(projectRoot, "movement.mp4");
	const posterPath = join(projectRoot, "poster.png");
	await writeFile(audioPath, tinyMp3Fixture());
	await writeFile(videoPath, tinyMp4Fixture());
	await writeFile(posterPath, tinyPngFixture());
	await indexTextbooks(projectRoot);
	return { projectRoot, audioPath, videoPath, posterPath };
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("generateMusicDeck", () => {
	it("resolves one indexed lesson, writes a deck, embeds audio/video, and passes audit", async () => {
		const { projectRoot, audioPath, videoPath, posterPath } = await createFixtureProject();

		const result = await generateMusicDeck(projectRoot, "做三年级上册《小雨沙沙》的教学PPT", {
			media: [
				{
					mediaId: "audio-original",
					kind: "audio",
					sourcePath: audioPath,
					embedMode: "embedded",
					startMode: "on-click",
					display: "icon",
					label: "原唱",
				},
				{
					mediaId: "video-demo",
					kind: "video",
					sourcePath: videoPath,
					embedMode: "embedded",
					startMode: "on-click",
					display: "poster",
					label: "律动示范",
					posterPath,
				},
			],
		});

		expect(result.context.resolution.matches).toHaveLength(1);
		expect(result.storyboard.slides.length).toBeGreaterThanOrEqual(12);
		expect(result.audit.errors).toEqual([]);
		expect(result.audit.media.map((item) => item.embedded)).toEqual([true, true]);
		expect(result.files.pptxPath).toContain(".pi/presentation/projects/");
	});
});
