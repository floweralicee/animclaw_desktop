/**
 * Generative UI Component Registration
 *
 * Registers all GenUI components with the registry so they can be
 * rendered inline in chat when the agent emits matching tool calls.
 *
 * Import this module once (e.g. in chat-message.tsx) to activate all
 * registered GenUI components.
 */

import {
	registerGenUIComponent,
	type ImagePickerArgs,
	type VideoPreviewArgs,
	type ShotListTableArgs,
	type ScriptEditorArgs,
	type StoryboardEditorArgs,
	type SandboxedWidgetArgs,
	type MediaGenerationRequestArgs,
} from "@/lib/generative-ui-registry";

import { ImagePicker } from "./image-picker";
import { VideoPreview } from "./video-preview";
import { ShotListTable } from "./shot-list-table";
import { ScriptEditor } from "./script-editor";
import { StoryboardEditor } from "./storyboard-editor";
import { SandboxedWidget } from "./sandboxed-widget";
import { MediaGenerationRequest } from "./media-generation-request";

// ── Arg parsers — validate raw tool args before passing to components ──

function parseImageArray(raw: unknown): Array<{ url: string; label?: string; path?: string }> | null {
	if (!Array.isArray(raw)) return null;
	const out: Array<{ url: string; label?: string; path?: string }> = [];
	for (const item of raw) {
		if (typeof item === "string") {
			out.push({ url: item });
		} else if (item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string") {
			out.push(item as { url: string; label?: string; path?: string });
		}
	}
	return out.length > 0 ? out : null;
}

function parseVideoArray(raw: unknown): Array<{ url: string; label?: string; path?: string; duration?: number }> | null {
	if (!Array.isArray(raw)) return null;
	const out: Array<{ url: string; label?: string; path?: string; duration?: number }> = [];
	for (const item of raw) {
		if (typeof item === "string") {
			out.push({ url: item });
		} else if (item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string") {
			out.push(item as { url: string; label?: string; path?: string; duration?: number });
		}
	}
	return out.length > 0 ? out : null;
}

// ── Register all components ──

registerGenUIComponent<ImagePickerArgs>("image_picker", {
	label: "Image Picker",
	component: ImagePicker,
	parseArgs: (raw) => {
		if (!raw) return null;
		const images = parseImageArray(raw.images);
		if (!images) return null;
		return {
			images,
			prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
			shotNumber: typeof raw.shotNumber === "string" || typeof raw.shotNumber === "number"
				? String(raw.shotNumber) : undefined,
			sceneNumber: typeof raw.sceneNumber === "string" || typeof raw.sceneNumber === "number"
				? String(raw.sceneNumber) : undefined,
			model: typeof raw.model === "string" ? raw.model : undefined,
		};
	},
});

registerGenUIComponent<VideoPreviewArgs>("video_preview", {
	label: "Video Preview",
	component: VideoPreview,
	parseArgs: (raw) => {
		if (!raw) return null;
		const videos = parseVideoArray(raw.videos);
		if (!videos) return null;
		return {
			videos,
			prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
			shotNumber: typeof raw.shotNumber === "string" || typeof raw.shotNumber === "number"
				? String(raw.shotNumber) : undefined,
			sceneNumber: typeof raw.sceneNumber === "string" || typeof raw.sceneNumber === "number"
				? String(raw.sceneNumber) : undefined,
			model: typeof raw.model === "string" ? raw.model : undefined,
			sourceImage: typeof raw.sourceImage === "string" ? raw.sourceImage : undefined,
		};
	},
});

registerGenUIComponent<ShotListTableArgs>("shot_list_editor", {
	label: "Shot List Editor",
	component: ShotListTable,
	parseArgs: (raw) => {
		if (!raw) return null;
		if (!Array.isArray(raw.rows)) return null;
		return {
			rows: (raw.rows as Array<Record<string, unknown>>).map((r) => ({
				shotNumber: String(r.shotNumber ?? r.shot_number ?? ""),
				sceneNumber: r.sceneNumber != null || r.scene_number != null
					? String(r.sceneNumber ?? r.scene_number) : undefined,
				shotType: typeof r.shotType === "string" || typeof r.shot_type === "string"
					? String(r.shotType ?? r.shot_type) : undefined,
				description: typeof r.description === "string" ? r.description : undefined,
				notes: typeof r.notes === "string" ? r.notes : undefined,
				characters: typeof r.characters === "string" ? r.characters : undefined,
				generationPrompt: typeof r.generationPrompt === "string" || typeof r.generation_prompt === "string"
					? String(r.generationPrompt ?? r.generation_prompt) : undefined,
			})),
			title: typeof raw.title === "string" ? raw.title : undefined,
		};
	},
});

