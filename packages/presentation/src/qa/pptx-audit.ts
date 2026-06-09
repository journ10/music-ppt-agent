import type { MediaManifest } from "../media/media-manifest.ts";
import { listPptxPackageEntries } from "../ooxml/pptx-package.ts";
import { auditMediaParts, type PptxMediaAuditItem } from "./media-audit.ts";
import { auditSlideText, type ForbiddenTermFinding } from "./slide-text-audit.ts";

export type PptxAuditReport = {
	zipValid: boolean;
	slideCount: number;
	forbiddenTerms: ForbiddenTermFinding[];
	media: PptxMediaAuditItem[];
	errors: string[];
	warnings: string[];
};

export type PptxAuditOptions = {
	expectedSlideCount?: number;
	mediaManifest?: MediaManifest;
};

function slidePaths(entries: string[]) {
	return entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry));
}

export function auditPptxPackage(zip: Buffer, options: PptxAuditOptions = {}): PptxAuditReport {
	try {
		const entries = listPptxPackageEntries(zip);
		const slides = slidePaths(entries);
		const forbiddenTerms = auditSlideText(zip, slides);
		const media = auditMediaParts(zip, entries, options.mediaManifest);
		const errors: string[] = [];

		if (options.expectedSlideCount !== undefined && slides.length !== options.expectedSlideCount) {
			errors.push(`Expected ${options.expectedSlideCount} slides, found ${slides.length}.`);
		}
		if (forbiddenTerms.length > 0) {
			errors.push("Forbidden student-facing terms found.");
		}
		for (const item of media) {
			if (!item.embedded) errors.push(`Embedded media ${item.mediaId} is missing from ppt/media.`);
			if (!item.contentTypePresent) errors.push(`Embedded media ${item.mediaId} is missing a content type.`);
			if (!item.relationshipPresent) errors.push(`Embedded media ${item.mediaId} is missing a slide relationship.`);
			if (!item.visualPlaceholderPresent)
				errors.push(`Embedded media ${item.mediaId} is missing a visual placeholder.`);
		}

		return {
			zipValid: true,
			slideCount: slides.length,
			forbiddenTerms,
			media,
			errors,
			warnings: [],
		};
	} catch (error) {
		return {
			zipValid: false,
			slideCount: 0,
			forbiddenTerms: [],
			media: [],
			errors: [error instanceof Error ? error.message : String(error)],
			warnings: [],
		};
	}
}

export function formatPptxAuditMarkdown(report: PptxAuditReport) {
	const lines = [
		"# PPTX Audit",
		"",
		`- Zip valid: ${report.zipValid ? "yes" : "no"}`,
		`- Slide count: ${report.slideCount}`,
		`- Forbidden terms: ${report.forbiddenTerms.length}`,
		`- Media items: ${report.media.length}`,
		`- Errors: ${report.errors.length}`,
	];
	return `${lines.join("\n")}\n`;
}
