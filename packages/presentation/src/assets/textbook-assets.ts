import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { MusicLessonContext, SourcePdfPageRef } from "../lesson/lesson-context-builder.ts";
import { getPresentationProjectPaths } from "../project/presentation-config.ts";
import type { TextbookBookIndex, TextbookIndex } from "../textbooks/textbook-types.ts";
import { type PdfPageRenderer, renderPdfPageToPng } from "./pdf-page-renderer.ts";

export type TextbookPageAsset = {
	assetId: string;
	kind: "textbook-page";
	bookId: string;
	pageNumber: number;
	sourcePdfPath: string;
	outputPath: string;
	relativeOutputPath: string;
	widthPx: number;
	heightPx: number;
};

export type TextbookAssetManifest = {
	version: 1;
	assets: TextbookPageAsset[];
};

export type MaterializeTextbookAssetsOptions = {
	renderPdfPage?: PdfPageRenderer;
};

function toPortablePath(path: string) {
	return path.split(sep).join("/");
}

function resolveStoredFilePath(projectRoot: string, filePath: string) {
	return isAbsolute(filePath) ? filePath : join(projectRoot, filePath);
}

function assetIdForRef(ref: SourcePdfPageRef) {
	return `${ref.bookId}-page-${ref.pageNumber}`;
}

function uniquePageRefs(refs: SourcePdfPageRef[]) {
	const seen = new Set<string>();
	const uniqueRefs: SourcePdfPageRef[] = [];
	for (const ref of refs) {
		const key = assetIdForRef(ref);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		uniqueRefs.push(ref);
	}
	return uniqueRefs;
}

async function readTextbookIndex(projectRoot: string): Promise<TextbookIndex> {
	return JSON.parse(await readFile(getPresentationProjectPaths(projectRoot).textbookIndex, "utf-8")) as TextbookIndex;
}

function bookById(index: TextbookIndex) {
	return new Map(index.books.map((book) => [book.bookId, book]));
}

async function renderTextbookPageAsset(
	projectRoot: string,
	assetsDir: string,
	book: TextbookBookIndex,
	ref: SourcePdfPageRef,
	renderPdfPage: PdfPageRenderer,
): Promise<TextbookPageAsset> {
	const sourcePdfPath = resolveStoredFilePath(projectRoot, book.filePath);
	const outputPath = join(assetsDir, `${assetIdForRef(ref)}.png`);
	const rendered = await renderPdfPage({
		pdfPath: sourcePdfPath,
		pageNumber: ref.pageNumber,
		outputPath,
		widthPx: 1600,
	});
	return {
		assetId: assetIdForRef(ref),
		kind: "textbook-page",
		bookId: ref.bookId,
		pageNumber: ref.pageNumber,
		sourcePdfPath,
		outputPath,
		relativeOutputPath: toPortablePath(relative(assetsDir, outputPath)),
		widthPx: rendered.widthPx,
		heightPx: rendered.heightPx,
	};
}

export async function materializeTextbookAssets(
	projectRoot: string,
	context: MusicLessonContext,
	projectDir: string,
	options: MaterializeTextbookAssetsOptions = {},
): Promise<TextbookAssetManifest> {
	const assetsDir = join(projectDir, "assets");
	await mkdir(assetsDir, { recursive: true });
	const index = await readTextbookIndex(projectRoot);
	const books = bookById(index);
	const renderPdfPage = options.renderPdfPage ?? renderPdfPageToPng;
	const assets: TextbookPageAsset[] = [];

	for (const ref of uniquePageRefs(context.sourcePdfPageRefs)) {
		const book = books.get(ref.bookId);
		if (!book) {
			throw new Error(`No indexed textbook book found for asset ${assetIdForRef(ref)}`);
		}
		assets.push(await renderTextbookPageAsset(projectRoot, assetsDir, book, ref, renderPdfPage));
	}

	const manifest: TextbookAssetManifest = {
		version: 1,
		assets,
	};
	await writeFile(join(assetsDir, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
	return manifest;
}
