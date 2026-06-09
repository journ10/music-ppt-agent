import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type PdfPageRenderOptions = {
	pdfPath: string;
	pageNumber: number;
	outputPath: string;
	widthPx?: number;
};

export type PdfPageRenderResult = {
	outputPath: string;
	widthPx: number;
	heightPx: number;
};

export type PdfPageRenderer = (options: PdfPageRenderOptions) => Promise<PdfPageRenderResult>;

const PDF_PAGE_RENDER_SCRIPT = [
	"import AppKit",
	"import Foundation",
	"import PDFKit",
	"",
	"struct RenderResult: Encodable {",
	"    let outputPath: String",
	"    let widthPx: Int",
	"    let heightPx: Int",
	"}",
	"",
	"let pdfPath = CommandLine.arguments[1]",
	"let pageNumber = Int(CommandLine.arguments[2]) ?? 1",
	"let outputPath = CommandLine.arguments[3]",
	"let targetWidth = CGFloat(Int(CommandLine.arguments[4]) ?? 1600)",
	"",
	"guard let document = PDFDocument(url: URL(fileURLWithPath: pdfPath)),",
	"      let page = document.page(at: max(0, pageNumber - 1)) else {",
	"    exit(2)",
	"}",
	"",
	"let bounds = page.bounds(for: .mediaBox)",
	"let scale = targetWidth / max(bounds.width, 1)",
	"let width = max(1, Int(bounds.width * scale))",
	"let height = max(1, Int(bounds.height * scale))",
	"guard let context = CGContext(",
	"    data: nil,",
	"    width: width,",
	"    height: height,",
	"    bitsPerComponent: 8,",
	"    bytesPerRow: 0,",
	"    space: CGColorSpaceCreateDeviceRGB(),",
	"    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue",
	") else {",
	"    exit(3)",
	"}",
	"",
	"context.setFillColor(NSColor.white.cgColor)",
	"context.fill(CGRect(x: 0, y: 0, width: width, height: height))",
	"context.saveGState()",
	"context.scaleBy(x: scale, y: scale)",
	"page.draw(with: .mediaBox, to: context)",
	"context.restoreGState()",
	"guard let image = context.makeImage() else {",
	"    exit(4)",
	"}",
	"let rep = NSBitmapImageRep(cgImage: image)",
	"guard let data = rep.representation(using: .png, properties: [:]) else {",
	"    exit(5)",
	"}",
	"try data.write(to: URL(fileURLWithPath: outputPath))",
	"let encoded = try JSONEncoder().encode(RenderResult(outputPath: outputPath, widthPx: width, heightPx: height))",
	"FileHandle.standardOutput.write(encoded)",
].join("\n");

function parseRenderResult(stdout: string): PdfPageRenderResult {
	const parsed = JSON.parse(stdout) as PdfPageRenderResult;
	if (
		typeof parsed.outputPath !== "string" ||
		!Number.isInteger(parsed.widthPx) ||
		!Number.isInteger(parsed.heightPx)
	) {
		throw new Error("Invalid PDF page render result.");
	}
	return parsed;
}

export async function renderPdfPageToPng(options: PdfPageRenderOptions): Promise<PdfPageRenderResult> {
	const swiftExecutable = process.env.PI_PRESENTATION_PDF_RENDER_SWIFT ?? "swift";
	const scriptDirectory = await mkdtemp(join(tmpdir(), "pi-presentation-pdf-render-"));
	const scriptPath = join(scriptDirectory, "render-pdf-page.swift");
	await writeFile(scriptPath, PDF_PAGE_RENDER_SCRIPT, "utf-8");

	return new Promise((resolve, reject) => {
		const child = spawn(
			swiftExecutable,
			[
				"-module-cache-path",
				join(tmpdir(), "pi-presentation-swift-module-cache"),
				scriptPath,
				options.pdfPath,
				String(options.pageNumber),
				options.outputPath,
				String(options.widthPx ?? 1600),
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf-8");
		child.stderr.setEncoding("utf-8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", async (error) => {
			await rm(scriptDirectory, { recursive: true, force: true });
			reject(error);
		});
		child.on("close", async (code) => {
			await rm(scriptDirectory, { recursive: true, force: true });
			if (code !== 0) {
				reject(new Error(`PDF page render failed with exit code ${code}: ${stderr.trim()}`));
				return;
			}
			try {
				resolve(parseRenderResult(stdout));
			} catch (error) {
				reject(error);
			}
		});
	});
}
