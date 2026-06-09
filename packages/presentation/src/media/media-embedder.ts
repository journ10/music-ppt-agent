import { buildEmbeddedMediaParts } from "../ooxml/media-writer.ts";
import { buildPptxParts, writePptxPackageFromParts } from "../ooxml/pptx-package.ts";
import type { MusicLessonStoryboard } from "../storyboard/slide-spec.ts";

export async function writePptxPackageWithMedia(storyboard: MusicLessonStoryboard) {
	const embeddedMedia = await buildEmbeddedMediaParts(storyboard);
	return writePptxPackageFromParts(
		buildPptxParts(storyboard, {
			extraParts: embeddedMedia.parts,
			mediaExtensions: embeddedMedia.mediaExtensions,
			slideMediaRefs: embeddedMedia.slideMediaRefs,
		}),
	);
}
