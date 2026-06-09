import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { EMPTY_TEXTBOOK_INDEX_GENERATED_AT, getPresentationProjectPaths } from "../project/presentation-config.ts";
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

const ChineseSlugMap = new Map<string, string>([
	["人", "ren"],
	["音", "yin"],
	["粤", "yue"],
	["教", "jiao"],
	["版", "ban"],
	["三", "san"],
	["四", "si"],
	["五", "wu"],
	["六", "liu"],
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

function parseBookMetadata(pdfPath: string) {
	const title = basename(pdfPath, extname(pdfPath));
	return {
		title,
		publisher: title.match(/([^-\s]+版)/)?.[1],
		grade: title.match(/([一二三四五六]年级)/)?.[1],
		volume: title.includes("下册") ? ("下册" as const) : title.includes("上册") ? ("上册" as const) : undefined,
	};
}

function unique(values: string[]) {
	return [...new Set(values.filter(Boolean))];
}

function detectSongs(text: string) {
	return unique([...text.matchAll(/《([^》]+)》/g)].map((match) => match[1].trim()));
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

function buildPageIndex(page: PdfTextPage): TextbookPageIndex {
	const text = page.text.trim();
	return {
		pageNumber: page.pageNumber,
		text,
		headings: detectHeadings(text),
		detectedSongs: detectSongs(text),
		detectedActivities: detectActivities(text),
		hasScore: /谱例|简谱|五线谱/.test(text),
		hasLyrics: /歌词/.test(text),
		hasImage: /插图|图片|图示/.test(text),
	};
}

function buildLessonIndexes(bookId: string, pages: TextbookPageIndex[]): TextbookLessonIndex[] {
	const lessonStarts = pages.flatMap((page) =>
		page.detectedSongs.map((song) => ({
			song,
			pageNumber: page.pageNumber,
			unitTitle: page.headings.find((heading) => /单元/.test(heading)),
		})),
	);

	return lessonStarts.map((lesson, index) => {
		const nextLesson = lessonStarts[index + 1];
		const pageEnd = nextLesson ? nextLesson.pageNumber - 1 : (pages.at(-1)?.pageNumber ?? lesson.pageNumber);
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
	const pdfPaths = (options.pdfPaths ?? (await discoverPdfPaths(projectRoot))).sort((a, b) => a.localeCompare(b));
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

	for (const pdfPath of pdfPaths) {
		const metadata = parseBookMetadata(pdfPath);
		const bookId = slugifyTextbookId(metadata.title);
		const fileHash = await hashFile(pdfPath);
		const pagesIndexPath = `index/pages/${bookId}.pages.json`;
		const unitsIndexPath = `index/units/${bookId}.units.json`;
		const existingBook = existingBooks.get(bookId);

		if (existingBook?.fileHash === fileHash) {
			books.push(existingBook);
			skippedBookIds.push(bookId);
			continue;
		}

		const pages = (await extractor(pdfPath)).map(buildPageIndex);
		const lessons = buildLessonIndexes(bookId, pages);
		await writeJson(join(paths.presentationRoot, pagesIndexPath), pages);
		await writeJson(join(paths.presentationRoot, unitsIndexPath), lessons);

		books.push({
			bookId,
			title: metadata.title,
			subject: "music",
			publisher: metadata.publisher,
			grade: metadata.grade,
			volume: metadata.volume,
			filePath: toPortablePath(relative(projectRoot, pdfPath)),
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
