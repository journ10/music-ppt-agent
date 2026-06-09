import type { MusicLessonStoryboard } from "../storyboard/slide-spec.ts";
import type { SlideMedia } from "./media-types.ts";

export type MediaManifestItem = SlideMedia & {
	slideId: string;
	embedded: boolean;
};

export type MediaManifest = {
	items: MediaManifestItem[];
};

export function buildMediaManifest(storyboard: MusicLessonStoryboard): MediaManifest {
	return {
		items: storyboard.slides.flatMap((slide) =>
			slide.media.map((media) => ({
				...media,
				slideId: slide.slideId,
				embedded: media.embedMode === "embedded",
			})),
		),
	};
}