registerGenUIComponent<ScriptEditorArgs>("script_editor", {
	label: "Script Editor",
	component: ScriptEditor,
	parseArgs: (raw) => {
		if (!raw) return null;
		if (typeof raw.content !== "string") return null;
		return {
			content: raw.content,
			title: typeof raw.title === "string" ? raw.title : undefined,
			filePath: typeof raw.filePath === "string" || typeof raw.file_path === "string"
				? String(raw.filePath ?? raw.file_path) : undefined,
		};
	},
});

registerGenUIComponent<StoryboardEditorArgs>("storyboard_editor", {
	label: "Storyboard Editor",
	component: StoryboardEditor,
	parseArgs: (raw) => {
		if (!raw) return null;
		if (!Array.isArray(raw.panels)) return null;
		return {
			panels: (raw.panels as Array<Record<string, unknown>>).map((p, i) => ({
				id: typeof p.id === "string" ? p.id : `panel-${i}`,
				shotNumber: String(p.shotNumber ?? p.shot_number ?? i + 1),
				sceneNumber: p.sceneNumber != null || p.scene_number != null
					? String(p.sceneNumber ?? p.scene_number) : undefined,
				imageUrl: typeof p.imageUrl === "string" || typeof p.image_url === "string"
					? String(p.imageUrl ?? p.image_url) : undefined,
				description: typeof p.description === "string" ? p.description : undefined,
				notes: typeof p.notes === "string" ? p.notes : undefined,
			})),
			title: typeof raw.title === "string" ? raw.title : undefined,
		};
	},
});

registerGenUIComponent<SandboxedWidgetArgs>("widget_renderer", {
	label: "Interactive Widget",
	component: SandboxedWidget,
	parseArgs: (raw) => {
		if (!raw) return null;
		if (typeof raw.html !== "string") return null;
		return {
			html: raw.html,
			title: typeof raw.title === "string" ? raw.title : undefined,
			description: typeof raw.description === "string" ? raw.description : undefined,
		};
	},
});

registerGenUIComponent<MediaGenerationRequestArgs>("image_generation_request", {
	label: "Image Generation",
	component: MediaGenerationRequest,
	parseArgs: (raw) => {
		if (!raw) return null;
		if (raw.mode !== "image" && raw.mode !== "video") {
			// Implicitly treat this tool as image mode
			return {
				mode: "image",
				prompt: typeof raw.prompt === "string" ? raw.prompt : "",
				shotNumber: typeof raw.shotNumber === "string" || typeof raw.shotNumber === "number"
					? String(raw.shotNumber) : undefined,
				sceneNumber: typeof raw.sceneNumber === "string" || typeof raw.sceneNumber === "number"
					? String(raw.sceneNumber) : undefined,
				models: Array.isArray(raw.models) ? raw.models as Array<{ id: string; label: string; costLabel: string }> : undefined,
			};
		}
		return {
			mode: raw.mode as "image" | "video",
			prompt: typeof raw.prompt === "string" ? raw.prompt : "",
			shotNumber: typeof raw.shotNumber === "string" || typeof raw.shotNumber === "number"
				? String(raw.shotNumber) : undefined,
			sceneNumber: typeof raw.sceneNumber === "string" || typeof raw.sceneNumber === "number"
				? String(raw.sceneNumber) : undefined,
			referenceImage: typeof raw.referenceImage === "string" ? raw.referenceImage : undefined,
			models: Array.isArray(raw.models) ? raw.models as Array<{ id: string; label: string; costLabel: string }> : undefined,
		};
	},
});

registerGenUIComponent<MediaGenerationRequestArgs>("video_generation_request", {
	label: "Video Generation",
	component: MediaGenerationRequest,
	parseArgs: (raw) => {
		if (!raw) return null;
		return {
			mode: "video",
			prompt: typeof raw.prompt === "string" ? raw.prompt : "",
			shotNumber: typeof raw.shotNumber === "string" || typeof raw.shotNumber === "number"
				? String(raw.shotNumber) : undefined,
			sceneNumber: typeof raw.sceneNumber === "string" || typeof raw.sceneNumber === "number"
				? String(raw.sceneNumber) : undefined,
			referenceImage: typeof raw.referenceImage === "string" ? raw.referenceImage : undefined,
			models: Array.isArray(raw.models) ? raw.models as Array<{ id: string; label: string; costLabel: string }> : undefined,
		};
	},
});

export { ImagePicker } from "./image-picker";
export { VideoPreview } from "./video-preview";
export { ShotListTable } from "./shot-list-table";
export { ScriptEditor } from "./script-editor";
export { StoryboardEditor } from "./storyboard-editor";
export { SandboxedWidget } from "./sandboxed-widget";
export { MediaGenerationRequest } from "./media-generation-request";
