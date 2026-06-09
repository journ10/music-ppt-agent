import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

export type PdfTextPage = {
	pageNumber: number;
	text: string;
};

export type PdfTextExtractor = (pdfPath: string) => Promise<PdfTextPage[]>;

type PdfStream = {
	dictionary: string;
	bytes: Buffer;
};

const STREAM_MARKER = Buffer.from("stream", "latin1");
const ENDSTREAM_MARKER = Buffer.from("endstream", "latin1");
const DICTIONARY_START_MARKER = Buffer.from("<<", "latin1");
const MAX_TEXT_STREAM_BYTES = 8 * 1024 * 1024;
const PYPDF_FIRST_PDF_BYTES = 16 * 1024 * 1024;
const MAX_PYPDF_STDOUT_BYTES = 64 * 1024 * 1024;
const MAX_VISION_OCR_STDOUT_BYTES = 128 * 1024 * 1024;
const PYPDF_SCRIPT = [
	"import json",
	"import sys",
	"from pypdf import PdfReader",
	"reader = PdfReader(sys.argv[1])",
	"pages = []",
	"for index, page in enumerate(reader.pages):",
	"    pages.append({'pageNumber': index + 1, 'text': page.extract_text() or ''})",
	"print(json.dumps(pages, ensure_ascii=False))",
].join("\n");
const VISION_OCR_SCRIPT = [
	"import AppKit",
	"import Foundation",
	"import PDFKit",
	"import Vision",
	"import ImageIO",
	"",
	"struct PageResult: Encodable {",
	"    let pageNumber: Int",
	"    let text: String",
	"}",
	"",
	"func renderPage(_ page: PDFPage, scale: CGFloat) -> CGImage? {",
	"    let bounds = page.bounds(for: .mediaBox)",
	"    let width = max(1, Int(bounds.width * scale))",
	"    let height = max(1, Int(bounds.height * scale))",
	"    let colorSpace = CGColorSpaceCreateDeviceRGB()",
	"    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {",
	"        return nil",
	"    }",
	"    context.setFillColor(NSColor.white.cgColor)",
	"    context.fill(CGRect(x: 0, y: 0, width: width, height: height))",
	"    context.saveGState()",
	"    context.scaleBy(x: scale, y: scale)",
	"    page.draw(with: .mediaBox, to: context)",
	"    context.restoreGState()",
	"    return context.makeImage()",
	"}",
	"",
	"func recognizeText(_ image: CGImage) throws -> String {",
	"    let request = VNRecognizeTextRequest()",
	"    request.revision = VNRecognizeTextRequestRevision3",
	"    request.recognitionLevel = .accurate",
	"    request.usesLanguageCorrection = false",
	'    request.recognitionLanguages = ["zh-Hans", "en-US"]',
	"    let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])",
	"    try handler.perform([request])",
	"    let observations = (request.results ?? []).sorted {",
	"        let yDelta = abs($0.boundingBox.midY - $1.boundingBox.midY)",
	"        if yDelta > 0.01 {",
	"            return $0.boundingBox.midY > $1.boundingBox.midY",
	"        }",
	"        return $0.boundingBox.minX < $1.boundingBox.minX",
	"    }",
	'    return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\\n")',
	"}",
	"",
	"let pdfPath = CommandLine.arguments[1]",
	"guard let document = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {",
	"    exit(3)",
	"}",
	"",
	"var results: [PageResult] = []",
	"for index in 0..<document.pageCount {",
	"    guard let page = document.page(at: index), let image = renderPage(page, scale: 2.0) else {",
	'        results.append(PageResult(pageNumber: index + 1, text: ""))',
	"        continue",
	"    }",
	'    let text = (try? recognizeText(image)) ?? ""',
	"    results.append(PageResult(pageNumber: index + 1, text: text))",
	"}",
	"",
	"let encoded = try JSONEncoder().encode(results)",
	"FileHandle.standardOutput.write(encoded)",
].join("\n");

