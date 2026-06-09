import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { getPresentationProjectPaths } from "./presentation-config.ts";

export type PresentationSourceKind = "guidance" | "textbook" | "reference-ppt" | "media";
export type PresentationSourceVolume = "上册" | "下册";

export type PresentationSourceEntry = {
	id: string;
	kind: PresentationSourceKind;
	path: string;
	title?: string;
	role?: string;
	subject?: "music";
	publisher?: string;
	grade?: string;
	volume?: PresentationSourceVolume;
	enabled?: boolean;
};

export type PresentationSourceManifest = {
	version: 1;
	sources: PresentationSourceEntry[];
};

export const EMPTY_PRESENTATION_SOURCE_MANIFEST: PresentationSourceManifest = {
	version: 1,
	sources: [],
};

export function formatPresentationSourceManifest(manifest: PresentationSourceManifest) {
	return `${JSON.stringify(manifest, null, 2)}\n`;
}

function isNotFoundError(error: unknown) {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function assertPresentationSourceManifest(value: PresentationSourceManifest) {
	if (value.version !== 1) {
		throw new Error(`Unsupported presentation source manifest version: ${value.version}`);
	}
	if (!Array.isArray(value.sources)) {
		throw new Error("Presentation source manifest must contain a sources array.");
	}
}

export async function readPresentationSourceManifest(projectRoot: string): Promise<PresentationSourceManifest> {
	const paths = getPresentationProjectPaths(projectRoot);
	try {
		const manifest = JSON.parse(await readFile(paths.sourceManifest, "utf-8")) as PresentationSourceManifest;
		assertPresentationSourceManifest(manifest);
		return manifest;
	} catch (error) {
		if (isNotFoundError(error)) {
			return EMPTY_PRESENTATION_SOURCE_MANIFEST;
		}
		throw error;
	}
}

export async function writePresentationSourceManifest(
	projectRoot: string,
	manifest: PresentationSourceManifest,
): Promise<void> {
	assertPresentationSourceManifest(manifest);
	await writeFile(getPresentationProjectPaths(projectRoot).sourceManifest, formatPresentationSourceManifest(manifest));
}

export async function addPresentationSource(
	projectRoot: string,
	source: PresentationSourceEntry,
): Promise<PresentationSourceManifest> {
	const manifest = await readPresentationSourceManifest(projectRoot);
	const sources = manifest.sources.filter((candidate) => candidate.id !== source.id);
	const nextManifest: PresentationSourceManifest = {
		version: 1,
		sources: [...sources, source],
	};
	await writePresentationSourceManifest(projectRoot, nextManifest);
	return nextManifest;
}

export function getEnabledPresentationSources(
	manifest: PresentationSourceManifest,
	kind?: PresentationSourceKind,
): PresentationSourceEntry[] {
	return manifest.sources
		.filter((source) => source.enabled !== false)
		.filter((source) => kind === undefined || source.kind === kind);
}

export function resolvePresentationSourcePath(projectRoot: string, source: PresentationSourceEntry) {
	return normalize(isAbsolute(source.path) ? source.path : join(projectRoot, source.path));
}
