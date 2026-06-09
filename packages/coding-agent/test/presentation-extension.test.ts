import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSessionServices } from "../src/core/agent-session-services.ts";

describe("built-in presentation extension", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-presentation-extension-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("registers presentation slash commands and tools by default", async () => {
		const services = await createAgentSessionServices({ cwd, agentDir });

		const extensions = services.resourceLoader.getExtensions().extensions;
		const presentation = extensions.find((extension) => extension.path === "<builtin:presentation>");

		expect(presentation).toBeDefined();
		expect([...presentation!.commands.keys()].sort()).toEqual([
			"music-ppt",
			"ppt-guidance",
			"ppt-index",
			"ppt-init",
			"ppt-sources",
		]);
		expect([...presentation!.tools.keys()].sort()).toEqual([
			"presentation_audit_pptx",
			"presentation_export_svg_pptx",
			"presentation_generate_music_deck",
			"presentation_guidance_rebuild",
			"presentation_guidance_status",
			"presentation_index_rebuild",
			"presentation_index_status",
			"presentation_init",
			"presentation_plan_music_deck",
			"presentation_remember_requirement",
			"presentation_render_svg_project",
			"presentation_resolve_lesson",
			"presentation_sources_status",
		]);
	});

	it("does not register presentation commands when extensions are disabled", async () => {
		const services = await createAgentSessionServices({
			cwd,
			agentDir,
			resourceLoaderOptions: { noExtensions: true },
		});

		expect(
			services.resourceLoader
				.getExtensions()
				.extensions.some((extension) => extension.path === "<builtin:presentation>"),
		).toBe(false);
	});

	it("runs ppt-init through the built-in command handler", async () => {
		const services = await createAgentSessionServices({ cwd, agentDir });
		const presentation = services.resourceLoader
			.getExtensions()
			.extensions.find((extension) => extension.path === "<builtin:presentation>");
		const notifications: Array<{ message: string; type?: string }> = [];

		await presentation!.commands.get("ppt-init")!.handler("", {
			cwd,
			ui: {
				notify: (message: string, type?: string) => notifications.push({ message, type }),
			},
		} as never);

		expect(existsSync(join(cwd, ".pi", "presentation", "PPT.md"))).toBe(true);
		expect(notifications[0]).toMatchObject({ type: "info" });
	});
});
