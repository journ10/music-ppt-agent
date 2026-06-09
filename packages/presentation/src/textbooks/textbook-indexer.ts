import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";
import { EMPTY_TEXTBOOK_INDEX_GENERATED_AT, getPresentationProjectPaths } from "../project/presentation-config.ts";
import {
	getEnabledPresentationSources,
	type PresentationSourceEntry,
	readPresentationSourceManifest,
	resolvePresentationSourcePath,
} from "../project/source-manifest.ts";
import { extractPdfTextPages, type PdfTextExtractor, type PdfTextPage } from "./pdf-text-extractor.ts";
import type { TextbookBookIndex, TextbookIndex, TextbookLessonIndex, TextbookPageIndex } from "./textbook-types.ts";

export type TextbookIndexOptions = {
	pdfPaths?: string[];
	extractPdfText?: PdfTextExtractor;
	generatedAt?: string;
};

export type TextbookIndexResult = {
	index: TextbookIndex;
	indexedBookIds: string[];
	skippedBookIds: string[];
};

type TextbookPdfInput = {
	pdfPath: string;
	sourceId?: string;
	title?: string;
	publisher?: string;
	grade?: string;
	volume?: "上册" | "下册";
};

const ChineseSlugMap = new Map<string, string>([
	["人", "ren"],
	["音", "yin"],
	["粤", "yue"],
	["教", "jiao"],
	["版", "ban"],
	["一", "yi"],
	["二", "er"],
	["三", "san"],
	["四", "si"],
	["五", "wu"],
	["六", "liu"],
	["七", "qi"],
	["八", "ba"],
	["九", "jiu"],
	["十", "shi"],
	["年", "nian"],
	["级", "ji"],
	["上", "shang"],
	["下", "xia"],
	["册", "ce"],
	["小", "xiao"],
	["雨", "yu"],
	["沙", "sha"],
	["春", "chun"],
	["晓", "xiao"],
]);

function toPortablePath(path: string) {
	return path.split(sep).join("/");
}

