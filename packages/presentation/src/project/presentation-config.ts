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
	textbookIndex: string;
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
		textbookIndex: join(presentationRoot, "index", "textbooks.index.json"),
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
