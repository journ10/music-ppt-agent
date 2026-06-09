import { FORBIDDEN_STUDENT_SLIDE_TERMS } from "../curriculum/forbidden-slide-terms.ts";
import { readPptxPackageText } from "../ooxml/pptx-package.ts";

export type ForbiddenTermFinding = {
	slideId: string;
	term: string;
};

export function auditSlideText(zip: Buffer, slidePaths: string[]): ForbiddenTermFinding[] {
	const findings: ForbiddenTermFinding[] = [];
	for (const slidePath of slidePaths) {
		const slideXml = readPptxPackageText(zip, slidePath);
		const slideId = slidePath.match(/slide(\d+)\.xml$/)?.[1];
		for (const term of FORBIDDEN_STUDENT_SLIDE_TERMS) {
			if (slideXml.includes(term)) {
				findings.push({ slideId: `slide${slideId ?? "unknown"}`, term });
			}
		}
	}
	return findings;
}
