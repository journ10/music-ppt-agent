export type NormalizedMusicLessonRequest = {
	rawText: string;
	title: string;
	grade?: string;
	volume?: "上册" | "下册";
	publisher?: string;
};

export function normalizeMusicLessonRequest(rawText: string): NormalizedMusicLessonRequest {
	const title = rawText.match(/《([^》]+)》/)?.[1] ?? fallbackTitle(rawText);
	const grade = rawText.match(/([一二三四五六]年级)/)?.[1];
	const volume = rawText.includes("下册")
		? ("下册" as const)
		: rawText.includes("上册")
			? ("上册" as const)
			: undefined;
	const publisher = rawText.match(/([一-龥A-Za-z0-9]+版)/)?.[1]?.replace(/^(做|请|生成)/, "");

	return {
		rawText,
		title,
		grade,
		volume,
		publisher,
	};
}

function fallbackTitle(rawText: string) {
	return rawText
		.replace(/PPT|ppt|课件|教学|音乐|小学|做/g, " ")
		.replace(/[《》]/g, "")
		.trim()
		.replace(/\s+/g, " ");
}
