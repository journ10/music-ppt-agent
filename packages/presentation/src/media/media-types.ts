export type SlideMedia = {
	mediaId: string;
	kind: "audio" | "video";
	sourcePath: string;
	embedMode: "embedded" | "linked";
	startMode: "on-click" | "auto";
	display: "icon" | "poster" | "player" | "hidden";
	label: string;
	posterPath?: string;
	trim?: { startMs: number; endMs?: number };
	loop?: boolean;
	volume?: number;
};