function extractStreams(pdfBytes: Buffer): PdfStream[] {
	const streams: PdfStream[] = [];
	let searchOffset = 0;
	let streamStart = pdfBytes.indexOf(STREAM_MARKER, searchOffset);

	while (streamStart !== -1) {
		const dictionaryStart = pdfBytes.lastIndexOf(DICTIONARY_START_MARKER, streamStart);
		const contentStartWithoutLineBreak = streamStart + STREAM_MARKER.length;
		let contentStart = contentStartWithoutLineBreak;
		if (pdfBytes[contentStart] === 0x0d && pdfBytes[contentStart + 1] === 0x0a) {
			contentStart += 2;
		} else if (pdfBytes[contentStart] === 0x0a || pdfBytes[contentStart] === 0x0d) {
			contentStart += 1;
		}

		const streamEnd = pdfBytes.indexOf(ENDSTREAM_MARKER, contentStart);
		if (dictionaryStart === -1 || streamEnd === -1) {
			break;
		}

		streams.push({
			dictionary: pdfBytes.subarray(dictionaryStart, streamStart).toString("latin1"),
			bytes: pdfBytes.subarray(contentStart, streamEnd),
		});
		searchOffset = streamEnd + ENDSTREAM_MARKER.length;
		streamStart = pdfBytes.indexOf(STREAM_MARKER, searchOffset);
	}

	return streams;
}

function decodeStream(stream: PdfStream) {
	if (/\/Subtype\s*\/Image/.test(stream.dictionary) || stream.bytes.length > MAX_TEXT_STREAM_BYTES) {
		return undefined;
	}
	if (/\/Filter\s*(?:\[[^\]]*)?\/FlateDecode/.test(stream.dictionary)) {
		try {
			return inflateSync(stream.bytes);
		} catch {
			return undefined;
		}
	}
	return stream.bytes;
}

function decodeUtf16Be(bytes: Buffer, offset = 0) {
	let text = "";
	for (let index = offset; index + 1 < bytes.length; index += 2) {
		text += String.fromCharCode(bytes.readUInt16BE(index));
	}
	return text;
}

function decodePdfStringBytes(bytes: Buffer) {
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return decodeUtf16Be(bytes, 2);
	}
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return bytes.subarray(2).toString("utf16le");
	}
	return bytes.toString("utf-8");
}

function decodeHexPdfString(value: string) {
	const hex = value.slice(1, -1).replace(/\s+/g, "");
	if (hex.length === 0) {
		return "";
	}
	const normalizedHex = hex.length % 2 === 0 ? hex : `${hex}0`;
	return decodePdfStringBytes(Buffer.from(normalizedHex, "hex"));
}

function decodeLiteralPdfString(value: string) {
	const body = value.slice(1, -1);
	let text = "";

	for (let index = 0; index < body.length; index += 1) {
		const char = body[index];
		if (char !== "\\") {
			text += char;
			continue;
		}

		const next = body[index + 1];
		if (next === undefined) {
			continue;
		}

		if (next === "\n") {
			index += 1;
			continue;
		}
		if (next === "\r") {
			index += body[index + 2] === "\n" ? 2 : 1;
			continue;
		}

		const escapeMap: Record<string, string> = {
			n: "\n",
			r: "\r",
			t: "\t",
			b: "\b",
			f: "\f",
			"(": "(",
			")": ")",
			"\\": "\\",
		};

		if (next in escapeMap) {
			text += escapeMap[next];
			index += 1;
			continue;
		}

		if (/[0-7]/.test(next)) {
			const octal = body.slice(index + 1, index + 4).match(/^[0-7]{1,3}/)?.[0] ?? "";
			text += String.fromCharCode(Number.parseInt(octal, 8));
			index += octal.length;
			continue;
		}

		text += next;
		index += 1;
	}

	return text;
}

function decodePdfString(value: string) {
	return value.startsWith("<") ? decodeHexPdfString(value) : decodeLiteralPdfString(value);
}

function decodePdfTextOperand(operand: string) {
	if (!operand.startsWith("[")) {
		return decodePdfString(operand);
	}

	const strings = [...operand.matchAll(/<[\dA-Fa-f\s]+>|\((?:\\.|[^\\()])*\)/g)];
	return strings.map((match) => decodePdfString(match[0])).join("");
}

function extractTextFromStream(streamBytes: Buffer) {
	const content = streamBytes.toString("latin1");
	const fragments: string[] = [];
	const textOperationPattern = /(\[(?:\\.|[^\]])*\]|<[\dA-Fa-f\s]+>|\((?:\\.|[^\\()])*\))\s*(?:Tj|TJ)\b/g;
	let match: RegExpExecArray | null;

	match = textOperationPattern.exec(content);
	while (match !== null) {
		const text = decodePdfTextOperand(match[1]).trim();
		if (text.length > 0) {
			fragments.push(text);
		}
		match = textOperationPattern.exec(content);
	}

	return fragments.join("\n").trim();
}

