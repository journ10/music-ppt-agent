export type Relationship = {
	id: string;
	type: string;
	target: string;
};

export const OFFICE_RELATIONSHIP_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
export const PRESENTATION_RELATIONSHIP =
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
export const SLIDE_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
export const AUDIO_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio";
export const VIDEO_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video";
export const IMAGE_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
export const CORE_PROPERTIES_RELATIONSHIP =
	"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
export const APP_PROPERTIES_RELATIONSHIP =
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";

export function writeRelationships(relationships: Relationship[]) {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OFFICE_RELATIONSHIP_NS}">
${relationships
	.map(
		(relationship) =>
			`<Relationship Id="${relationship.id}" Type="${relationship.type}" Target="${relationship.target}"/>`,
	)
	.join("")}
</Relationships>`;
}
