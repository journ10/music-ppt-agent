import type { SlideSpec } from "../storyboard/slide-spec.ts";

export type SlideMediaRenderRef = {
	mediaId: string;
	kind: "audio" | "video";
	label: string;
	display: "icon" | "poster" | "player" | "hidden";
	mediaRelationshipId: string;
	visualRelationshipId: string;
};

function escapeXml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function textShape(id: number, name: string, text: string, x: number, y: number, cx: number, cy: number) {
	return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="2800"/><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody>
</p:sp>`;
}

function mediaShape(id: number, media: SlideMediaRenderRef, x: number, y: number) {
	return `<p:pic>
<p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(media.label)}"><a:hlinkClick r:id="${media.mediaRelationshipId}" action="ppaction://media"/></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${media.visualRelationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="1371600" cy="685800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
}

export function writeSlideXml(slide: SlideSpec, mediaRefs: SlideMediaRenderRef[] = []) {
	const bodyText = slide.studentVisibleText.join("\n");
	const mediaShapes = mediaRefs
		.filter((media) => media.display !== "hidden")
		.map((media, index) => mediaShape(10 + index, media, 914400 + index * 1524000, 4114800))
		.join("");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${textShape(2, "Title", slide.title, 685800, 457200, 7772400, 914400)}
${textShape(3, "Student Text", bodyText, 914400, 1600200, 7315200, 3657600)}
${mediaShapes}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}
