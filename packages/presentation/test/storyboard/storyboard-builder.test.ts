import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildMusicLessonContext,
	buildMusicLessonStoryboard,
	indexTextbooks,
	initializePresentationProject,
	scanStudentSlideTextForForbiddenTerms,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { minimalPdfFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createLessonContext() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-storyboard-"));
	tempDirs.push(projectRoot);
	await initializePresentationProject(projectRoot);
	await writeFile(
		join(projectRoot, ".pi", "presentation", "textbooks", "人音版-三年级上册.pdf"),
		minimalPdfFixture(["# 第2单元\n《小雨沙沙》\n歌词：小雨沙沙\n谱例：1 2 3", "# 聆听活动\n拍一拍节奏"]),
	);
	await indexTextbooks(projectRoot);
	return buildMusicLessonContext(projectRoot, "做三年级上册《小雨沙沙》的教学PPT");
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("buildMusicLessonStoryboard", () => {
	it("builds a default 12-slide storyboard with separate student text and teacher notes", async () => {
		const context = await createLessonContext();

		const storyboard = buildMusicLessonStoryboard(context);

		expect(storyboard.slides.length).toBeGreaterThanOrEqual(12);
		expect(storyboard.slides.length).toBeLessThanOrEqual(18);
		expect(storyboard.slides[0]).toMatchObject({
			layout: "cover",
			title: "小雨沙沙",
			studentVisibleText: ["听一听，唱一唱"],
		});
		expect(storyboard.slides.every((slide) => slide.teacherNotes.length > 0)).toBe(true);
		expect(storyboard.slides.every((slide) => slide.studentVisibleText.length > 0)).toBe(true);
	});

	it("keeps forbidden curriculum terms out of student-visible text", async () => {
		const context = await createLessonContext();

		const storyboard = buildMusicLessonStoryboard(context);

		expect(
			scanStudentSlideTextForForbiddenTerms(
				storyboard.slides.map((slide) => ({
					slideId: slide.slideId,
					title: slide.title,
					studentVisibleText: slide.studentVisibleText,
					teacherNotes: slide.teacherNotes,
				})),
			),
		).toEqual([]);
	});
});
