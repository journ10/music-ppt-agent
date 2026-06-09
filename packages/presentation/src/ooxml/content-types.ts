const ContentTypeByExtension = new Map([
	["mp3", "audio/mpeg"],
	["mp4", "video/mp4"],
	["png", "image/png"],
]);

export function writeContentTypes(slideCount: number, extraExtensions: string[] = []) {
	const slideOverrides = Array.from(
		{ length: slideCount },
		(_, index) =>
			`<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
	).join("");
	const extraDefaults = [...new Set(extraExtensions)]
		.map((extension) => {
			const contentType = ContentTypeByExtension.get(extension);
			return contentType ? `<Default Extension="${extension}" ContentType="${contentType}"/>` : "";
		})
		.join("");

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${extraDefaults}
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${slideOverrides}
</Types>`;
}