function extractPdfPages(pdfBytes: Buffer) {
	return extractStreams(pdfBytes)
		.map((stream) => decodeStream(stream))
		.filter((streamBytes) => streamBytes !== undefined)
		.map((streamBytes) => extractTextFromStream(streamBytes))
		.filter((text) => text.length > 0)
		.map((text, index) => ({
			pageNumber: index + 1,
			text,
		}));
}

function extractRawTextFixturePages(bytes: Buffer) {
	return bytes
		.toString("utf-8")
		.split("\f")
		.map((text, index) => ({
			pageNumber: index + 1,
			text: text.trim(),
		}));
}

function parsePypdfPages(stdout: string) {
	const parsed = JSON.parse(stdout) as PdfTextPage[];
	if (!Array.isArray(parsed)) {
		return [];
	}
	return parsed
		.filter((page) => Number.isInteger(page.pageNumber) && typeof page.text === "string")
		.map((page) => ({
			pageNumber: page.pageNumber,
			text: page.text.trim(),
		}));
}

function hasExtractedText(pages: PdfTextPage[]) {
	return pages.some((page) => page.text.trim().length > 0);
}

async function extractPdfTextPagesWithPypdf(pdfPath: string): Promise<PdfTextPage[]> {
	const pythonExecutable = process.env.PI_PRESENTATION_PYPDF_PYTHON ?? "python3";
	return new Promise((resolve) => {
		const child = spawn(pythonExecutable, ["-c", PYPDF_SCRIPT, pdfPath], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let exceededStdoutLimit = false;

		child.stdout.setEncoding("utf-8");
		child.stderr.setEncoding("utf-8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
			if (stdout.length > MAX_PYPDF_STDOUT_BYTES) {
				exceededStdoutLimit = true;
				child.kill();
			}
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", () => resolve([]));
		child.on("close", (code) => {
			if (code !== 0 || exceededStdoutLimit || stderr.includes("ModuleNotFoundError")) {
				resolve([]);
				return;
			}
			try {
				resolve(parsePypdfPages(stdout));
			} catch {
				resolve([]);
			}
		});
	});
}

async function extractPdfTextPagesWithVisionOcr(pdfPath: string): Promise<PdfTextPage[]> {
	const swiftExecutable = process.env.PI_PRESENTATION_VISION_OCR_SWIFT ?? "swift";
	const scriptDirectory = await mkdtemp(join(tmpdir(), "pi-presentation-ocr-"));
	const scriptPath = join(scriptDirectory, "vision-ocr.swift");
	await writeFile(scriptPath, VISION_OCR_SCRIPT, "utf-8");
	return new Promise((resolve) => {
		const child = spawn(
			swiftExecutable,
			["-module-cache-path", join(tmpdir(), "pi-presentation-swift-module-cache"), scriptPath, pdfPath],
			{ stdio: ["ignore", "pipe", "ignore"] },
		);
		let stdout = "";
		let exceededStdoutLimit = false;

		child.stdout.setEncoding("utf-8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
			if (stdout.length > MAX_VISION_OCR_STDOUT_BYTES) {
				exceededStdoutLimit = true;
				child.kill();
			}
		});
		child.on("error", async () => {
			await rm(scriptDirectory, { recursive: true, force: true });
			resolve([]);
		});
		child.on("close", async (code) => {
			await rm(scriptDirectory, { recursive: true, force: true });
			if (code !== 0 || exceededStdoutLimit) {
				resolve([]);
				return;
			}
			try {
				resolve(parsePypdfPages(stdout));
			} catch {
				resolve([]);
			}
		});
	});
}

export const extractPdfTextPages: PdfTextExtractor = async (pdfPath) => {
	const bytes = await readFile(pdfPath);
	if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
		return extractRawTextFixturePages(bytes);
	}
	if (bytes.length > PYPDF_FIRST_PDF_BYTES) {
		const pypdfPages = await extractPdfTextPagesWithPypdf(pdfPath);
		return hasExtractedText(pypdfPages) ? pypdfPages : extractPdfTextPagesWithVisionOcr(pdfPath);
	}
	const pages = extractPdfPages(bytes);
	if (pages.length > 0) {
		return pages;
	}
	const pypdfPages = await extractPdfTextPagesWithPypdf(pdfPath);
	return hasExtractedText(pypdfPages) ? pypdfPages : extractPdfTextPagesWithVisionOcr(pdfPath);
};
