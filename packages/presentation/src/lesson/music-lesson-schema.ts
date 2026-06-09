export type MusicLessonPlan = {
	title: string;
	grade?: string;
	volume?: string;
	textbook?: string;
	sourcePages: number[];
	teachingGoals: string[];
	keyPoints: string[];
	difficultPoints: string[];
	classroomFlow: MusicLessonActivity[];
};

export type MusicLessonActivity = {
	phase: "导入" | "聆听" | "演唱" | "律动" | "节奏" | "创编" | "评价" | "总结";
	teacherAction: string;
	studentAction: string;
	mediaCueIds: string[];
};
