import { presentationPackageName } from "@earendil-works/pi-presentation";
import { describe, expect, it } from "vitest";

describe("presentation package", () => {
	it("exports package identity", () => {
		expect(presentationPackageName).toBe("@earendil-works/pi-presentation");
	});
});
