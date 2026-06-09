import { scanStudentSlideTextForForbiddenTerms } from "@earendil-works/pi-presentation";
import { describe, expect, it } from "vitest";

describe("scanStudentSlideTextForForbiddenTerms", () => {
	it("reports forbidden curriculum terms in student-visible titles and text", () => {
		const matches = scanStudentSlideTextForForbiddenTerms([
			{
				slideId: "slide-1",
				title: "课程标准导入",
				studentVisibleText: ["听一听音乐的强弱变化"],
			},
			{
				slideId: "slide-2",
				title: "小雨沙沙",
				studentVisibleText: ["用动作表现审美感知"],
			},
		]);

		expect(matches).toEqual([
			{ slideId: "slide-1", field: "title", term: "课程标准" },
			{ slideId: "slide-2", field: "studentVisibleText", term: "审美感知" },
		]);
	});

	it("ignores teacher notes because they are not student-facing", () => {
		const matches = scanStudentSlideTextForForbiddenTerms([
			{
				slideId: "slide-1",
				title: "听辨节奏",
				studentVisibleText: ["听一听，拍一拍"],
				teacherNotes: "这里体现核心素养，但不展示给学生。",
			},
		]);

		expect(matches).toEqual([]);
	});
});
