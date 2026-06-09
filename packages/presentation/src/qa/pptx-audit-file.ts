import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { auditPptxPackage, formatPptxAuditMarkdown, type PptxAuditReport } from "./pptx-audit.ts";

export type AuditPptxFileOptions = {
	pptxPath: string;
	outputDir: string;
	expectedSlideCount?: number;
};

export type AuditPptxFileResult = {
	report: PptxAuditReport;
	reportJsonPath: string;
	reportMarkdownPath: string;
};

export async function auditPptxFile(options: AuditPptxFileOptions): Promise<AuditPptxFileResult> {
	await mkdir(options.outputDir, { recursive: true });
	const report = auditPptxPackage(await readFile(options.pptxPath), {
		expectedSlideCount: options.expectedSlideCount,
	});
	const reportJsonPath = join(options.outputDir, "audit-report.json");
	const reportMarkdownPath = join(options.outputDir, "audit-report.md");
	await Promise.all([
		writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
		writeFile(reportMarkdownPath, formatPptxAuditMarkdown(report), "utf-8"),
	]);
	return {
		report,
		reportJsonPath,
		reportMarkdownPath,
	};
}
