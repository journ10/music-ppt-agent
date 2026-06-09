import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_PRIMARY_MUSIC_CURRICULUM, DEFAULT_TEACHING_GUIDANCE } from "../curriculum/default-curriculum.ts";
import { EMPTY_GUIDANCE_INDEX } from "../curriculum/guidance-extractor.ts";
import { DEFAULT_PPT_REQUIREMENTS } from "./ppt-requirements.ts";
import {
	EMPTY_TEXTBOOK_INDEX_GENERATED_AT,
	getPresentationProjectPaths,
	PRESENTATION_INDEX_VERSION,
	PRESENTATION_PROJECT_DIRECTORIES,
} from "./presentation-config.ts";
import { DEFAULT_LEARNED_REQUIREMENTS } from "./requirements-memory.ts";
import { EMPTY_PRESENTATION_RUNTIME_CONFIG, formatPresentationRuntimeConfig } from "./runtime-config.ts";
import { EMPTY_PRESENTATION_SOURCE_MANIFEST, formatPresentationSourceManifest } from "./source-manifest.ts";

export type PresentationInitResult = {
	presentationRoot: string;
	createdDirectories: string[];
	createdFiles: string[];
};

async function pathExists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function ensureDirectory(root: string, relativePath: string, createdDirectories: string[]) {
	const absolutePath = join(root, relativePath);
	if (await pathExists(absolutePath)) return;
	await mkdir(absolutePath, { recursive: true });
	createdDirectories.push(relativePath);
}

async function writeFileIfMissing(path: string, relativePath: string, content: string, createdFiles: string[]) {
	if (await pathExists(path)) return;
	await writeFile(path, content, "utf-8");
	createdFiles.push(relativePath);
}

function createEmptyTextbookIndex() {
	return `${JSON.stringify(
		{
			version: PRESENTATION_INDEX_VERSION,
			books: [],
			generatedAt: EMPTY_TEXTBOOK_INDEX_GENERATED_AT,
		},
		null,
		2,
	)}\n`;
}

export async function initializePresentationProject(projectRoot: string): Promise<PresentationInitResult> {
	const paths = getPresentationProjectPaths(projectRoot);
	const createdDirectories: string[] = [];
	const createdFiles: string[] = [];

	for (const directory of PRESENTATION_PROJECT_DIRECTORIES) {
		await ensureDirectory(paths.presentationRoot, directory, createdDirectories);
	}

	await writeFileIfMissing(paths.pptRequirements, "PPT.md", DEFAULT_PPT_REQUIREMENTS, createdFiles);
	await writeFileIfMissing(
		paths.primaryMusicCurriculum,
		"curriculum/primary-music-curriculum.md",
		DEFAULT_PRIMARY_MUSIC_CURRICULUM,
		createdFiles,
	);
	await writeFileIfMissing(
		paths.teachingGuidance,
		"curriculum/teaching-guidance.md",
		DEFAULT_TEACHING_GUIDANCE,
		createdFiles,
	);
	await writeFileIfMissing(
		paths.learnedRequirements,
		"memory/learned-requirements.md",
		DEFAULT_LEARNED_REQUIREMENTS,
		createdFiles,
	);
	await writeFileIfMissing(
		paths.sourceManifest,
		"sources.json",
		formatPresentationSourceManifest(EMPTY_PRESENTATION_SOURCE_MANIFEST),
		createdFiles,
	);
	await writeFileIfMissing(
		paths.runtimeConfig,
		"config.json",
		formatPresentationRuntimeConfig(EMPTY_PRESENTATION_RUNTIME_CONFIG),
		createdFiles,
	);
	await writeFileIfMissing(
		paths.textbookIndex,
		"index/textbooks.index.json",
		createEmptyTextbookIndex(),
		createdFiles,
	);
	await writeFileIfMissing(
		paths.guidanceIndex,
		"index/guidance.index.json",
		`${JSON.stringify(EMPTY_GUIDANCE_INDEX, null, 2)}\n`,
		createdFiles,
	);
	await writeFileIfMissing(
		paths.textbookPlaceholder,
		"textbooks/put-textbook-pdfs-here.md",
		"# Textbook PDFs\n\nPut primary music textbook PDF files in this folder, then run `/ppt-index rebuild`.\n",
		createdFiles,
	);

	return {
		presentationRoot: paths.presentationRoot,
		createdDirectories,
		createdFiles,
	};
}
