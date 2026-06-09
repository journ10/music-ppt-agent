import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type CurriculumContext, loadCurriculumContext } from "../curriculum/curriculum-loader.ts";
import { type GuidanceIndex, loadGuidanceIndex } from "../curriculum/guidance-extractor.ts";
import { getPresentationProjectPaths } from "../project/presentation-config.ts";
import { resolveTextbookLesson } from "../textbooks/textbook-resolver.ts";
import type { TextbookLessonResolution, TextbookPageIndex } from "../textbooks/textbook-types.ts";
import { type NormalizedMusicLessonRequest, normalizeMusicLessonRequest } from "./lesson-request.ts";

export type SourcePdfPageRef = {
	bookId: string;
	pageNumber: number;
};

export type MusicLessonContext = {
	request: NormalizedMusicLessonRequest;
	pptRequirements: string;
	learnedRequirements: string;
	curriculum: CurriculumContext;
	guidance: GuidanceIndex;
	resolution: TextbookLessonResolution;
	selectedPages: TextbookPageIndex[];
	sourcePdfPageRefs: SourcePdfPageRef[];
};

async function readText(path: string) {
	return readFile(path, "utf-8");
}

export async function buildMusicLessonContext(projectRoot: string, rawRequest: string): Promise<MusicLessonContext> {
	const paths = getPresentationProjectPaths(projectRoot);
	const request = normalizeMusicLessonRequest(rawRequest);
	const [pptRequirements, learnedRequirements, curriculum, guidance, resolution] = await Promise.all([
		readText(paths.pptRequirements),
		readText(paths.learnedRequirements),
		loadCurriculumContext(projectRoot),
		loadGuidanceIndex(projectRoot),
		resolveTextbookLesson(projectRoot, request),
	]);

	if (resolution.matches.length !== 1) {
		return {
			request,
			pptRequirements,
			learnedRequirements,
			curriculum,
			guidance,
			resolution,
			selectedPages: [],
			sourcePdfPageRefs: [],
		};
	}

	const match = resolution.matches[0];
	const pages = JSON.parse(
		await readFile(join(paths.presentationRoot, match.pagesIndexPath), "utf-8"),
	) as TextbookPageIndex[];
	const selectedPages = pages.filter((page) => page.pageNumber >= match.pageStart && page.pageNumber <= match.pageEnd);

	return {
		request,
		pptRequirements,
		learnedRequirements,
		curriculum,
		guidance,
		resolution,
		selectedPages,
		sourcePdfPageRefs: selectedPages.map((page) => ({ bookId: match.bookId, pageNumber: page.pageNumber })),
	};
}
