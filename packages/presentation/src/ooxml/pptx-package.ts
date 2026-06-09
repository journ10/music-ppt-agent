import type { MusicLessonStoryboard } from "../storyboard/slide-spec.ts";
import { writeContentTypes } from "./content-types.ts";
import {
	APP_PROPERTIES_RELATIONSHIP,
	AUDIO_RELATIONSHIP,
	CORE_PROPERTIES_RELATIONSHIP,
	IMAGE_RELATIONSHIP,
	PRESENTATION_RELATIONSHIP,
	SLIDE_RELATIONSHIP,
	VIDEO_RELATIONSHIP,
	writeRelationships,
} from "./relationships.ts";
import { type SlideMediaRenderRef, writeSlideXml } from "./slide-writer.ts";

export type PptxPackagePart = {
	path: string;
	data: Buffer;
};

export type PptxPackageBuildOptions = {
	extraParts?: PptxPackagePart[];
	mediaExtensions?: string[];
	slideMediaRefs?: Map<number, SlideMediaRenderRef[]>;
};

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
	let crc = i;
	for (let j = 0; j < 8; j += 1) {
		crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	crcTable[i] = crc >>> 0;
}

function crc32(buffer: Buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
	const buffer = Buffer.alloc(2);
	buffer.writeUInt16LE(value);
	return buffer;
}

function u32(value: number) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(value);
	return buffer;
}

