import { readFile } from "node:fs/promises";
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

function extractStreams(pdfBytes: Buffer): PdfStream[] {
	const source = pdfBytes.toString("latin1");
	const streams: PdfStream[] = [];
	const streamPattern = /(<<[\s\S]*?>>)\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
	let match: RegExpExecArray | null;

	match = streamPattern.exec(source);
	while (match !== null) {
		streams.push({
			dictionary: match[1],
			bytes: Buffer.from(match[2], "latin1"),
		});
		match = streamPattern.exec(source);
	}

	return streams;
}

function decodeStream(stream: PdfStream) {
	if (/\/Filter\s*(?:\[[^\]]*)?\/FlateDecode/.test(stream.dictionary)) {
		return inflateSync(stream.bytes);
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
		.map((stream) => extractTextFromStream(decodeStream(stream)))
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

export const extractPdfTextPages: PdfTextExtractor = async (pdfPath) => {
	const bytes = await readFile(pdfPath);
	if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
		return extractRawTextFixturePages(bytes);
	}
	return extractPdfPages(bytes);
};
