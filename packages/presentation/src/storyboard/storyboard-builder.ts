import {
	FORBIDDEN_STUDENT_SLIDE_TERMS,
	scanStudentSlideTextForForbiddenTerms,
} from "../curriculum/forbidden-slide-terms.ts";
import type { MusicLessonContext } from "../lesson/lesson-context-builder.ts";
import type { MusicLessonStoryboard, SlideSpec } from "./slide-spec.ts";

function cleanStudentText(text: string) {
	let cleaned = text;
	for (const term of FORBIDDEN_STUDENT_SLIDE_TERMS) {
		cleaned = cleaned.replaceAll(term, "");
	}
	return cleaned.trim() || "音乐活动";
}

function createSlide(
	index: number,
	title: string,
	layout: SlideSpec["layout"],
	studentVisibleText: string[],
	teacherNotes: string,
	assets: SlideSpec["assets"] = [],
): SlideSpec {
	return {
		slideId: `slide-${index.toString().padStart(2, "0")}`,
		title: cleanStudentText(title),
		studentVisibleText: studentVisibleText.map(cleanStudentText),
		teacherNotes,
		layout,
		assets,
		media: [],
	};
}

function lessonActionText(context: MusicLessonContext) {
	const firstActivity = context.selectedPages.flatMap((page) => page.detectedActivities)[0];
	return firstActivity ? cleanStudentText(firstActivity).slice(0, 18) : "跟着音乐做一做";
}

function createTextbookAssets(context: MusicLessonContext) {
	return context.sourcePdfPageRefs.map((ref) => ({
		assetId: `${ref.bookId}-page-${ref.pageNumber}`,
		kind: "textbook-page" as const,
		role: "main" as const,
	}));
}

export function buildMusicLessonStoryboard(context: MusicLessonContext): MusicLessonStoryboard {
	const title = context.request.title;
	const sourcePages = context.sourcePdfPageRefs.map((ref) => ref.pageNumber).join(", ") || "未匹配教材页";
	const guidanceNotes =
		context.guidance.hiddenContextMarkdown.trim() ||
		"Use default primary music pedagogy when no guidance PDF is indexed.";
	const textbookAssets = createTextbookAssets(context);
	const actionText = lessonActionText(context);
	const slides: SlideSpec[] = [
		createSlide(
			1,
			title,
			"cover",
			["听一听，唱一唱"],
			`Use curriculum and extracted guidance internally. Source pages: ${sourcePages}.\n${guidanceNotes}`,
		),
		createSlide(2, "今天怎么学", "map", ["听", "唱", "拍", "动", "说"], "Preview the classroom flow for pacing."),
		createSlide(
			3,
			"先听音乐",
			"listening",
			["闭眼听：音乐像什么？"],
			"Guide focused listening before naming concepts.",
		),
		createSlide(4, "听见音乐", "listening", ["用手势表现音乐"], "Connect sound imagery with body movement."),
		createSlide(5, "读一读歌词", "song", ["轻声读歌词"], "Keep student-facing text short and projection friendly."),
		createSlide(
			6,
			"找一找旋律",
			"song",
			["看谱例，找相同乐句"],
			"Use textbook score or crop when available.",
			textbookAssets,
		),
		createSlide(
			7,
			"唱一唱第一遍",
			"song",
			["轻声跟唱"],
			"Teacher notes may include pedagogy that is not student-facing.",
		),
		createSlide(8, "拍一拍节奏", "activity", ["拍出歌曲节奏"], "Use call-and-response rhythm practice."),
		createSlide(9, "动一动", "activity", [actionText], "Support movement and cooperative learning."),
		createSlide(10, "分组合作", "activity", ["一组唱，一组拍"], "Keep roles clear for classroom management."),
		createSlide(11, "说一说", "summary", ["我听到了…… 我做到了……"], "Collect quick formative assessment evidence."),
		createSlide(12, "唱给大家听", "ending", ["用歌声结束"], "Close with a full-song performance or reprise."),
	];

	const forbiddenTerms = scanStudentSlideTextForForbiddenTerms(slides);
	if (forbiddenTerms.length > 0) {
		throw new Error(
			`Storyboard contains forbidden student-facing terms: ${forbiddenTerms.map((match) => match.term).join(", ")}`,
		);
	}

	return {
		lessonTitle: title,
		slides,
	};
}
