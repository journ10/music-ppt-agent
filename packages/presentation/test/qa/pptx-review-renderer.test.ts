import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPptxReview } from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { tinyPngFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createTempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "pi-pptx-review-"));
	tempDirs.push(projectRoot);
	return projectRoot;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("renderPptxReview", () => {
	it("runs the PPTX to PDF to PNG to contact sheet review pipeline", async () => {
		const projectRoot = await createTempProject();
		const pptxPath = join(projectRoot, "lesson.pptx");
		const outputDir = join(projectRoot, "review");
		await writeFile(pptxPath, "fake pptx", "utf-8");
		const commands: string[] = [];

		const report = await renderPptxReview({
			pptxPath,
			outputDir,
			libreOfficePath: "fake-soffice",
			pdfToPngPath: "fake-pdftoppm",
			pythonPath: "fake-python",
			commandRunner: async (command, args) => {
				commands.push(`${command} ${args.join(" ")}`);
				if (command === "fake-soffice") {
					await writeFile(join(outputDir, "lesson.pdf"), "fake pdf", "utf-8");
					return;
				}
				if (command === "fake-pdftoppm") {
					const prefix = args[args.length - 1];
					await mkdir(join(outputDir, "pages"), { recursive: true });
					await writeFile(`${prefix}-1.png`, tinyPngFixture());
					return;
				}
				if (command === "fake-python") {
					await writeFile(join(outputDir, "contact-sheet.png"), tinyPngFixture());
					return;
				}
				throw new Error(`Unexpected command: ${command}`);
			},
		});

		expect(commands[0]).toContain("fake-soffice --headless --convert-to pdf");
		expect(commands[1]).toContain("fake-pdftoppm -png -r 144");
		expect(commands[2]).toContain("fake-python");
		expect(report.pageImagePaths).toEqual([join(outputDir, "pages", "page-1.png")]);
		expect(report.contactSheetPath).toBe(join(outputDir, "contact-sheet.png"));
		expect(await readFile(report.reportMarkdownPath, "utf-8")).toContain("Page images: 1");
		expect(JSON.parse(await readFile(report.reportJsonPath, "utf-8"))).toMatchObject({
			pptxPath,
			outputDir,
			pageImagePaths: [join(outputDir, "pages", "page-1.png")],
			errors: [],
		});
	});
});
