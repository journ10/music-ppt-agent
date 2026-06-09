import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	auditPptxPackage,
	buildMediaManifest,
	formatPptxAuditMarkdown,
	type MusicLessonStoryboard,
	writePptxPackage,
	writePptxPackageWithMedia,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { tinyMp3Fixture, tinyMp4Fixture, tinyPngFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

function storyboardWithTitle(title: string): MusicLessonStoryboard {
	return {
		lessonTitle: title,
		slides: [
			{
				slideId: "slide-01",
				title,
				studentVisibleText: ["听一听"],
				teacherNotes: "Notes",
				layout: "cover",
				assets: [],
				media: [],
			},
		],
	};
}

async function mediaStoryboard() {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-audit-media-"));
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
				title: "听音乐",
				studentVisibleText: ["听一听"],
				teacherNotes: "Audio",
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
				title: "看视频",
				studentVisibleText: ["看一看"],
				teacherNotes: "Video",
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
	return storyboard;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("auditPptxPackage", () => {
	it("reports forbidden terms in slide text", () => {
		const report = auditPptxPackage(writePptxPackage(storyboardWithTitle("课程标准")), { expectedSlideCount: 1 });

		expect(report.zipValid).toBe(true);
		expect(report.forbiddenTerms).toEqual([{ slideId: "slide1", term: "课程标准" }]);
		expect(report.errors).toContain("Forbidden student-facing terms found.");
	});

	it("validates embedded media package parts, content types, relationships, and placeholders", async () => {
		const storyboard = await mediaStoryboard();
		const report = auditPptxPackage(await writePptxPackageWithMedia(storyboard), {
			expectedSlideCount: 2,
			mediaManifest: buildMediaManifest(storyboard),
		});

		expect(report.media).toEqual([
			{
				mediaId: "audio-original",
				kind: "audio",
				embedded: true,
				contentTypePresent: true,
				relationshipPresent: true,
				visualPlaceholderPresent: true,
			},
			{
				mediaId: "video-demo",
				kind: "video",
				embedded: true,
				contentTypePresent: true,
				relationshipPresent: true,
				visualPlaceholderPresent: true,
			},
		]);
		expect(report.errors).toEqual([]);
		expect(JSON.parse(JSON.stringify(report))).toMatchObject({ zipValid: true, slideCount: 2 });
		expect(formatPptxAuditMarkdown(report)).toContain("Zip valid: yes");
	});

	it("fails when an embedded media manifest item is not embedded in the PPTX package", async () => {
		const storyboard = await mediaStoryboard();
		const report = auditPptxPackage(writePptxPackage(storyboard), {
			expectedSlideCount: 2,
			mediaManifest: buildMediaManifest(storyboard),
		});

		expect(report.media[0].embedded).toBe(false);
		expect(report.media[0].relationshipPresent).toBe(false);
		expect(report.errors).toContain("Embedded media audio-original is missing from ppt/media.");
	});
});
