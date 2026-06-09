import { extname } from "node:path";
import type { MediaManifest } from "../media/media-manifest.ts";
import { readPptxPackageText } from "../ooxml/pptx-package.ts";

export type PptxMediaAuditItem = {
	mediaId: string;
	kind: "audio" | "video";
	embedded: boolean;
	contentTypePresent: boolean;
	relationshipPresent: boolean;
	visualPlaceholderPresent: boolean;
};

function extensionOf(path: string) {
	return extname(path).replace(/^\./, "").toLowerCase();
}

function slideNumberFromId(slideId: string, fallback: number) {
	const numeric = slideId.match(/(\d+)$/)?.[1];
	return numeric ? Number.parseInt(numeric, 10) : fallback;
}

export function auditMediaParts(zip: Buffer, entries: string[], manifest?: MediaManifest) {
	if (!manifest) return [];
	const contentTypes = readPptxPackageText(zip, "[Content_Types].xml");

	return manifest.items.map((item, index): PptxMediaAuditItem => {
		const mediaNumber = index + 1;
		const extension = extensionOf(item.sourcePath);
		const mediaPath = `ppt/media/media${mediaNumber}.${extension}`;
		const visualPath = `ppt/media/${item.kind === "audio" ? "audio-icon" : "poster"}${mediaNumber}.png`;
		const slideNumber = slideNumberFromId(item.slideId, mediaNumber);
		const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
		const rels = entries.includes(relsPath) ? readPptxPackageText(zip, relsPath) : "";

		return {
			mediaId: item.mediaId,
			kind: item.kind,
			embedded: entries.includes(mediaPath),
			contentTypePresent: contentTypes.includes(`Extension="${extension}"`),
			relationshipPresent: rels.includes(`../media/media${mediaNumber}.${extension}`),
			visualPlaceholderPresent: item.display === "hidden" || entries.includes(visualPath),
		};
	});
}