export function slugifyTextbookId(value: string) {
	const tokens: string[] = [];
	for (const char of value) {
		if (/^[a-zA-Z0-9]$/.test(char)) {
			tokens.push(char.toLowerCase());
			continue;
		}
		const mapped = ChineseSlugMap.get(char);
		if (mapped) {
			tokens.push(mapped);
			continue;
		}
		if (/\p{Script=Han}/u.test(char)) {
			tokens.push(`u${char.codePointAt(0)?.toString(16) ?? "0"}`);
			continue;
		}
		if (/[\s._-]/.test(char)) {
			tokens.push("-");
		}
	}
	return tokens.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function hashFile(path: string) {
	const bytes = await readFile(path);
	return createHash("sha256").update(bytes).digest("hex");
}

async function readExistingIndex(path: string): Promise<TextbookIndex | undefined> {
	try {
		return JSON.parse(await readFile(path, "utf-8")) as TextbookIndex;
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

async function discoverPdfPaths(projectRoot: string) {
	const textbookRoot = join(getPresentationProjectPaths(projectRoot).presentationRoot, "textbooks");
	const entries = await readdir(textbookRoot, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
		.map((entry) => join(textbookRoot, entry.name))
		.sort((a, b) => a.localeCompare(b));
}

function uniqueTextbookInputs(inputs: TextbookPdfInput[]) {
	const seen = new Set<string>();
	const uniqueInputs: TextbookPdfInput[] = [];
	for (const input of inputs) {
		if (seen.has(input.pdfPath)) {
			continue;
		}
		seen.add(input.pdfPath);
		uniqueInputs.push(input);
	}
	return uniqueInputs.sort((a, b) => a.pdfPath.localeCompare(b.pdfPath));
}

function sourceToTextbookInput(projectRoot: string, source: PresentationSourceEntry): TextbookPdfInput {
	return {
		pdfPath: resolvePresentationSourcePath(projectRoot, source),
		sourceId: source.id,
		title: source.title,
		publisher: source.publisher,
		grade: source.grade,
		volume: source.volume,
	};
}

async function discoverTextbookInputs(projectRoot: string) {
	const folderInputs = (await discoverPdfPaths(projectRoot)).map((pdfPath) => ({ pdfPath }));
	const manifest = await readPresentationSourceManifest(projectRoot);
	const manifestInputs = getEnabledPresentationSources(manifest, "textbook")
		.filter((source) => source.path.toLowerCase().endsWith(".pdf"))
		.map((source) => sourceToTextbookInput(projectRoot, source));
	return uniqueTextbookInputs([...folderInputs, ...manifestInputs]);
}

function parseBookMetadata(pdfPath: string) {
	const title = basename(pdfPath, extname(pdfPath));
	return {
		title,
		publisher: title.match(/([^-\s]+版)/)?.[1],
		grade: title.match(/([一二三四五六]年级)/)?.[1],
		volume: title.includes("下册") ? ("下册" as const) : title.includes("上册") ? ("上册" as const) : undefined,
	};
}

function toStoredPdfPath(projectRoot: string, pdfPath: string) {
	const relativePath = relative(projectRoot, pdfPath);
	if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
		return toPortablePath(relativePath);
	}
	return toPortablePath(pdfPath);
}

function unique(values: string[]) {
	return [...new Set(values.filter(Boolean))];
}

function cleanLessonTitle(value: string) {
	return value
		.replace(/\s+/g, "")
		.replace(/^[：:、，,]+|[：:、，,]+$/g, "")
		.trim();
}

function normalizeTextLine(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

function parseTocUnitLine(line: string) {
	const match = line.match(/^(第\s*\d+\s*单\s*元)\s+(.+?)\s*\/\s*(\d{1,3})$/);
	if (!match) {
		return undefined;
	}
	return {
		unitTitle: `${cleanLessonTitle(match[1])} ${normalizeTextLine(match[2])}`,
		printedPageNumber: Number.parseInt(match[3], 10),
	};
}

function parseTocLessonLine(line: string) {
	const match = line.match(/^(演唱(?:\/演奏)?|表演|听赏|律动|唱游|朗读|艺术[·•]实践)\s+(.+?)\s*\/\s*(\d{1,3})$/);
	if (!match) {
		return undefined;
	}
	return {
		lessonTitle: cleanLessonTitle(match[2]),
		printedPageNumber: Number.parseInt(match[3], 10),
	};
}

function detectSongs(text: string) {
	const bracketedSongs = [...text.matchAll(/《([^》]+)》/g)].map((match) => cleanLessonTitle(match[1]));
	const tocSongs = text
		.split(/\r?\n/)
		.map((line) => parseTocLessonLine(normalizeTextLine(line))?.lessonTitle)
		.filter((title) => title !== undefined);
	return unique([...bracketedSongs, ...tocSongs]);
}

function detectHeadings(text: string) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("#"))
		.map((line) => line.replace(/^#+\s*/, ""));
}

function detectActivities(text: string) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim().replace(/^#+\s*/, ""))
		.filter((line) => /聆听|节奏|练习|活动|拍|唱|律动|创编/.test(line) && !line.includes("歌词"));
}

function detectPrintedPageNumber(text: string) {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const candidate = [...lines].reverse().find((line) => /^\d{1,3}$/.test(line));
	return candidate ? Number.parseInt(candidate, 10) : undefined;
}

function buildPageIndex(page: PdfTextPage): TextbookPageIndex {
	const text = page.text.trim();
	const printedPageNumber = detectPrintedPageNumber(text);
	return {
		pageNumber: page.pageNumber,
		...(printedPageNumber === undefined ? {} : { printedPageNumber }),
		text,
		headings: detectHeadings(text),
		detectedSongs: detectSongs(text),
		detectedActivities: detectActivities(text),
		hasScore: /谱例|简谱|五线谱/.test(text),
		hasLyrics: /歌词/.test(text),
		hasImage: /插图|图片|图示/.test(text),
	};
}

function resolvePrintedPageNumber(
	pageByPrintedNumber: Map<number, number>,
	printedPageNumber: number,
	fallback: number,
) {
	return pageByPrintedNumber.get(printedPageNumber) ?? fallback;
}

function buildPrintedPageNumberMap(pages: TextbookPageIndex[]) {
	const pageByPrintedNumber = new Map<number, number>();
	for (const page of pages) {
		if (page.printedPageNumber !== undefined) {
			pageByPrintedNumber.set(page.printedPageNumber, page.pageNumber);
		}
	}
	return pageByPrintedNumber;
}

function buildLessonIndexes(bookId: string, pages: TextbookPageIndex[]): TextbookLessonIndex[] {
	const pageByPrintedNumber = buildPrintedPageNumberMap(pages);
	const tocUnitStarts: Array<{ unitTitle: string; pageNumber: number }> = [];
	const tocLessonStarts: Array<{ song: string; pageNumber: number; unitTitle?: string }> = [];
	let currentUnitTitle: string | undefined;

	for (const page of pages) {
		for (const rawLine of page.text.split(/\r?\n/)) {
			const line = normalizeTextLine(rawLine);
			const unit = parseTocUnitLine(line);
			if (unit) {
				currentUnitTitle = unit.unitTitle;
				tocUnitStarts.push({
					unitTitle: unit.unitTitle,
					pageNumber: resolvePrintedPageNumber(pageByPrintedNumber, unit.printedPageNumber, page.pageNumber),
				});
				continue;
			}
			const lesson = parseTocLessonLine(line);
			if (lesson) {
				tocLessonStarts.push({
					song: lesson.lessonTitle,
					pageNumber: resolvePrintedPageNumber(pageByPrintedNumber, lesson.printedPageNumber, page.pageNumber),
					unitTitle: currentUnitTitle,
				});
			}
		}
	}

	const quoteLessonStarts = pages.flatMap((page) =>
		page.detectedSongs.map((song) => ({
			song,
			pageNumber: page.pageNumber,
			unitTitle: page.headings.find((heading) => /单元/.test(heading)),
		})),
	);
	const lessonStarts = tocLessonStarts.length > 0 ? tocLessonStarts : quoteLessonStarts;

	return lessonStarts.map((lesson, index) => {
		const nextLesson = lessonStarts[index + 1];
		const nextUnit = tocUnitStarts.find(
			(unit) => unit.pageNumber > lesson.pageNumber && unit.unitTitle !== lesson.unitTitle,
		);
		const pageEndCandidates = [nextLesson?.pageNumber, nextUnit?.pageNumber]
			.filter((pageNumber) => pageNumber !== undefined)
			.map((pageNumber) => pageNumber - 1)
			.filter((pageNumber) => pageNumber >= lesson.pageNumber);
		const pageEnd =
			pageEndCandidates.length > 0
				? Math.min(...pageEndCandidates)
				: (pages.at(-1)?.pageNumber ?? lesson.pageNumber);
		const lessonPages = pages.filter((page) => page.pageNumber >= lesson.pageNumber && page.pageNumber <= pageEnd);
		return {
			lessonId: `${bookId}-${slugifyTextbookId(lesson.song)}`,
			unitTitle: lesson.unitTitle,
			lessonTitle: lesson.song,
			pageStart: lesson.pageNumber,
			pageEnd,
			songs: unique(lessonPages.flatMap((page) => page.detectedSongs)),
			activities: unique(lessonPages.flatMap((page) => page.detectedActivities)),
			confidence: "high",
		};
	});
}

async function writeJson(path: string, value: unknown) {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export async function indexTextbooks(
	projectRoot: string,
	options: TextbookIndexOptions = {},
): Promise<TextbookIndexResult> {
	const paths = getPresentationProjectPaths(projectRoot);
	const pdfInputs = options.pdfPaths
		? uniqueTextbookInputs(options.pdfPaths.map((pdfPath) => ({ pdfPath })))
		: await discoverTextbookInputs(projectRoot);
	const existingIndex = await readExistingIndex(paths.textbookIndex);
	const existingBooks = new Map(existingIndex?.books.map((book) => [book.bookId, book]));
	const indexPagesRoot = join(paths.presentationRoot, "index", "pages");
	const indexUnitsRoot = join(paths.presentationRoot, "index", "units");
	await mkdir(indexPagesRoot, { recursive: true });
	await mkdir(indexUnitsRoot, { recursive: true });

	const books: TextbookBookIndex[] = [];
	const indexedBookIds: string[] = [];
	const skippedBookIds: string[] = [];
	const extractor = options.extractPdfText ?? extractPdfTextPages;

	for (const input of pdfInputs) {
		const metadata = parseBookMetadata(input.pdfPath);
		const title = input.title ?? metadata.title;
		const bookId = slugifyTextbookId(title);
		const fileHash = await hashFile(input.pdfPath);
		const pagesIndexPath = `index/pages/${bookId}.pages.json`;
		const unitsIndexPath = `index/units/${bookId}.units.json`;
		const existingBook = existingBooks.get(bookId);

		if (existingBook?.fileHash === fileHash) {
			books.push(existingBook);
			skippedBookIds.push(bookId);
			continue;
		}

		const pages = (await extractor(input.pdfPath)).map(buildPageIndex);
		const lessons = buildLessonIndexes(bookId, pages);
		await writeJson(join(paths.presentationRoot, pagesIndexPath), pages);
		await writeJson(join(paths.presentationRoot, unitsIndexPath), lessons);

		books.push({
			bookId,
			title,
			subject: "music",
			sourceId: input.sourceId,
			publisher: input.publisher ?? metadata.publisher,
			grade: input.grade ?? metadata.grade,
			volume: input.volume ?? metadata.volume,
			filePath: toStoredPdfPath(projectRoot, input.pdfPath),
			fileHash,
			pageCount: pages.length,
			unitsIndexPath,
			pagesIndexPath,
		});
		indexedBookIds.push(bookId);
	}

	const index: TextbookIndex = {
		version: 1,
		books: books.sort((a, b) => a.bookId.localeCompare(b.bookId)),
		generatedAt: options.generatedAt ?? existingIndex?.generatedAt ?? EMPTY_TEXTBOOK_INDEX_GENERATED_AT,
	};
	await writeJson(paths.textbookIndex, index);
	return { index, indexedBookIds, skippedBookIds };
}
