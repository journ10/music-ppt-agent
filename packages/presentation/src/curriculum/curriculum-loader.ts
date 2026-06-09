import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { getPresentationProjectPaths } from "../project/presentation-config.ts";

export type CurriculumMarkdownFile = {
	relativePath: string;
	content: string;
};

export type CurriculumContext = {
	curriculumRoot: string;
	files: CurriculumMarkdownFile[];
	combinedMarkdown: string;
	warnings: string[];
};

function isNotFoundError(error: unknown) {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function toPortableRelativePath(root: string, path: string) {
	return relative(root, path).split(sep).join("/");
}

async function collectMarkdownFiles(directory: string, files: string[]) {
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			await collectMarkdownFiles(entryPath, files);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(entryPath);
		}
	}
}

export async function loadCurriculumContext(projectRoot: string): Promise<CurriculumContext> {
	const curriculumRoot = join(getPresentationProjectPaths(projectRoot).presentationRoot, "curriculum");
	const markdownPaths: string[] = [];

	try {
		await collectMarkdownFiles(curriculumRoot, markdownPaths);
	} catch (error) {
		if (isNotFoundError(error)) {
			return {
				curriculumRoot,
				files: [],
				combinedMarkdown: "",
				warnings: [`Missing curriculum folder: ${curriculumRoot}`],
			};
		}
		throw error;
	}

	const files: CurriculumMarkdownFile[] = [];
	for (const markdownPath of markdownPaths) {
		files.push({
			relativePath: toPortableRelativePath(curriculumRoot, markdownPath),
			content: await readFile(markdownPath, "utf-8"),
		});
	}

	return {
		curriculumRoot,
		files,
		combinedMarkdown: files.map((file) => file.content.trimEnd()).join("\n\n"),
		warnings: [],
	};
}
