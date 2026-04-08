/**
 * MCP (Model Context Protocol) Adapter Layer
 *
 * Provides a lightweight abstraction for connecting external AI services
 * (Google Veo, fal.ai, Stability AI, etc.) as MCP-compatible tools that
 * the OpenClaw agent can invoke. This lets users access these services
 * directly from the Animclaw chat without leaving the app.
 *
 * Architecture:
 *   ChatPanel -> OpenClaw Agent -> Tool Call -> MCP Adapter -> External API
 *                                                          -> GenUI Component
 *
 * Each adapter wraps an external API and exposes it as:
 *   1. A tool definition (name, description, parameters) for the agent
 *   2. An execute function that calls the external API
 *   3. A GenUI tool name mapping for rendering results interactively
 *
 * The adapters don't run as a separate MCP server process — they integrate
 * into the existing OpenClaw tool pipeline. When a standalone MCP server
 * is needed (e.g., for Claude Desktop or Cursor integration), these
 * adapters can be wrapped in an MCP server using @modelcontextprotocol/sdk.
 */

// ── Types ──

export type MCPToolParameter = {
	name: string;
	type: "string" | "number" | "boolean" | "array" | "object";
	description: string;
	required?: boolean;
	default?: unknown;
};

export type MCPToolDefinition = {
	name: string;
	description: string;
	parameters: MCPToolParameter[];
	/** Which GenUI component to use for rendering results */
	genUITool?: string;
};

export type MCPToolResult = {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
	/** If set, the result should be rendered using this GenUI tool */
	genUIPayload?: {
		toolName: string;
		args: Record<string, unknown>;
	};
};

export type MCPAdapter = {
	/** Unique adapter identifier */
	id: string;
	/** Human-readable name */
	name: string;
	/** Description of what this adapter provides */
	description: string;
	/** List of tools this adapter exposes */
	tools: MCPToolDefinition[];
	/** Execute a tool call */
	execute: (toolName: string, args: Record<string, unknown>) => Promise<MCPToolResult>;
	/** Check if the adapter is configured (API keys present, etc.) */
	isConfigured: () => boolean;
};

// ── Adapter Registry ──

const adapters = new Map<string, MCPAdapter>();

export function registerMCPAdapter(adapter: MCPAdapter): void {
	adapters.set(adapter.id, adapter);
}

export function getMCPAdapter(id: string): MCPAdapter | undefined {
	return adapters.get(id);
}

export function getAllMCPAdapters(): MCPAdapter[] {
	return [...adapters.values()];
}

export function getConfiguredAdapters(): MCPAdapter[] {
	return [...adapters.values()].filter((a) => a.isConfigured());
}

export function getAllMCPTools(): MCPToolDefinition[] {
	return [...adapters.values()].flatMap((a) => a.tools);
}

// ── Built-in Adapter Templates ──

/**
 * Google Veo adapter template.
 * Wraps the Google Veo API for video generation from images/text.
 * Actual API calls go through OpenClaw's tool system; this adapter
 * provides the tool definitions and GenUI result mapping.
 */
export const veoAdapterTemplate: Omit<MCPAdapter, "execute" | "isConfigured"> = {
	id: "google-veo",
	name: "Google Veo",
	description: "AI video generation from images and text prompts",
	tools: [
		{
			name: "generate_video_veo",
			description: "Generate a video using Google Veo from a reference image and text prompt",
			parameters: [
				{ name: "prompt", type: "string", description: "Video generation prompt describing motion, style, and content", required: true },
				{ name: "referenceImage", type: "string", description: "Path or URL of the reference image to use as first frame", required: true },
				{ name: "duration", type: "number", description: "Video duration in seconds (default: 4)", default: 4 },
				{ name: "withAudio", type: "boolean", description: "Generate with audio (default: true)", default: true },
				{ name: "aspectRatio", type: "string", description: "Aspect ratio: 16:9, 9:16, 1:1 (default: 16:9)", default: "16:9" },
			],
			genUITool: "video_preview",
		},
	],
};

/**
 * fal.ai adapter template for image generation.
 */
export const falAdapterTemplate: Omit<MCPAdapter, "execute" | "isConfigured"> = {
	id: "fal-ai",
	name: "fal.ai",
	description: "Fast AI image generation via fal.ai (Flux, SDXL, etc.)",
	tools: [
		{
			name: "generate_images_fal",
			description: "Generate images using fal.ai models",
			parameters: [
				{ name: "prompt", type: "string", description: "Image generation prompt", required: true },
				{ name: "model", type: "string", description: "fal.ai model ID (e.g., fal-ai/flux/dev)", default: "fal-ai/flux/dev" },
				{ name: "count", type: "number", description: "Number of images to generate (default: 4)", default: 4 },
				{ name: "width", type: "number", description: "Image width (default: 1024)", default: 1024 },
				{ name: "height", type: "number", description: "Image height (default: 1024)", default: 1024 },
			],
			genUITool: "image_picker",
		},
	],
};

/**
 * Stability AI adapter template for image generation.
 */
export const stabilityAdapterTemplate: Omit<MCPAdapter, "execute" | "isConfigured"> = {
	id: "stability-ai",
	name: "Stability AI",
	description: "Image generation via Stability AI (Stable Diffusion 3, SDXL)",
	tools: [
		{
			name: "generate_images_stability",
			description: "Generate images using Stability AI models",
			parameters: [
				{ name: "prompt", type: "string", description: "Image generation prompt", required: true },
				{ name: "model", type: "string", description: "Model: sd3, sdxl (default: sd3)", default: "sd3" },
				{ name: "count", type: "number", description: "Number of images (default: 4)", default: 4 },
				{ name: "width", type: "number", description: "Width (default: 1024)", default: 1024 },
				{ name: "height", type: "number", description: "Height (default: 1024)", default: 1024 },
				{ name: "negativePrompt", type: "string", description: "Negative prompt for things to avoid" },
			],
			genUITool: "image_picker",
		},
	],
};

/**
 * Audio generation adapter template (e.g., ElevenLabs, Bark).
 */
export const audioAdapterTemplate: Omit<MCPAdapter, "execute" | "isConfigured"> = {
	id: "audio-gen",
	name: "Audio Generation",
	description: "AI audio generation for voiceover, sound effects, and music",
	tools: [
		{
			name: "generate_voiceover",
			description: "Generate voiceover audio from text",
			parameters: [
				{ name: "text", type: "string", description: "The text to convert to speech", required: true },
				{ name: "voice", type: "string", description: "Voice ID or name", default: "default" },
				{ name: "speed", type: "number", description: "Speech speed multiplier (default: 1.0)", default: 1.0 },
			],
		},
		{
			name: "generate_sound_effect",
			description: "Generate a sound effect from a text description",
			parameters: [
				{ name: "prompt", type: "string", description: "Description of the sound effect", required: true },
				{ name: "duration", type: "number", description: "Duration in seconds (default: 5)", default: 5 },
			],
		},
	],
};
