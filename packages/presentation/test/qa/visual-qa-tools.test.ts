import { resolveVisualQaToolPaths } from "@earendil-works/pi-presentation";
import { describe, expect, it } from "vitest";

describe("resolveVisualQaToolPaths", () => {
	it("prefers runtime config and environment values before PATH and common macOS locations", async () => {
		const existing = new Set([
			"/configured/soffice",
			"/env/pdftoppm",
			"/path/python3",
			"/Applications/LibreOffice.app/Contents/MacOS/soffice",
			"/opt/homebrew/bin/pdftoppm",
		]);

		const result = await resolveVisualQaToolPaths({
			config: {
				libreOfficePath: "/configured/soffice",
			},
			env: {
				PI_PRESENTATION_PDFTOPPM: "/env/pdftoppm",
			},
			pathEntries: ["/path"],
			commonLibreOfficePaths: ["/Applications/LibreOffice.app/Contents/MacOS/soffice"],
			commonPdfToPngPaths: ["/opt/homebrew/bin/pdftoppm"],
			fileExists: async (path) => existing.has(path),
		});

		expect(result).toEqual({
			libreOfficePath: "/configured/soffice",
			pdfToPngPath: "/env/pdftoppm",
			pythonPath: "/path/python3",
		});
	});

	it("falls back to common macOS installation paths when PATH does not contain the tools", async () => {
		const existing = new Set([
			"/Applications/LibreOffice.app/Contents/MacOS/soffice",
			"/opt/homebrew/bin/pdftoppm",
			"/usr/bin/python3",
		]);

		const result = await resolveVisualQaToolPaths({
			pathEntries: ["/missing"],
			commonLibreOfficePaths: ["/Applications/LibreOffice.app/Contents/MacOS/soffice"],
			commonPdfToPngPaths: ["/opt/homebrew/bin/pdftoppm"],
			commonPythonPaths: ["/usr/bin/python3"],
			fileExists: async (path) => existing.has(path),
		});

		expect(result).toEqual({
			libreOfficePath: "/Applications/LibreOffice.app/Contents/MacOS/soffice",
			pdfToPngPath: "/opt/homebrew/bin/pdftoppm",
			pythonPath: "/usr/bin/python3",
		});
	});
});
