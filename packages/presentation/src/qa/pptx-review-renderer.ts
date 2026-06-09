import { spawn } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export type PptxReviewReport = {
	pptxPath: string;
	outputDir: string;
	pdfPath: string;
	pageImagePaths: string[];
	contactSheetPath: string;
	reportJsonPath: string;
	reportMarkdownPath: string;
	errors: string[];
	warnings: string[];
};

export type PptxReviewCommandRunner = (command: string, args: string[]) => Promise<void>;

export type RenderPptxReviewOptions = {
	pptxPath: string;
	outputDir: string;
	libreOfficePath?: string;
	pdfToPngPath?: string;
	pythonPath?: string;
	dpi?: number;
	commandRunner?: PptxReviewCommandRunner;
};

export type PptxReviewRenderer = (options: RenderPptxReviewOptions) => Promise<PptxReviewReport>;

const CONTACT_SHEET_SCRIPT = `
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
images = [Image.open(path).convert("RGB") for path in payload["pageImagePaths"]]
thumb_width = int(payload["thumbWidth"])
padding = int(payload["padding"])
label_height = int(payload["labelHeight"])
columns = int(payload["columns"])
thumbs = []
for image in images:
    ratio = thumb_width / image.width
    thumb_height = max(1, round(image.height * ratio))
    thumbs.append(image.resize((thumb_width, thumb_height)))
max_thumb_height = max(image.height for image in thumbs)
rows = math.ceil(len(thumbs) / columns)
sheet_width = padding + columns * (thumb_width + padding)
sheet_height = padding + rows * (max_thumb_height + label_height + padding)
sheet = Image.new("RGB", (sheet_width, sheet_height), "white")
draw = ImageDraw.Draw(sheet)
for index, thumb in enumerate(thumbs):
    col = index % columns
    row = index // columns
    x = padding + col * (thumb_width + padding)
    y = padding + row * (max_thumb_height + label_height + padding)
    sheet.paste(thumb, (x, y))
    draw.text((x, y + max_thumb_height + 8), f"Slide {index + 1}", fill=(32, 32, 32))
sheet.save(payload["contactSheetPath"])
`;

function isNotFoundError(error: unknown) {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function fileExists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function defaultCommandRunner(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stderr = "";
		child.stderr.setEncoding("utf-8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim()}`));
				return;
			}
			resolve();
		});
	});
}

function pptxBaseName(pptxPath: string) {
	return basename(pptxPath, extname(pptxPath));
}

async function listPageImages(pagesDir: string) {
	try {
		const entries = await readdir(pagesDir);
		return entries
			.filter((entry) => /^page-\d+\.png$/.test(entry))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
			.map((entry) => join(pagesDir, entry));
	} catch (error) {
		if (isNotFoundError(error)) {
			return [];
		}
		throw error;
	}
}

async function buildContactSheet(
	outputDir: string,
	pageImagePaths: string[],
	contactSheetPath: string,
	pythonPath: string,
	commandRunner: PptxReviewCommandRunner,
) {
	const scriptPath = join(outputDir, "build-contact-sheet.py");
	const payloadPath = join(outputDir, "contact-sheet-input.json");
	await writeFile(scriptPath, CONTACT_SHEET_SCRIPT.trimStart(), "utf-8");
	await writeFile(
		payloadPath,
		`${JSON.stringify(
			{
				pageImagePaths,
				contactSheetPath,
				columns: 4,
				thumbWidth: 320,
				padding: 24,
				labelHeight: 36,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
	await commandRunner(pythonPath, [scriptPath, payloadPath]);
}

function formatPptxReviewMarkdown(report: PptxReviewReport) {
	return `# PPTX Visual Review

- PPTX: ${report.pptxPath}
- PDF: ${report.pdfPath}
- Page images: ${report.pageImagePaths.length}
- Contact sheet: ${report.contactSheetPath}
- Errors: ${report.errors.length}
- Warnings: ${report.warnings.length}
`;
}

export async function renderPptxReview(options: RenderPptxReviewOptions): Promise<PptxReviewReport> {
	const outputDir = options.outputDir;
	const pagesDir = join(outputDir, "pages");
	const baseName = pptxBaseName(options.pptxPath);
	const pdfPath = join(outputDir, `${baseName}.pdf`);
	const contactSheetPath = join(outputDir, "contact-sheet.png");
	const reportJsonPath = join(outputDir, "review-report.json");
	const reportMarkdownPath = join(outputDir, "review-report.md");
	const commandRunner = options.commandRunner ?? defaultCommandRunner;
	await mkdir(pagesDir, { recursive: true });

	await commandRunner(options.libreOfficePath ?? process.env.PI_PRESENTATION_LIBREOFFICE ?? "soffice", [
		"--headless",
		"--convert-to",
		"pdf",
		"--outdir",
		outputDir,
		options.pptxPath,
	]);
	if (!(await fileExists(pdfPath))) {
		throw new Error(`LibreOffice did not create expected PDF: ${pdfPath}`);
	}

	await commandRunner(options.pdfToPngPath ?? process.env.PI_PRESENTATION_PDFTOPPM ?? "pdftoppm", [
		"-png",
		"-r",
		String(options.dpi ?? 144),
		pdfPath,
		join(pagesDir, "page"),
	]);
	const pageImagePaths = await listPageImages(pagesDir);
	if (pageImagePaths.length === 0) {
		throw new Error(`No rendered page PNGs found in ${pagesDir}`);
	}

	await buildContactSheet(
		outputDir,
		pageImagePaths,
		contactSheetPath,
		options.pythonPath ?? process.env.PI_PRESENTATION_PYTHON ?? "python3",
		commandRunner,
	);

	const report: PptxReviewReport = {
		pptxPath: options.pptxPath,
		outputDir,
		pdfPath,
		pageImagePaths,
		contactSheetPath,
		reportJsonPath,
		reportMarkdownPath,
		errors: [],
		warnings: [],
	};
	await Promise.all([
		writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
		writeFile(reportMarkdownPath, formatPptxReviewMarkdown(report), "utf-8"),
	]);
	return report;
}
