/**
 * POST /api/chat/tool-response
 *
 * Human-in-the-Loop bridge for generative UI components.
 * When a user interacts with a GenUI component (e.g., selects an image),
 * this endpoint:
 * 1. Records the tool response metadata for UI state persistence
 * 2. Returns a formatted message that the frontend sends through the
 *    normal chat flow so the agent can continue its workflow
 *
 * This avoids modifying the OpenClaw gateway protocol — the agent
 * receives the user's decision as a natural follow-up message.
 */

import { getActiveRun } from "@/lib/active-runs";

export const runtime = "nodejs";

type ToolResponsePayload = {
	sessionId: string;
	toolCallId: string;
	toolName: string;
	result: Record<string, unknown>;
};

const TOOL_RESPONSE_MESSAGES: Record<string, (result: Record<string, unknown>) => string> = {
	image_generation_request: (r) => {
		const model = typeof r.selectedModelId === "string" ? r.selectedModelId : "the selected model";
		const shot = typeof r.shotNumber === "string" ? ` for shot ${r.shotNumber}` : "";
		const scene = typeof r.sceneNumber === "string" ? ` (scene ${r.sceneNumber})` : "";
		const quality = typeof r.quality === "string" ? ` at ${r.quality} quality` : "";
		return `Generate images${shot}${scene} using ${model}${quality}. Proceed with generation now.`;
	},
	video_generation_request: (r) => {
		const model = typeof r.selectedModelId === "string" ? r.selectedModelId : "the selected model";
		const shot = typeof r.shotNumber === "string" ? ` for shot ${r.shotNumber}` : "";
		const scene = typeof r.sceneNumber === "string" ? ` (scene ${r.sceneNumber})` : "";
		const ref = typeof r.referenceImage === "string" && r.referenceImage ? ` using reference image ${r.referenceImage}` : "";
		return `Generate video${shot}${scene} using ${model}${ref}. Proceed with generation now.`;
	},
	image_picker: (r) => {
		const idx = typeof r.selectedIndex === "number" ? r.selectedIndex + 1 : "?";
		const label = typeof r.selectedLabel === "string" ? r.selectedLabel : `Image ${idx}`;
		const path = typeof r.selectedPath === "string" ? r.selectedPath : "";
		return `I'll go with image ${idx}${label !== `Image ${idx}` ? ` (${label})` : ""}${path ? ` — ${path}` : ""}.`;
	},
	video_preview: (r) => {
		if (r.action === "regenerate") {
			return "Please regenerate the video.";
		}
		const idx = typeof r.approvedIndex === "number" ? r.approvedIndex + 1 : 1;
		return `Video ${idx} looks good — approved.`;
	},
	shot_list_editor: (r) => {
		const count = Array.isArray(r.rows) ? r.rows.length : 0;
		return `Shot list confirmed${count ? ` with ${count} shots` : ""}.`;
	},
	script_editor: (r) => {
		const path = typeof r.filePath === "string" ? r.filePath : "";
		return `Script confirmed${path ? ` — save to ${path}` : ""}.`;
	},
	storyboard_editor: (r) => {
		const count = Array.isArray(r.order) ? r.order.length : 0;
		return `Storyboard confirmed${count ? ` with ${count} panels` : ""}.`;
	},
	widget_renderer: (r) => {
		if (typeof r.prompt === "string") {
			return r.prompt;
		}
		return "Widget interaction confirmed.";
	},
};

export async function POST(req: Request) {
	const body: ToolResponsePayload = await req.json();
	const { sessionId, toolCallId, toolName, result } = body;

	if (!sessionId || !toolCallId || !toolName || !result) {
		return Response.json(
			{ error: "Missing required fields: sessionId, toolCallId, toolName, result" },
			{ status: 400 },
		);
	}

	// Record the response in the active run's accumulated message (if still in memory)
	const run = getActiveRun(sessionId);
	if (run) {
		for (const part of run.accumulated.parts) {
			if (part.type === "tool-invocation" && part.toolCallId === toolCallId && !part.result) {
				part.result = result;
				break;
			}
		}
	}

	// Build the user-facing message for the agent
	const messageFn = TOOL_RESPONSE_MESSAGES[toolName];
	const userMessage = messageFn ? messageFn(result) : `Confirmed selection for ${toolName}.`;

	return Response.json({
		ok: true,
		userMessage,
		toolCallId,
	});
}
