import type { SlideMedia } from "../media/media-types.ts";

export type SlideSpec = {
	slideId: string;
	title: string;
	studentVisibleText: string[];
	teacherNotes: string;
	layout: "cover" | "map" | "song" | "listening" | "activity" | "summary" | "ending";
	assets: SlideAssetRef[];
	media: SlideMedia[];
};

export type SlideAssetRef = {
	assetId: string;
	kind: "textbook-page" | "score-crop" | "image" | "icon";
	role: "main" | "supporting" | "background" | "poster";
};

export type MusicLessonStoryboard = {
	lessonTitle: string;
	slides: SlideSpec[];
};
