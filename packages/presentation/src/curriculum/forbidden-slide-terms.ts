export const FORBIDDEN_STUDENT_SLIDE_TERMS = [
	"指导思想",
	"习近平新时代中国特色社会主义思想",
	"立德树人",
	"核心素养",
	"课程性质",
	"课程理念",
	"审美感知",
	"艺术表现",
	"创意实践",
	"文化理解",
	"教学建议",
	"评价建议",
	"课程标准",
] as const;

export type StudentSlideText = {
	slideId: string;
	title?: string;
	studentVisibleText: string[];
	teacherNotes?: string;
};

export type ForbiddenStudentSlideTermMatch = {
	slideId: string;
	field: "title" | "studentVisibleText";
	term: (typeof FORBIDDEN_STUDENT_SLIDE_TERMS)[number];
};

export function scanStudentSlideTextForForbiddenTerms(
	slides: readonly StudentSlideText[],
): ForbiddenStudentSlideTermMatch[] {
	const matches: ForbiddenStudentSlideTermMatch[] = [];

	for (const slide of slides) {
		for (const term of FORBIDDEN_STUDENT_SLIDE_TERMS) {
			if (slide.title?.includes(term)) {
				matches.push({ slideId: slide.slideId, field: "title", term });
			}
			if (slide.studentVisibleText.some((text) => text.includes(term))) {
				matches.push({ slideId: slide.slideId, field: "studentVisibleText", term });
			}
		}
	}

	return matches;
}
