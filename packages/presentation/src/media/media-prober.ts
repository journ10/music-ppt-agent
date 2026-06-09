import { open, stat } from "node:fs/promises";
import { extname } from "node:path";

export type MediaProbeResult = {
	sourcePath: string;
	kind?: "audio" | "video";
	extension: string;
	supported: boolean;
	sizeBytes?: number;
	warnings: string[];
};

const SupportedAudioExtensions = new Set(["mp3", "wav", "m4a"]);
const SupportedVideoExtensions = new Set(["mp4"]);

async function readSignature(sourcePath: string) {
	const file = await open(sourcePath, "r");
	try {
		const buffer = Buffer.alloc(64);
		const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
		return buffer.subarray(0, bytesRead);
	} finally {
		await file.close();
	}
}

function ascii(bytes: Buffer, start: number, end: number) {
	return bytes.subarray(start, end).toString("ascii");
}

function hasMp3Signature(bytes: Buffer) {
	return ascii(bytes, 0, 3) === "ID3" || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

function hasWavSignature(bytes: Buffer) {
	return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE";
}

function hasMp4Signature(bytes: Buffer) {
	return bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp";
}

function signatureMatches(extension: string, bytes: Buffer) {
	switch (extension) {
		case "mp3":
			return hasMp3Signature(bytes);
		case "wav":
			return hasWavSignature(bytes);
		case "m4a":
		case "mp4":
			return hasMp4Signature(bytes);
		default:
			return false;
	}
}

export async function probeMediaFile(sourcePath: string): Promise<MediaProbeResult> {
	const extension = extname(sourcePath).replace(/^\./, "").toLowerCase();
	const kind = SupportedAudioExtensions.has(extension)
		? ("audio" as const)
		: SupportedVideoExtensions.has(extension)
			? ("video" as const)
			: undefined;
	const stats = await stat(sourcePath);
	const supportedExtension = kind !== undefined;
	const supported = supportedExtension && signatureMatches(extension, await readSignature(sourcePath));
	return {
		sourcePath,
		kind,
		extension,
		supported,
		sizeBytes: stats.size,
		warnings: supported
			? []
			: supportedExtension
				? [`Media signature does not match .${extension}`]
				: [`Unsupported media format: ${extension || "unknown"}`],
	};
}
