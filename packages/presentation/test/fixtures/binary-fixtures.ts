function utf16BeHex(value: string) {
	const bytes = Buffer.alloc(2 + value.length * 2);
	bytes[0] = 0xfe;
	bytes[1] = 0xff;
	for (let index = 0; index < value.length; index += 1) {
		bytes.writeUInt16BE(value.charCodeAt(index), 2 + index * 2);
	}
	return bytes.toString("hex").toUpperCase();
}

function pdfTextStream(pageText: string) {
	const lines = pageText.split(/\r?\n/);
	return [
		"BT",
		"/F1 12 Tf",
		"72 720 Td",
		...lines.flatMap((line, index) => [index === 0 ? "" : "0 -18 Td", `<${utf16BeHex(line)}> Tj`]).filter(Boolean),
		"ET",
	].join("\n");
}

export function minimalPdfFixture(pages: string[]) {
	const fontObjectId = 3 + pages.length * 2;
	const objects = new Map<number, string>();
	const pageRefs = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");

	objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
	objects.set(2, `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);

	for (const [index, pageText] of pages.entries()) {
		const pageObjectId = 3 + index * 2;
		const contentsObjectId = pageObjectId + 1;
		const stream = pdfTextStream(pageText);
		objects.set(
			pageObjectId,
			`<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentsObjectId} 0 R >>`,
		);
		objects.set(contentsObjectId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
	}

	objects.set(fontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

	let pdf = "%PDF-1.4\n";
	const offsets = new Map<number, number>();
	for (const objectId of [...objects.keys()].sort((a, b) => a - b)) {
		offsets.set(objectId, Buffer.byteLength(pdf, "latin1"));
		pdf += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
	}

	const xrefOffset = Buffer.byteLength(pdf, "latin1");
	pdf += `xref\n0 ${objects.size + 1}\n0000000000 65535 f \n`;
	for (const objectId of [...objects.keys()].sort((a, b) => a - b)) {
		pdf += `${String(offsets.get(objectId)).padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

	return Buffer.from(pdf, "latin1");
}

export function tinyMp3Fixture() {
	return Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function tinyMp4Fixture() {
	const box = Buffer.alloc(16);
	box.writeUInt32BE(16, 0);
	box.write("ftyp", 4, "ascii");
	box.write("isom", 8, "ascii");
	box.writeUInt32BE(0, 12);
	return box;
}

export function tinyPngFixture() {
	return Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
		"base64",
	);
}
