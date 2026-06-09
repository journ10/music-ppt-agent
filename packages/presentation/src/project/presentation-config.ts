import { join } from "node:path";

export const PRESENTATION_CONFIG_DIR = ".pi/presentation";
export const PRESENTATION_INDEX_VERSION = 1;
export const EMPTY_TEXTBOOK_INDEX_GENERATED_AT = "1970-01-01T00:00:00.000Z";

export type PresentationProjectPaths = {
	presentationRoot: string;
	pptRequirements: string;
	primaryMusicCurriculum: string;
	teachingGuidance: string;
	learnedRequirements: string;
	runtimeConfig: string;
	sourceManifest: string;
	textbookIndex: string;
	guidanceIndex: string;
	textbookPlaceholder: string;
};

export function getPresentationProjectPaths(projectRoot: string): PresentationProjectPaths {
	const presentationRoot = join(projectRoot, ".pi", "presentation");
	return {
		presentationRoot,
		pptRequirements: join(presentationRoot, "PPT.md"),
		primaryMusicCurriculum: join(presentationRoot, "curriculum", "primary-music-curriculum.md"),
		teachingGuidance: join(presentationRoot, "curriculum", "teaching-guidance.md"),
		learnedRequirements: join(presentationRoot, "memory", "learned-requirements.md"),
		runtimeConfig: join(presentationRoot, "config.json"),
		sourceManifest: join(presentationRoot, "sources.json"),
		textbookIndex: join(presentationRoot, "index", "textbooks.index.json"),
		guidanceIndex: join(presentationRoot, "index", "guidance.index.json"),
		textbookPlaceholder: join(presentationRoot, "textbooks", "put-textbook-pdfs-here.md"),
	};
}

export const PRESENTATION_PROJECT_DIRECTORIES = [
	"curriculum",
	"textbooks",
	"index",
	"index/pages",
	"index/units",
	"memory",
	"templates",
	"templates/primary-music-default",
	"projects",
] as const;
