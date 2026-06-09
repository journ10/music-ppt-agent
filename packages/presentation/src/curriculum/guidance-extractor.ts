import { readFile, writeFile } from "node:fs/promises";
import { getPresentationProjectPaths } from "../project/presentation-config.ts";
import {
	getEnabledPresentationSources,
	type PresentationSourceEntry,
	type PresentationSourceManifest,
	readPresentationSourceManifest,
	resolvePresentationSourcePath,
} from "../project/source-manifest.ts";
import { extractPdfTextPages, type PdfTextExtractor } from "../textbooks/pdf-text-extractor.ts";
import { FORBIDDEN_STUDENT_SLIDE_TERMS } from "./forbidden-slide-terms.ts";

export type GuidanceConstraintKind =
	| "activity"
	| "emotion"
	| "cooperation"
	| "aesthetic-listening"
	| "performance"
	| "home-connection";

export type GuidanceConstraint = {
	kind: GuidanceConstraintKind;
	label: string;
	matchedKeywords: string[];
	evidence?: string;
};

export type GuidanceSourceIndex = {
	sourceId: string;
	title: string;
	role?: string;
	filePath: string;
	status: "indexed" | "missing-text" | "error";
	pageCount: number;
	constraints: GuidanceConstraint[];
	textExcerpt: string;
	warnings: string[];
};

export type GuidanceIndex = {
	version: 1;
	generatedAt: string;
	sources: GuidanceSourceIndex[];
	hiddenContextMarkdown: string;
	warnings: string[];
};

export type GuidanceExtractionOptions = {
	extractPdfText?: PdfTextExtractor;
	generatedAt?: string;
	manifest?: PresentationSourceManifest;
};

type GuidanceConstraintDefinition = {
	kind: GuidanceConstraintKind;
	label: string;
	keywords: string[];
};

export const EMPTY_GUIDANCE_INDEX_GENERATED_AT = "1970-01-01T00:00:00.000Z";

export const EMPTY_GUIDANCE_INDEX: GuidanceIndex = {
	version: 1,
	generatedAt: EMPTY_GUIDANCE_INDEX_GENERATED_AT,
	sources: [],
	hiddenContextMarkdown: "",
	warnings: [],
};

const GuidanceConstraintDefinitions: GuidanceConstraintDefinition[] = [
	{
		kind: "activity",
		label: "课堂活动要以听、唱、动、创等实践体验为主",
		keywords: ["实践", "活动", "体验", "参与", "探究", "律动", "创编"],
	},
	{
		kind: "emotion",
		label: "音乐学习要连接情感体验和审美感受",
		keywords: ["情感", "审美", "感受", "体验", "美感", "兴趣"],
	},
	{
		kind: "cooperation",
		label: "课堂组织要包含合作、交流和展示",
		keywords: ["合作", "交流", "展示", "小组", "分享", "互动"],
	},
	{
		kind: "aesthetic-listening",
		label: "先聆听和感知，再进入知识讲解",
		keywords: ["聆听", "感知", "欣赏", "听辨", "音乐形象"],
	},
	{
		kind: "performance",
		label: "演唱、演奏或身体表现要有清晰任务",
		keywords: ["演唱", "演奏", "表现", "表演", "节奏", "拍击"],
	},
	{
		kind: "home-connection",
		label: "可设计家庭延伸或生活化音乐连接",
		keywords: ["生活", "家庭", "课外", "延伸", "实践活动"],
	},
];

function isNotFoundError(error: unknown) {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function normalizeWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
	const normalized = normalizeWhitespace(value);
	return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}

function unique(values: string[]) {
	return [...new Set(values.filter(Boolean))];
}

function findEvidence(text: string, keywords: string[]) {
	const lines = text
		.split(/\r?\n/)
		.map((line) => normalizeWhitespace(line))
		.filter(Boolean);
	const line = lines.find((candidate) => keywords.some((keyword) => candidate.includes(keyword)));
	return line ? truncateText(line, 160) : undefined;
}

function detectConstraints(text: string): GuidanceConstraint[] {
	return GuidanceConstraintDefinitions.flatMap((definition) => {
		const matchedKeywords = definition.keywords.filter((keyword) => text.includes(keyword));
		if (matchedKeywords.length === 0) {
			return [];
		}
		return [
			{
				kind: definition.kind,
				label: definition.label,
				matchedKeywords: unique(matchedKeywords),
				evidence: findEvidence(text, matchedKeywords),
			},
		];
	});
}

