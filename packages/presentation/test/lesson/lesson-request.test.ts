import { normalizeMusicLessonRequest } from "@earendil-works/pi-presentation";
import { describe, expect, it } from "vitest";

describe("normalizeMusicLessonRequest", () => {
	it("extracts grade, volume, lesson title, and optional publisher from natural language", () => {
		expect(normalizeMusicLessonRequest("做人音版三年级上册《小雨沙沙》的教学PPT")).toEqual({
			rawText: "做人音版三年级上册《小雨沙沙》的教学PPT",
			title: "小雨沙沙",
			grade: "三年级",
			volume: "上册",
			publisher: "人音版",
		});
	});

	it("falls back to a trimmed title when book quotes are not present", () => {
		expect(normalizeMusicLessonRequest("音乐PPT 小雨沙沙")).toEqual({
			rawText: "音乐PPT 小雨沙沙",
			title: "小雨沙沙",
		});
	});
});
