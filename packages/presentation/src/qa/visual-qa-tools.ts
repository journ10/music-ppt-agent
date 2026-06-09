import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

export type VisualQaRuntimeConfig = {
	libreOfficePath?: string;
	pdfToPngPath?: string;
	pythonPath?: string;
};

export type VisualQaToolPaths = {
	libreOfficePath?: string;
	pdfToPngPath?: string;
	pythonPath?: string;
};

export type ResolveVisualQaToolPathsOptions = {
	config?: VisualQaRuntimeConfig;
	env?: Partial<Record<string, string | undefined>>;
	pathEntries?: string[];
	commonLibreOfficePaths?: string[];
	commonPdfToPngPaths?: string[];
	commonPythonPaths?: string[];
	fileExists?: (path: string) => Promise<boolean>;
};

const COMMON_LIBREOFFICE_PATHS = [
	"/Applications/LibreOffice.app/Contents/MacOS/soffice",
	"/opt/homebrew/bin/soffice",
	"/usr/local/bin/soffice",
	"/usr/bin/soffice",
] as const;

const COMMON_PDF_TO_PNG_PATHS = ["/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm", "/usr/bin/pdftoppm"] as const;

const COMMON_PYTHON_PATHS = ["/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"] as const;

async function defaultFileExists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function pathEntriesFromEnv(env: Partial<Record<string, string | undefined>>) {
	return (env.PATH ?? "").split(delimiter).filter(Boolean);
}

async function firstExistingPath(
	paths: readonly (string | undefined)[],
	fileExists: (path: string) => Promise<boolean>,
): Promise<string | undefined> {
	for (const path of paths) {
		if (path && (await fileExists(path))) {
			return path;
		}
	}
	return undefined;
}

function commandCandidates(pathEntries: readonly string[], commandNames: readonly string[]) {
	return pathEntries.flatMap((pathEntry) => commandNames.map((commandName) => join(pathEntry, commandName)));
}

export async function resolveVisualQaToolPaths(
	options: ResolveVisualQaToolPathsOptions = {},
): Promise<VisualQaToolPaths> {
	const env = options.env ?? process.env;
	const pathEntries = options.pathEntries ?? pathEntriesFromEnv(env);
	const fileExists = options.fileExists ?? defaultFileExists;

	return {
		libreOfficePath: await firstExistingPath(
			[
				options.config?.libreOfficePath,
				env.PI_PRESENTATION_LIBREOFFICE,
				...commandCandidates(pathEntries, ["soffice", "libreoffice"]),
				...(options.commonLibreOfficePaths ?? COMMON_LIBREOFFICE_PATHS),
			],
			fileExists,
		),
		pdfToPngPath: await firstExistingPath(
			[
				options.config?.pdfToPngPath,
				env.PI_PRESENTATION_PDFTOPPM,
				...commandCandidates(pathEntries, ["pdftoppm"]),
				...(options.commonPdfToPngPaths ?? COMMON_PDF_TO_PNG_PATHS),
			],
			fileExists,
		),
		pythonPath: await firstExistingPath(
			[
				options.config?.pythonPath,
				env.PI_PRESENTATION_PYTHON,
				...commandCandidates(pathEntries, ["python3"]),
				...(options.commonPythonPaths ?? COMMON_PYTHON_PATHS),
			],
			fileExists,
		),
	};
}