function sourceTitle(source: PresentationSourceEntry) {
	return source.title ?? source.id;
}

function buildHiddenContextMarkdown(sources: GuidanceSourceIndex[]) {
	const indexedSources = sources.filter((source) => source.status === "indexed");
	if (indexedSources.length === 0) {
		return "";
	}

	const lines = [
		"# Extracted Teaching Guidance",
		"",
		"Use this guidance only for lesson planning, teacher notes, activity design, and QA. Do not copy source-policy wording onto student-facing slides.",
	];

	for (const source of indexedSources) {
		lines.push("", `## ${source.title}`);
		for (const constraint of source.constraints) {
			const evidence = constraint.evidence ? ` Evidence: ${constraint.evidence}` : "";
			lines.push(`- ${constraint.label}.${evidence}`);
		}
	}

	return `${lines.join("\n")}\n`;
}

async function extractGuidanceSource(
	projectRoot: string,
	source: PresentationSourceEntry,
	extractPdfText: PdfTextExtractor,
): Promise<GuidanceSourceIndex> {
	const filePath = resolvePresentationSourcePath(projectRoot, source);
	try {
		const pages = await extractPdfText(filePath);
		const text = pages
			.map((page) => page.text)
			.join("\n")
			.trim();
		const warnings: string[] = [];
		if (text.length === 0) {
			warnings.push(`Guidance source produced no extractable text: ${filePath}`);
			return {
				sourceId: source.id,
				title: sourceTitle(source),
				role: source.role,
				filePath,
				status: "missing-text",
				pageCount: pages.length,
				constraints: [],
				textExcerpt: "",
				warnings,
			};
		}
		return {
			sourceId: source.id,
			title: sourceTitle(source),
			role: source.role,
			filePath,
			status: "indexed",
			pageCount: pages.length,
			constraints: detectConstraints(text),
			textExcerpt: truncateText(text, 600),
			warnings,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			sourceId: source.id,
			title: sourceTitle(source),
			role: source.role,
			filePath,
			status: "error",
			pageCount: 0,
			constraints: [],
			textExcerpt: "",
			warnings: [`Failed to extract guidance source ${filePath}: ${message}`],
		};
	}
}

export async function extractGuidanceSources(
	projectRoot: string,
	options: GuidanceExtractionOptions = {},
): Promise<GuidanceIndex> {
	const manifest = options.manifest ?? (await readPresentationSourceManifest(projectRoot));
	const extractPdfText = options.extractPdfText ?? extractPdfTextPages;
	const sources = await Promise.all(
		getEnabledPresentationSources(manifest, "guidance").map((source) =>
			extractGuidanceSource(projectRoot, source, extractPdfText),
		),
	);
	const warnings = sources.flatMap((source) => source.warnings);

	return {
		version: 1,
		generatedAt: options.generatedAt ?? new Date().toISOString(),
		sources,
		hiddenContextMarkdown: buildHiddenContextMarkdown(sources),
		warnings,
	};
}

export async function rebuildGuidanceIndex(
	projectRoot: string,
	options: GuidanceExtractionOptions = {},
): Promise<GuidanceIndex> {
	const index = await extractGuidanceSources(projectRoot, options);
	await writeFile(getPresentationProjectPaths(projectRoot).guidanceIndex, `${JSON.stringify(index, null, 2)}\n`);
	return index;
}

export async function loadGuidanceIndex(projectRoot: string): Promise<GuidanceIndex> {
	const paths = getPresentationProjectPaths(projectRoot);
	try {
		const index = JSON.parse(await readFile(paths.guidanceIndex, "utf-8")) as GuidanceIndex;
		if (index.version !== 1) {
			throw new Error(`Unsupported guidance index version: ${index.version}`);
		}
		return index;
	} catch (error) {
		if (isNotFoundError(error)) {
			return EMPTY_GUIDANCE_INDEX;
		}
		throw error;
	}
}

export function listForbiddenGuidanceSlideTerms() {
	return [...FORBIDDEN_STUDENT_SLIDE_TERMS];
}
