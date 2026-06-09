import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { probeMediaFile } from "../media/media-prober.ts";
import type { MusicLessonStoryboard } from "../storyboard/slide-spec.ts";
import type { PptxPackagePart } from "./pptx-package.ts";
import type { SlideMediaRenderRef } from "./slide-writer.ts";

export type EmbeddedMediaParts = {
	parts: PptxPackagePart[];
	mediaExtensions: string[];
	slideMediaRefs: Map<number, SlideMediaRenderRef[]>;
};

const placeholderPng = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
	"base64",
);

function extensionOf(path: string) {
	return extname(path).replace(/^\./, "").toLowerCase();
}

export async function buildEmbeddedMediaParts(storyboard: MusicLessonStoryboard): Promise<EmbeddedMediaParts> {
	const parts: PptxPackagePart[] = [];
	const mediaExtensions = new Set<string>();
	const slideMediaRefs = new Map<number, SlideMediaRenderRef[]>();
	let mediaNumber = 0;

	for (const [slideIndex, slide] of storyboard.slides.entries()) {
		for (const media of slide.media) {
			if (media.embedMode !== "embedded") {
				throw new Error(`Media ${media.mediaId} must be embedded for PPTX export`);
			}
			const probe = await probeMediaFile(media.sourcePath);
			if (!probe.supported || probe.kind !== media.kind) {
				throw new Error(`Unsupported or mismatched media file: ${media.sourcePath}`);
			}

			mediaNumber += 1;
			const extension = extensionOf(media.sourcePath);
			mediaExtensions.add(extension);
			mediaExtensions.add("png");
			parts.push({ path: `ppt/media/media${mediaNumber}.${extension}`, data: await readFile(media.sourcePath) });

			const visualPath =
				media.kind === "audio" ? `ppt/media/audio-icon${mediaNumber}.png` : `ppt/media/poster${mediaNumber}.png`;
			const visualData =
				media.kind === "video" && media.posterPath ? await readFile(media.posterPath) : placeholderPng;
			parts.push({ path: visualPath, data: visualData });

			const slideNumber = slideIndex + 1;
			const mediaRefs = slideMediaRefs.get(slideNumber) ?? [];
			mediaRefs.push({
				mediaId: media.mediaId,
				kind: media.kind,
				label: media.label,
				display: media.display,
				mediaRelationshipId: `rIdMedia${mediaNumber}`,
				visualRelationshipId: `rIdMediaVisual${mediaNumber}`,
			});
			slideMediaRefs.set(slideNumber, mediaRefs);
		}
	}

	return {
		parts,
		mediaExtensions: [...mediaExtensions].sort((a, b) => a.localeCompare(b)),
		slideMediaRefs,
	};
}
