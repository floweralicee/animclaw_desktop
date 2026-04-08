/**
 * Generative UI Component Registry
 *
 * Maps OpenClaw tool names to interactive React components that render
 * inline in the chat thread. When the agent emits a tool call whose name
 * is registered here, ChatMessage renders the corresponding component
 * instead of a plain chain-of-thought tool card.
 *
 * Inspired by CopilotKit's `useComponent` pattern but built on top of
 * Animclaw's existing Vercel AI SDK + OpenClaw pipeline.
 */

import type { ComponentType } from "react";

// ── Shared prop shapes for GenUI components ──

export type GenUIImage = {
	url: string;
	label?: string;
	/** Workspace-relative path if already saved to disk */
	path?: string;
};

export type GenUIVideo = {
	url: string;
	label?: string;
	path?: string;
	duration?: number;
};

export type GenUIShotListRow = {
	shotNumber: string;
	sceneNumber?: string;
	shotType?: string;
	description?: string;
	notes?: string;
	characters?: string;
	generationPrompt?: string;
};

export type GenUIStoryboardPanel = {
	id: string;
	shotNumber: string;
	sceneNumber?: string;
	imageUrl?: string;
	description?: string;
	notes?: string;
};

/** Props passed to every GenUI component */
export type GenUIComponentProps<T = Record<string, unknown>> = {
	/** Tool call ID from the SSE stream — used to send responses back */
	toolCallId: string;
	/** Tool invocation state: pending while waiting for user, done after response */
	status: "pending" | "done" | "error";
	/** Typed args from the agent's tool call */
	args: T;
	/** The tool result, if already resolved (for persisted/replayed messages) */
	result?: Record<string, unknown>;
	/** Callback to send the user's choice back to the agent */
	respond: (result: Record<string, unknown>) => void;
};

// ── Per-tool arg types ──

export type ImagePickerArgs = {
	images: GenUIImage[];
	prompt?: string;
	shotNumber?: string;
	sceneNumber?: string;
	/** The model used to generate the images */
	model?: string;
};

export type VideoPreviewArgs = {
	videos: GenUIVideo[];
	prompt?: string;
	shotNumber?: string;
	sceneNumber?: string;
	model?: string;
	/** URL of the source image used for generation */
	sourceImage?: string;
};

export type ShotListTableArgs = {
	rows: GenUIShotListRow[];
	title?: string;
};

export type ScriptEditorArgs = {
	content: string;
	title?: string;
	filePath?: string;
};

export type StoryboardEditorArgs = {
	panels: GenUIStoryboardPanel[];
	title?: string;
};

export type MoodBoardArgs = {
	images: GenUIImage[];
	title?: string;
};

export type CharacterSheetArgs = {
	name: string;
	images: GenUIImage[];
	description?: string;
	traits?: string[];
};

export type TimelineStripArgs = {
	scenes: Array<{
		id: string;
		label: string;
		thumbnailUrl?: string;
		durationSec?: number;
	}>;
	title?: string;
};

export type SandboxedWidgetArgs = {
	html: string;
	title?: string;
	description?: string;
};

export type MediaGenerationRequestArgs = {
	mode: "image" | "video";
	prompt: string;
	shotNumber?: string;
	sceneNumber?: string;
	referenceImage?: string;
	models?: Array<{ id: string; label: string; costLabel: string }>;
};

// ── Registry entry type ──

export type GenUIRegistryEntry<T = Record<string, unknown>> = {
	/** Human-readable label shown in loading state */
	label: string;
	/** The React component to render */
	component: ComponentType<GenUIComponentProps<T>>;
	/** Validate and coerce raw tool args. Returns null if invalid. */
	parseArgs: (raw: Record<string, unknown> | undefined) => T | null;
};

// ── The registry ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, GenUIRegistryEntry<any>>();

/**
 * Register a generative UI component for a specific tool name.
 * Call this at module scope for each GenUI component.
 */
export function registerGenUIComponent<T>(
	toolName: string,
	entry: GenUIRegistryEntry<T>,
): void {
	registry.set(toolName, entry);
}

/** Check if a tool name has a registered GenUI component */
export function hasGenUIComponent(toolName: string): boolean {
	return registry.has(toolName);
}

/** Get the registry entry for a tool name */
export function getGenUIComponent(
	toolName: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): GenUIRegistryEntry<any> | undefined {
	return registry.get(toolName);
}

/** All registered GenUI tool names */
export function getRegisteredToolNames(): string[] {
	return [...registry.keys()];
}
