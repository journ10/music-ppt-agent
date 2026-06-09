import {
	listPptxPackageEntries,
	type MusicLessonStoryboard,
	readPptxPackageText,
	writePptxPackage,
} from "@earendil-works/pi-presentation";
import { describe, expect, it } from "vitest";

function twoSlideStoryboard(): MusicLessonStoryboard {
	return {
		lessonTitle: "小雨沙沙",
		slides: [
			{
				slideId: "slide-01",
				title: "小雨沙沙",
				studentVisibleText: ["听一听，唱一唱"],
				teacherNotes: "Teacher note 1",
				layout: "cover",
				assets: [],
				media: [],
			},
			{
				slideId: "slide-02",
				title: "拍一拍节奏",
				studentVisibleText: ["拍出雨点节奏"],
				teacherNotes: "Teacher note 2",
				layout: "activity",
				assets: [],
				media: [],
			},
		],
	};
}

describe("writePptxPackage", () => {
	it("creates a valid PPTX zip structure with slides, relationships, content types, and metadata", () => {
		const pptx = writePptxPackage(twoSlideStoryboard());

		expect(listPptxPackageEntries(pptx)).toEqual([
			"[Content_Types].xml",
			"_rels/.rels",
			"docProps/app.xml",
			"docProps/core.xml",
			"ppt/_rels/presentation.xml.rels",
			"ppt/presentation.xml",
			"ppt/slides/_rels/slide1.xml.rels",
			"ppt/slides/_rels/slide2.xml.rels",
			"ppt/slides/slide1.xml",
			"ppt/slides/slide2.xml",
		]);
		expect(readPptxPackageText(pptx, "ppt/presentation.xml")).toContain('<p:sldId id="256" r:id="rId1"/>');
		expect(readPptxPackageText(pptx, "ppt/slides/slide1.xml")).toContain("小雨沙沙");
		expect(readPptxPackageText(pptx, "ppt/slides/slide2.xml")).toContain("拍出雨点节奏");
	});
});
