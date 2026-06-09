import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	indexTextbooks,
	initializePresentationProject,
	readPresentationSourceManifest,
	writePresentationSourceManifest,
} from "@earendil-works/pi-presentation";
import { afterEach, describe, expect, it } from "vitest";
import { runMusicPptCli } from "../../src/cli/music-ppt-cli.ts";
import { minimalPdfFixture, tinyPngFixture } from "../fixtures/binary-fixtures.ts";

const tempDirs: string[] = [];

async function createTempProject(prefix: string) {
	const projectRoot = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(projectRoot);
	return projectRoot;
}

function createOutputCollector() {
	const lines: string[] = [];
	return {
		lines,
		writeLine(value: string) {
			lines.push(value);
		},
	};
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runMusicPptCli", () => {
	it("prints direct CLI usage", async () => {
		const output = createOutputCollector();

		const exitCode = await runMusicPptCli(["--help"], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});

		expect(exitCode).toBe(0);
		expect(output.lines.join("\n")).toContain("music-ppt pptx");
	});

	it("initializes a project and reports source, guidance, and textbook status", async () => {
		const projectRoot = await createTempProject("pi-music-ppt-cli-status-");
		const output = createOutputCollector();

		await runMusicPptCli(["init", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});
		await runMusicPptCli(["sources", "status", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});
		await runMusicPptCli(["guidance", "status", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});
		await runMusicPptCli(["index", "status", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});

		expect(output.lines).toContain(`Initialized ${join(projectRoot, ".pi", "presentation")}`);
		expect(output.lines).toContain("Presentation sources: empty");
		expect(output.lines).toContain("Guidance index: 0/0 sources indexed, 0 constraints");
		expect(output.lines).toContain("Textbook index: 0 books");
	});

	it("adds guidance and textbook sources from the standalone CLI", async () => {
		const projectRoot = await createTempProject("pi-music-ppt-cli-sources-add-");
		await initializePresentationProject(projectRoot);
		const guidancePath = join(projectRoot, "guidance.pdf");
		const textbookPath = join(projectRoot, "grade1.pdf");
		await writeFile(guidancePath, minimalPdfFixture(["音乐课堂重视聆听、情感体验。"]));
		await writeFile(textbookPath, minimalPdfFixture(["温暖的家\n33"]));
		const output = createOutputCollector();

		const guidanceExitCode = await runMusicPptCli(
			[
				"sources",
				"add",
				"guidance",
				guidancePath,
				"--id",
				"guidance-2022",
				"--title",
				"指导思想",
				"--root",
				projectRoot,
			],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
			},
		);
		const textbookExitCode = await runMusicPptCli(
			[
				"sources",
				"add",
				"textbook",
				textbookPath,
				"--id",
				"yue-grade1-volume2",
				"--title",
				"粤教版一年级下册",
				"--publisher",
				"粤教版",
				"--grade",
				"一年级",
				"--volume",
				"下册",
				"--root",
				projectRoot,
			],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
			},
		);
		await runMusicPptCli(["sources", "status", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});

		expect(guidanceExitCode).toBe(0);
		expect(textbookExitCode).toBe(0);
		expect(output.lines.join("\n")).toContain("Added presentation source guidance-2022 (guidance)");
		expect(output.lines.join("\n")).toContain("Presentation sources: guidance: 1, textbook: 1");
		expect((await readPresentationSourceManifest(projectRoot)).sources).toEqual([
			{
				id: "guidance-2022",
				kind: "guidance",
				path: guidancePath,
				title: "指导思想",
			},
			{
				id: "yue-grade1-volume2",
				kind: "textbook",
				path: textbookPath,
				title: "粤教版一年级下册",
				subject: "music",
				publisher: "粤教版",
				grade: "一年级",
				volume: "下册",
			},
		]);
	});

	it("plans, renders, and exports a lesson from the standalone CLI", async () => {
		const projectRoot = await createTempProject("pi-music-ppt-cli-pipeline-");
		await initializePresentationProject(projectRoot);
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "粤教版-一年级下册.pdf"),
			minimalPdfFixture([
				"目录\n第5单元 幸福的一家 / 31\n演唱 温暖的家 / 33",
				"幸福的一家\n31",
				"温暖的家\n想想：你能为家人做些什么事情来表达自己的爱呢？\n33",
			]),
		);
		await indexTextbooks(projectRoot);
		const output = createOutputCollector();
		const exportedPath = join(projectRoot, "warm-home.pptx");

		const planExitCode = await runMusicPptCli(
			["plan", "做一年级下册《温暖的家》的教学PPT", "--root", projectRoot, "--project-id", "warm-home-plan"],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
			},
		);
		const svgExitCode = await runMusicPptCli(
			["svg", "做一年级下册《温暖的家》的教学PPT", "--root", projectRoot, "--project-id", "warm-home-svg"],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
				renderPdfPage: async (options) => {
					await writeFile(options.outputPath, tinyPngFixture());
					return {
						outputPath: options.outputPath,
						widthPx: 1600,
						heightPx: 2263,
					};
				},
			},
		);
		const pptxExitCode = await runMusicPptCli(
			[
				"pptx",
				"做一年级下册《温暖的家》的教学PPT",
				"--root",
				projectRoot,
				"--project-id",
				"warm-home-pptx",
				"--output",
				exportedPath,
			],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
				renderPdfPage: async (options) => {
					await writeFile(options.outputPath, tinyPngFixture());
					return {
						outputPath: options.outputPath,
						widthPx: 1600,
						heightPx: 2263,
					};
				},
				exportSvgProject: async (options) => {
					const outputPath = options.outputPath ?? exportedPath;
					await writeFile(outputPath, "fake pptx", "utf-8");
					return {
						projectDir: options.projectDir,
						outputPath,
						scriptPath: "fake-svg-to-pptx.py",
					};
				},
			},
		);

		expect(planExitCode).toBe(0);
		expect(svgExitCode).toBe(0);
		expect(pptxExitCode).toBe(0);
		expect(output.lines.join("\n")).toContain("Planned 温暖的家");
		expect(output.lines.join("\n")).toContain("Rendered SVG project");
		expect(output.lines.join("\n")).toContain(`Exported PPTX ${exportedPath}`);
		expect(await readFile(exportedPath, "utf-8")).toBe("fake pptx");
	});

	it("rebuilds guidance from source manifest and inspects indexed lessons", async () => {
		const projectRoot = await createTempProject("pi-music-ppt-cli-index-");
		await initializePresentationProject(projectRoot);
		const guidancePath = join(projectRoot, "guidance.pdf");
		await writeFile(guidancePath, minimalPdfFixture(["音乐课堂重视聆听、情感体验、小组合作和实践活动。"]));
		await writePresentationSourceManifest(projectRoot, {
			version: 1,
			sources: [{ id: "guidance", kind: "guidance", path: guidancePath, title: "指导思想" }],
		});
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "粤教版-一年级下册.pdf"),
			minimalPdfFixture([
				"目录\n第5单元 幸福的一家 / 31\n演唱 温暖的家 / 33",
				"幸福的一家\n31",
				"温暖的家\n想想：你能为家人做些什么事情来表达自己的爱呢？\n33",
			]),
		);
		const output = createOutputCollector();

		const guidanceExitCode = await runMusicPptCli(["guidance", "rebuild", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});
		const indexExitCode = await runMusicPptCli(["index", "rebuild", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});
		const inspectExitCode = await runMusicPptCli(["index", "inspect", "温暖的家", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});

		expect(guidanceExitCode).toBe(0);
		expect(indexExitCode).toBe(0);
		expect(inspectExitCode).toBe(0);
		expect(output.lines.join("\n")).toContain("Guidance index: 1/1 sources indexed");
		expect(output.lines.join("\n")).toContain("Indexed 1, skipped 0");
		expect(output.lines.join("\n")).toContain("粤教版-一年级下册《温暖的家》第3-3页");
	});

	it("stores PPT Master configuration, reports doctor status, and reuses the configured exporter", async () => {
		const projectRoot = await createTempProject("pi-music-ppt-cli-config-");
		await initializePresentationProject(projectRoot);
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "粤教版-一年级下册.pdf"),
			minimalPdfFixture([
				"目录\n第5单元 幸福的一家 / 31\n演唱 温暖的家 / 33",
				"幸福的一家\n31",
				"温暖的家\n想想：你能为家人做些什么事情来表达自己的爱呢？\n33",
			]),
		);
		await indexTextbooks(projectRoot);
		const exporterPath = join(projectRoot, "svg_to_pptx.py");
		await writeFile(exporterPath, "# fake exporter\n", "utf-8");
		const output = createOutputCollector();
		let receivedScriptPath: string | undefined;

		const configExitCode = await runMusicPptCli(
			["config", "set", "ppt-master", exporterPath, "--root", projectRoot],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
			},
		);
		const showExitCode = await runMusicPptCli(["config", "show", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});
		const doctorExitCode = await runMusicPptCli(["doctor", "--root", projectRoot], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
		});
		const pptxExitCode = await runMusicPptCli(
			["pptx", "做一年级下册《温暖的家》的教学PPT", "--root", projectRoot, "--project-id", "configured-pptx"],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
				renderPdfPage: async (options) => {
					await writeFile(options.outputPath, tinyPngFixture());
					return {
						outputPath: options.outputPath,
						widthPx: 1600,
						heightPx: 2263,
					};
				},
				exportSvgProject: async (options) => {
					receivedScriptPath = options.svgToPptxScript;
					const outputPath = options.outputPath ?? join(projectRoot, "configured.pptx");
					await writeFile(outputPath, "fake pptx", "utf-8");
					return {
						projectDir: options.projectDir,
						outputPath,
						scriptPath: options.svgToPptxScript ?? "missing",
					};
				},
			},
		);

		expect(configExitCode).toBe(0);
		expect(showExitCode).toBe(0);
		expect(doctorExitCode).toBe(0);
		expect(pptxExitCode).toBe(0);
		expect(receivedScriptPath).toBe(exporterPath);
		expect(output.lines.join("\n")).toContain(`PPT Master SVG exporter: ${exporterPath}`);
		expect(output.lines.join("\n")).toContain("Visual QA LibreOffice:");
		expect(output.lines.join("\n")).toContain("Visual QA PDF renderer:");
		expect(output.lines.join("\n")).toContain("Doctor: ready");
	});

	it("renders PPTX review artifacts from the standalone CLI", async () => {
		const projectRoot = await createTempProject("pi-music-ppt-cli-review-");
		await initializePresentationProject(projectRoot);
		const pptxPath = join(projectRoot, "lesson.pptx");
		const outputDir = join(projectRoot, "review");
		await writeFile(pptxPath, "fake pptx", "utf-8");
		const output = createOutputCollector();

		const exitCode = await runMusicPptCli(["review", pptxPath, "--root", projectRoot, "--out", outputDir], {
			cwd: "/tmp",
			stdout: output.writeLine,
			stderr: output.writeLine,
			renderPptxReview: async (options) => {
				const pdfPath = join(options.outputDir, "lesson.pdf");
				const pageImagePath = join(options.outputDir, "pages", "page-01.png");
				const contactSheetPath = join(options.outputDir, "contact-sheet.png");
				const reportJsonPath = join(options.outputDir, "review-report.json");
				const reportMarkdownPath = join(options.outputDir, "review-report.md");
				await mkdir(join(options.outputDir, "pages"), { recursive: true });
				await writeFile(pdfPath, "fake pdf", "utf-8");
				await writeFile(pageImagePath, tinyPngFixture());
				await writeFile(contactSheetPath, tinyPngFixture());
				await writeFile(reportJsonPath, "{}", "utf-8");
				await writeFile(reportMarkdownPath, "# Review\n", "utf-8");
				return {
					pptxPath: options.pptxPath,
					outputDir: options.outputDir,
					pdfPath,
					pageImagePaths: [pageImagePath],
					contactSheetPath,
					reportJsonPath,
					reportMarkdownPath,
					errors: [],
					warnings: [],
				};
			},
		});

		expect(exitCode).toBe(0);
		expect(output.lines.join("\n")).toContain(`Review contact sheet: ${join(outputDir, "contact-sheet.png")}`);
		expect(output.lines.join("\n")).toContain(`Review report: ${join(outputDir, "review-report.md")}`);
		expect(await readFile(join(outputDir, "review-report.md"), "utf-8")).toBe("# Review\n");
	});

	it("can run visual review immediately after PPTX export", async () => {
		const projectRoot = await createTempProject("pi-music-ppt-cli-pptx-review-");
		await initializePresentationProject(projectRoot);
		await writeFile(
			join(projectRoot, ".pi", "presentation", "textbooks", "粤教版-一年级下册.pdf"),
			minimalPdfFixture([
				"目录\n第5单元 幸福的一家 / 31\n演唱 温暖的家 / 33",
				"幸福的一家\n31",
				"温暖的家\n想想：你能为家人做些什么事情来表达自己的爱呢？\n33",
			]),
		);
		await indexTextbooks(projectRoot);
		const output = createOutputCollector();
		const exportedPath = join(projectRoot, "reviewed.pptx");
		let reviewedPptxPath: string | undefined;

		const exitCode = await runMusicPptCli(
			[
				"pptx",
				"做一年级下册《温暖的家》的教学PPT",
				"--root",
				projectRoot,
				"--project-id",
				"reviewed-pptx",
				"--output",
				exportedPath,
				"--review",
			],
			{
				cwd: "/tmp",
				stdout: output.writeLine,
				stderr: output.writeLine,
				renderPdfPage: async (options) => {
					await writeFile(options.outputPath, tinyPngFixture());
					return {
						outputPath: options.outputPath,
						widthPx: 1600,
						heightPx: 2263,
					};
				},
				exportSvgProject: async (options) => {
					const outputPath = options.outputPath ?? exportedPath;
					await writeFile(outputPath, "fake pptx", "utf-8");
					return {
						projectDir: options.projectDir,
						outputPath,
						scriptPath: "fake-svg-to-pptx.py",
					};
				},
				renderPptxReview: async (options) => {
					reviewedPptxPath = options.pptxPath;
					const reportMarkdownPath = join(options.outputDir, "review-report.md");
					const contactSheetPath = join(options.outputDir, "contact-sheet.png");
					await mkdir(options.outputDir, { recursive: true });
					await writeFile(contactSheetPath, tinyPngFixture());
					await writeFile(reportMarkdownPath, "# Review\n", "utf-8");
					return {
						pptxPath: options.pptxPath,
						outputDir: options.outputDir,
						pdfPath: join(options.outputDir, "reviewed.pdf"),
						pageImagePaths: [join(options.outputDir, "page-1.png")],
						contactSheetPath,
						reportJsonPath: join(options.outputDir, "review-report.json"),
						reportMarkdownPath,
						errors: [],
						warnings: [],
					};
				},
			},
		);

		expect(exitCode).toBe(0);
		expect(reviewedPptxPath).toBe(exportedPath);
		expect(output.lines.join("\n")).toContain(`Exported PPTX ${exportedPath}`);
		expect(output.lines.join("\n")).toContain("Review contact sheet:");
	});
});
