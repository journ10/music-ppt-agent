export type TextbookIndex = {
	version: 1;
	books: TextbookBookIndex[];
	generatedAt: string;
};

export type TextbookBookIndex = {
	bookId: string;
	title: string;
	subject: "music";
	sourceId?: string;
	publisher?: string;
	grade?: string;
	volume?: "上册" | "下册";
	filePath: string;
	fileHash: string;
	pageCount: number;
	unitsIndexPath: string;
	pagesIndexPath: string;
};

export type TextbookPageIndex = {
	pageNumber: number;
	printedPageNumber?: number;
	text: string;
	headings: string[];
	detectedSongs: string[];
	detectedActivities: string[];
	hasScore: boolean;
	hasLyrics: boolean;
	hasImage: boolean;
};

export type TextbookLessonIndex = {
	lessonId: string;
	unitTitle?: string;
	lessonTitle: string;
	pageStart: number;
	pageEnd: number;
	songs: string[];
	activities: string[];
	confidence: "high" | "medium" | "low";
};

export type LessonResolutionRequest = {
	title: string;
	grade?: string;
	volume?: "上册" | "下册";
	publisher?: string;
};

export type ResolvedTextbookLesson = TextbookLessonIndex & {
	bookId: string;
	bookTitle: string;
	publisher?: string;
	grade?: string;
	volume?: "上册" | "下册";
	pagesIndexPath: string;
	unitsIndexPath: string;
};

export type TextbookLessonResolution = {
	matches: ResolvedTextbookLesson[];
	ambiguous: boolean;
};