export function writePptxPackageFromParts(parts: PptxPackagePart[]) {
	const localParts: Buffer[] = [];
	const centralParts: Buffer[] = [];
	let offset = 0;

	for (const part of parts) {
		const name = Buffer.from(part.path, "utf-8");
		const crc = crc32(part.data);
		const localHeader = Buffer.concat([
			u32(0x04034b50),
			u16(20),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(crc),
			u32(part.data.length),
			u32(part.data.length),
			u16(name.length),
			u16(0),
			name,
		]);
		localParts.push(localHeader, part.data);

		const centralHeader = Buffer.concat([
			u32(0x02014b50),
			u16(20),
			u16(20),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(crc),
			u32(part.data.length),
			u32(part.data.length),
			u16(name.length),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(0),
			u32(offset),
			name,
		]);
		centralParts.push(centralHeader);
		offset += localHeader.length + part.data.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const end = Buffer.concat([
		u32(0x06054b50),
		u16(0),
		u16(0),
		u16(parts.length),
		u16(parts.length),
		u32(centralDirectory.length),
		u32(offset),
		u16(0),
	]);
	return Buffer.concat([...localParts, centralDirectory, end]);
}

function textPart(path: string, text: string): PptxPackagePart {
	return { path, data: Buffer.from(text, "utf-8") };
}

function writePresentationXml(slideCount: number) {
	const slideIds = Array.from(
		{ length: slideCount },
		(_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`,
	).join("");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldIdLst>${slideIds}</p:sldIdLst>
<p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function writeCoreProperties(title: string) {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${title}</dc:title>
</cp:coreProperties>`;
}

function writeAppProperties(slideCount: number) {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Pi Presentation</Application>
<Slides>${slideCount}</Slides>
</Properties>`;
}

export function mediaRelationshipType(kind: "audio" | "video") {
	return kind === "audio" ? AUDIO_RELATIONSHIP : VIDEO_RELATIONSHIP;
}

function mediaPartExtension(kind: "audio" | "video") {
	return kind === "audio" ? "mp3" : "mp4";
}

export function buildPptxParts(
	storyboard: MusicLessonStoryboard,
	options: PptxPackageBuildOptions = {},
): PptxPackagePart[] {
	const slideRelationships = storyboard.slides.map((_, index) => ({
		id: `rId${index + 1}`,
		type: SLIDE_RELATIONSHIP,
		target: `slides/slide${index + 1}.xml`,
	}));
	return [
		textPart("[Content_Types].xml", writeContentTypes(storyboard.slides.length, options.mediaExtensions)),
		textPart(
			"_rels/.rels",
			writeRelationships([
				{ id: "rId1", type: PRESENTATION_RELATIONSHIP, target: "ppt/presentation.xml" },
				{ id: "rId2", type: CORE_PROPERTIES_RELATIONSHIP, target: "docProps/core.xml" },
				{ id: "rId3", type: APP_PROPERTIES_RELATIONSHIP, target: "docProps/app.xml" },
			]),
		),
		textPart("docProps/app.xml", writeAppProperties(storyboard.slides.length)),
		textPart("docProps/core.xml", writeCoreProperties(storyboard.lessonTitle)),
		textPart("ppt/_rels/presentation.xml.rels", writeRelationships(slideRelationships)),
		textPart("ppt/presentation.xml", writePresentationXml(storyboard.slides.length)),
		...storyboard.slides.map((_slide, index) => {
			const mediaRefs = options.slideMediaRefs?.get(index + 1) ?? [];
			return textPart(
				`ppt/slides/_rels/slide${index + 1}.xml.rels`,
				writeRelationships(
					mediaRefs.flatMap((media) => {
						const mediaNumber = media.mediaRelationshipId.replace("rIdMedia", "");
						return [
							{
								id: media.mediaRelationshipId,
								type: mediaRelationshipType(media.kind),
								target: `../media/media${mediaNumber}.${mediaPartExtension(media.kind)}`,
							},
							{
								id: media.visualRelationshipId,
								type: IMAGE_RELATIONSHIP,
								target: `../media/${media.kind === "audio" ? "audio-icon" : "poster"}${mediaNumber}.png`,
							},
						];
					}),
				),
			);
		}),
		...storyboard.slides.map((slide, index) =>
			textPart(
				`ppt/slides/slide${index + 1}.xml`,
				writeSlideXml(slide, options.slideMediaRefs?.get(index + 1) ?? []),
			),
		),
		...(options.extraParts ?? []),
	];
}

export function writePptxPackage(storyboard: MusicLessonStoryboard) {
	return writePptxPackageFromParts(buildPptxParts(storyboard));
}

type ZipEntry = {
	path: string;
	localHeaderOffset: number;
	compressedSize: number;
	uncompressedSize: number;
};

function readZipEntries(zip: Buffer): ZipEntry[] {
	const endSignature = 0x06054b50;
	let endOffset = -1;
	for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
		if (zip.readUInt32LE(offset) === endSignature) {
			endOffset = offset;
			break;
		}
	}
	if (endOffset === -1) throw new Error("Invalid ZIP: missing end of central directory");

	const entryCount = zip.readUInt16LE(endOffset + 10);
	const centralDirectoryOffset = zip.readUInt32LE(endOffset + 16);
	const entries: ZipEntry[] = [];
	let cursor = centralDirectoryOffset;

	for (let index = 0; index < entryCount; index += 1) {
		if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP: bad central directory entry");
		const compressedSize = zip.readUInt32LE(cursor + 20);
		const uncompressedSize = zip.readUInt32LE(cursor + 24);
		const nameLength = zip.readUInt16LE(cursor + 28);
		const extraLength = zip.readUInt16LE(cursor + 30);
		const commentLength = zip.readUInt16LE(cursor + 32);
		const localHeaderOffset = zip.readUInt32LE(cursor + 42);
		const path = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf-8");
		entries.push({ path, localHeaderOffset, compressedSize, uncompressedSize });
		cursor += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

export function listPptxPackageEntries(zip: Buffer) {
	return readZipEntries(zip).map((entry) => entry.path);
}

export function readPptxPackageText(zip: Buffer, path: string) {
	const entry = readZipEntries(zip).find((candidate) => candidate.path === path);
	if (!entry) throw new Error(`Missing ZIP entry: ${path}`);
	const nameLength = zip.readUInt16LE(entry.localHeaderOffset + 26);
	const extraLength = zip.readUInt16LE(entry.localHeaderOffset + 28);
	const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
	return zip.subarray(dataOffset, dataOffset + entry.uncompressedSize).toString("utf-8");
}
