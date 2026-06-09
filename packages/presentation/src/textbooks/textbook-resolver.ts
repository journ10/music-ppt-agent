import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPresentationProjectPaths } from "../project/presentation-config.ts";
import type {
	LessonResolutionRequest,
	ResolvedTextbookLesson,
	TextbookIndex,
	TextbookLessonIndex,
	TextbookLessonResolution,
} from "./textbook-types.ts";

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf-8")) as T;
}

function metadataMatches(request: LessonResolutionRequest, lesson: ResolvedTextbookLesson) {
	return (
		(!request.grade || lesson.grade === request.grade) &&
		(!request.volume || lesson.volume === request.volume) &&
		(!request.publisher || lesson.publisher === request.publisher)
	);
}

export async function resolveTextbookLesson(
	projectRoot: string,
	request: LessonResolutionRequest,
): Promise<TextbookLessonResolution> {
	const paths = getPresentationProjectPaths(projectRoot);
	const index = await readJson<TextbookIndex>(paths.textbookIndex);
	const matches: ResolvedTextbookLesson[] = [];

	for (const book of index.books) {
		const lessons = await readJson<TextbookLessonIndex[]>(join(paths.presentationRoot, book.unitsIndexPath));
		for (const lesson of lessons) {
			if (!lesson.lessonTitle.includes(request.title) && !request.title.includes(lesson.lessonTitle)) {
				continue;
			}
			const resolvedLesson: ResolvedTextbookLesson = {
				...lesson,
				bookId: book.bookId,
				bookTitle: book.title,
				publisher: book.publisher,
				grade: book.grade,
				volume: book.volume,
				pagesIndexPath: book.pagesIndexPath,
				unitsIndexPath: book.unitsIndexPath,
			};
			if (metadataMatches(request, resolvedLesson)) {
				matches.push(resolvedLesson);
			}
		}
	}

	return {
		matches: matches.sort((a, b) => a.bookId.localeCompare(b.bookId)),
		ambiguous: matches.length > 1,
	};
}
