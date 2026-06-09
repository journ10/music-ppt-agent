import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildMediaManifest,
	listPptxPackageEntries,
	type MusicLessonStoryboard,
	probeMediaFile,
	readPptxPackageText,
	writePptxPackageWithMedia,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { tinyMp3Fixture, tinyMp4Fixture, tinyPngFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createMediaStoryboard() {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-media-embedder-"));
	tempDirs.push(tempDir);
	const audioPath = join(tempDir, "rain.mp3");
	const videoPath = join(tempDir, "movement.mp4");
	const posterPath = join(tempDir, "poster.png");
	await writeFile(audioPath, tinyMp3Fixture());
	await writeFile(videoPath, tinyMp4Fixture());
	await writeFile(posterPath, tinyPngFixture());

	const storyboard: MusicLessonStoryboard = {
		lessonTitle: "小雨沙沙",
		slides: [
			{
				slideId: "slide-01",
				title: "小雨沙沙",
				studentVisibleText: ["听一听"],
				teacherNotes: "Play original audio.",
				layout: "listening",
				assets: [],
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
				],
			},
			{
				slideId: "slide-02",
				title: "律动示范",
				studentVisibleText: ["看一看"],
				teacherNotes: "Play movement video.",
				layout: "activity",
				assets: [],
				media: [
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
			},
		],
	};

	return { storyboard, audioPath, videoPath };
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("media embedding", () => {
	it("probes supported local media formats", async () => {
		const { audioPath, videoPath } = await createMediaStoryboard();

		expect(await probeMediaFile(audioPath)).toMatchObject({ kind: "audio", extension: "mp3", supported: true });
		expect(await probeMediaFile(videoPath)).toMatchObject({ kind: "video", extension: "mp4", supported: true });
	});

	it("builds a media manifest from storyboard slide media", async () => {
		const { storyboard } = await createMediaStoryboard();

		expect(buildMediaManifest(storyboard).items).toEqual([
			expect.objectContaining({ mediaId: "audio-original", slideId: "slide-01", kind: "audio", embedded: true }),
			expect.objectContaining({ mediaId: "video-demo", slideId: "slide-02", kind: "video", embedded: true }),
		]);
	});

	it("embeds MP3 and MP4 files into ppt/media with visual placeholders and slide relationships", async () => {
		const { storyboard } = await createMediaStoryboard();

		const pptx = await writePptxPackageWithMedia(storyboard);

		expect(listPptxPackageEntries(pptx)).toContain("ppt/media/media1.mp3");
		expect(listPptxPackageEntries(pptx)).toContain("ppt/media/audio-icon1.png");
		expect(listPptxPackageEntries(pptx)).toContain("ppt/media/media2.mp4");
		expect(listPptxPackageEntries(pptx)).toContain("ppt/media/poster2.png");
		expect(readPptxPackageText(pptx, "ppt/slides/_rels/slide1.xml.rels")).toContain("../media/media1.mp3");
		expect(readPptxPackageText(pptx, "ppt/slides/_rels/slide2.xml.rels")).toContain("../media/media2.mp4");
		expect(readPptxPackageText(pptx, "ppt/slides/slide1.xml")).toContain("ppaction://media");
		expect(readPptxPackageText(pptx, "ppt/slides/slide2.xml")).toContain("律动示范");
	});
});
