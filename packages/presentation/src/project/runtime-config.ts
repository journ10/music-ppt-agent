import { readFile, writeFile } from "node:fs/promises";
import { getPresentationProjectPaths } from "./presentation-config.ts";

export type PresentationRuntimeConfig = {
	version: 1;
	pptMaster?: {
		svgToPptxScript?: string;
		pythonPath?: string;
	};
};

export const EMPTY_PRESENTATION_RUNTIME_CONFIG: PresentationRuntimeConfig = {
	version: 1,
};

function isNotFoundError(error: unknown) {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function assertPresentationRuntimeConfig(value: PresentationRuntimeConfig) {
	if (value.version !== 1) {
		throw new Error(`Unsupported presentation runtime config version: ${value.version}`);
	}
}

export function formatPresentationRuntimeConfig(config: PresentationRuntimeConfig) {
	return `${JSON.stringify(config, null, 2)}\n`;
}

export async function readPresentationRuntimeConfig(projectRoot: string): Promise<PresentationRuntimeConfig> {
	try {
		const config = JSON.parse(
			await readFile(getPresentationProjectPaths(projectRoot).runtimeConfig, "utf-8"),
		) as PresentationRuntimeConfig;
		assertPresentationRuntimeConfig(config);
		return config;
	} catch (error) {
		if (isNotFoundError(error)) {
			return EMPTY_PRESENTATION_RUNTIME_CONFIG;
		}
		throw error;
	}
}

export async function writePresentationRuntimeConfig(
	projectRoot: string,
	config: PresentationRuntimeConfig,
): Promise<void> {
	assertPresentationRuntimeConfig(config);
	await writeFile(getPresentationProjectPaths(projectRoot).runtimeConfig, formatPresentationRuntimeConfig(config));
}

export async function rememberPptMasterExportConfig(
	projectRoot: string,
	options: {
		svgToPptxScript: string;
		pythonPath?: string;
	},
): Promise<PresentationRuntimeConfig> {
	const current = await readPresentationRuntimeConfig(projectRoot);
	const next: PresentationRuntimeConfig = {
		...current,
		pptMaster: {
			...current.pptMaster,
			svgToPptxScript: options.svgToPptxScript,
			pythonPath: options.pythonPath ?? current.pptMaster?.pythonPath,
		},
	};
	await writePresentationRuntimeConfig(projectRoot, next);
	return next;
}
