"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { extractHttpUrls, parseVideoEmbed } from "@/lib/embed-url";
import { LinkPreviewCard } from "./link-preview-card";

type Artifact = {
	id: string;
	kind: "image" | "html" | "svg" | "code" | "video-link" | "video-file" | "text" | "link";
	label: string;
	content: string;
	lang?: string;
	/** Stable key for manually-added items (not derived from message text). */
	manualId?: string;
};

/** YouTube / Vimeo links from user messages — inline playback on the whiteboard. */
function extractUserVideoLinks(messages: UIMessage[]): Artifact[] {
	const seen = new Set<string>();
	const out: Artifact[] = [];
	let n = 0;

	for (const message of messages) {
		if (message.role !== "user") {
			continue;
		}
		for (const part of message.parts) {
			if (part.type !== "text") {
				continue;
			}
			const text = (part as { type: "text"; text: string }).text;
			for (const u of extractHttpUrls(text)) {
				if (seen.has(u)) {
					continue;
				}
				const embed = parseVideoEmbed(u);
				if (!embed) {
					continue;
				}
				seen.add(u);
				out.push({
					id: `user-video-${n++}`,
					kind: "video-link",
					label: embed.provider === "youtube" ? "YouTube" : "Vimeo",
					content: u,
				});
			}
		}
	}

	return out;
}

/** Extract renderable artifacts from assistant messages. */
function extractArtifacts(messages: UIMessage[]): Artifact[] {
	const artifacts: Artifact[] = [];
	let artifactIndex = 0;

	for (const message of messages) {
		if (message.role !== "assistant") continue;

		for (const part of message.parts) {
			if (part.type !== "text") continue;

			const text = (part as { type: "text"; text: string }).text;

			// Fenced code blocks: ```lang\n...\n```
			const fenceRe = /```(\w*)\n([\s\S]*?)```/g;
			let fenceMatch: RegExpExecArray | null;
			const fencedRegions: Array<[number, number]> = [];

			while ((fenceMatch = fenceRe.exec(text)) !== null) {
				const lang = fenceMatch[1].toLowerCase();
				const code = fenceMatch[2].trim();
				fencedRegions.push([fenceMatch.index, fenceMatch.index + fenceMatch[0].length]);
				if (lang === "html" || lang === "htm") {
					artifacts.push({
						id: `artifact-${artifactIndex++}`,
						kind: "html",
						label: "HTML Preview",
						content: code,
					});
				} else if (lang === "svg") {
					artifacts.push({
						id: `artifact-${artifactIndex++}`,
						kind: "svg",
						label: "SVG Graphic",
						content: code,
					});
				} else if (code.length > 0) {
					artifacts.push({
						id: `artifact-${artifactIndex++}`,
						kind: "code",
						label: lang ? `${lang} snippet` : "Code snippet",
						content: code,
						lang: lang || undefined,
					});
				}
			}

			// Markdown images: ![alt](url)
			const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
			let imgMatch: RegExpExecArray | null;
			while ((imgMatch = imgRe.exec(text)) !== null) {
				const inFence = fencedRegions.some(
					([s, e]) => imgMatch!.index >= s && imgMatch!.index < e,
				);
				if (!inFence) {
					artifacts.push({
						id: `artifact-${artifactIndex++}`,
						kind: "image",
						label: imgMatch[1] || "Image",
						content: imgMatch[2],
					});
				}
			}
		}
	}

	return artifacts;
}

/**
 * Extract generated image/video assets from GenUI tool invocations in the
 * assistant's message history. These are the outputs of `image_picker` and
 * `video_preview` tool calls — shown on the whiteboard as a passive archive
 * so users can reference them without scrolling back through chat.
 *
 * De-duplicates by toolCallId + item index so re-renders don't create dupes.
 */
function extractGenUIAssets(messages: UIMessage[]): Artifact[] {
	const artifacts: Artifact[] = [];
	const seen = new Set<string>();

	for (const message of messages) {
		if (message.role !== "assistant") continue;

		for (const part of message.parts) {
			const tp = part as Record<string, unknown>;
			const toolName = (tp.toolName ?? tp.title ?? tp.tool_name) as string | undefined;
			if (!toolName) continue;

			const rawArgs = (tp.input ?? tp.args) as Record<string, unknown> | undefined;
			const rawResult = (tp.output ?? tp.result) as Record<string, unknown> | undefined;
			const toolCallId = (tp.toolCallId ?? tp.tool_call_id) as string | undefined;

			if (toolName === "image_picker" && rawArgs) {
				const images = Array.isArray(rawArgs.images) ? rawArgs.images as Array<{ url?: string; path?: string; label?: string }> : [];
				const model = typeof rawArgs.model === "string" ? rawArgs.model : undefined;
				const sceneNum = rawArgs.sceneNumber ?? rawArgs.scene_number;
				const shotNum = rawArgs.shotNumber ?? rawArgs.shot_number;
				const labelPrefix = [
					sceneNum ? `Sc.${sceneNum}` : "",
					shotNum ? `Sh.${shotNum}` : "",
				].filter(Boolean).join(" ");
				images.forEach((img, i) => {
					const src = img.path ?? img.url ?? "";
					if (!src) return;
					const key = `image_picker:${toolCallId ?? ""}:${i}`;
					if (seen.has(key)) return;
					seen.add(key);
					const label = [
						labelPrefix,
						img.label ?? `Image ${i + 1}`,
						model ? `(${model})` : "",
					].filter(Boolean).join(" ");
					artifacts.push({
						id: `genui-img-${toolCallId ?? ""}-${i}`,
						kind: "image",
						label: label || `Generated Image ${i + 1}`,
						content: resolveMediaSrc(src),
					});
				});
				// If there's a confirmed selection, mark it somehow via result
				void rawResult; // used in chat for HITL; whiteboard shows all options
			}

			if (toolName === "video_preview" && rawArgs) {
				const videos = Array.isArray(rawArgs.videos) ? rawArgs.videos as Array<{ url?: string; path?: string; label?: string }> : [];
				const model = typeof rawArgs.model === "string" ? rawArgs.model : undefined;
				const sceneNum = rawArgs.sceneNumber ?? rawArgs.scene_number;
				const shotNum = rawArgs.shotNumber ?? rawArgs.shot_number;
				const labelPrefix = [
					sceneNum ? `Sc.${sceneNum}` : "",
					shotNum ? `Sh.${shotNum}` : "",
				].filter(Boolean).join(" ");
				videos.forEach((vid, i) => {
					const src = vid.path ?? vid.url ?? "";
					if (!src) return;
					const key = `video_preview:${toolCallId ?? ""}:${i}`;
					if (seen.has(key)) return;
					seen.add(key);
					const label = [
						labelPrefix,
						vid.label ?? `Video ${i + 1}`,
						model ? `(${model})` : "",
					].filter(Boolean).join(" ");
					artifacts.push({
						id: `genui-vid-${toolCallId ?? ""}-${i}`,
						kind: "video-file",
						label: label || `Generated Video ${i + 1}`,
						content: resolveMediaSrc(src),
					});
				});
			}
		}
	}

	return artifacts;
}

// ─── Artifact card renderers ──────────────────────────────────────────────────

function HtmlCard({ artifact }: { artifact: Artifact }) {
	return (
		<div className="whiteboard-card">
			<div className="whiteboard-card-header">
				<span className="whiteboard-card-dot bg-red-400" />
				<span className="whiteboard-card-dot bg-yellow-400" />
				<span className="whiteboard-card-dot bg-green-400" />
				<span className="whiteboard-card-label">{artifact.label}</span>
			</div>
			<iframe
				srcDoc={artifact.content}
				sandbox="allow-scripts"
				className="whiteboard-iframe"
				title={artifact.label}
			/>
		</div>
	);
}

function SvgCard({ artifact }: { artifact: Artifact }) {
	return (
		<div className="whiteboard-card">
			<div className="whiteboard-card-header">
				<span className="whiteboard-card-label">{artifact.label}</span>
			</div>
			<div
				className="whiteboard-svg-body"
				// Safe: SVG rendered as innerHTML from assistant output
				// eslint-disable-next-line react/no-danger
				dangerouslySetInnerHTML={{ __html: artifact.content }}
			/>
		</div>
	);
}

function ImageCard({ artifact, onDoubleClick }: { artifact: Artifact; onDoubleClick?: () => void }) {
	const lastTapRef = useRef(0);

	const handleTouchEnd = useCallback((e: React.TouchEvent) => {
		const now = Date.now();
		if (now - lastTapRef.current < 300) {
			e.preventDefault();
			onDoubleClick?.();
		}
		lastTapRef.current = now;
	}, [onDoubleClick]);

	return (
		<div
			className="whiteboard-card"
			onDoubleClick={onDoubleClick}
			onTouchEnd={onDoubleClick ? handleTouchEnd : undefined}
			style={{ cursor: onDoubleClick ? "pointer" : undefined }}
		>
			<div className="whiteboard-card-header">
				<span className="whiteboard-card-label">{artifact.label}</span>
				{onDoubleClick && (
					<span className="whiteboard-img-hint">Double-tap to add to chat</span>
				)}
			</div>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={artifact.content}
				alt={artifact.label}
				className="whiteboard-img"
			/>
		</div>
	);
}

function CodeCard({ artifact }: { artifact: Artifact }) {
	return (
		<div className="whiteboard-card">
			<div className="whiteboard-card-header">
				<span className="whiteboard-card-label">{artifact.label}</span>
			</div>
			<pre className="whiteboard-code">{artifact.content}</pre>
		</div>
	);
}

function TextCard({ artifact }: { artifact: Artifact }) {
	return (
		<div className="whiteboard-card">
			<div className="whiteboard-card-header">
				<span className="whiteboard-card-label">{artifact.label}</span>
			</div>
			<p className="whiteboard-text-body">{artifact.content}</p>
		</div>
	);
}

function GenericLinkCard({ artifact }: { artifact: Artifact }) {
	let hostname = artifact.content;
	try {
		hostname = new URL(artifact.content).hostname.replace(/^www\./, "");
	} catch {
		/* keep raw */
	}
	return (
		<div className="whiteboard-card">
			<div className="whiteboard-card-header">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="opacity-60 shrink-0">
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
				</svg>
				<span className="whiteboard-card-label">{hostname}</span>
			</div>
			<div className="whiteboard-link-body">
				<a
					href={artifact.content}
					target="_blank"
					rel="noopener noreferrer"
					className="whiteboard-link-anchor"
				>
					{artifact.content}
				</a>
			</div>
		</div>
	);
}

function VideoLinkCard({ artifact }: { artifact: Artifact }) {
	const embed = parseVideoEmbed(artifact.content);
	if (!embed) {
		return null;
	}
	return (
		<LinkPreviewCard
			url={artifact.content}
			embed={embed}
			variant="whiteboard"
			className="min-h-0"
		/>
	);
}

function resolveMediaSrc(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:")) {
		return url;
	}
	return `/api/workspace/raw-file?path=${encodeURIComponent(url)}`;
}

function VideoFileCard({ artifact }: { artifact: Artifact }) {
	return (
		<div className="whiteboard-card">
			<div className="whiteboard-card-header">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 shrink-0">
					<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
					<rect x="2" y="6" width="14" height="12" rx="2" />
				</svg>
				<span className="whiteboard-card-label">{artifact.label}</span>
			</div>
			<video
				src={resolveMediaSrc(artifact.content)}
				controls
				className="w-full"
				style={{ aspectRatio: "16/9", objectFit: "contain", background: "#000", display: "block" }}
				preload="metadata"
			/>
		</div>
	);
}

function ArtifactCard({ artifact, onImageDoubleClick }: { artifact: Artifact; onImageDoubleClick?: () => void }) {
	switch (artifact.kind) {
		case "html": return <HtmlCard artifact={artifact} />;
		case "svg": return <SvgCard artifact={artifact} />;
		case "image": return <ImageCard artifact={artifact} onDoubleClick={onImageDoubleClick} />;
		case "code": return <CodeCard artifact={artifact} />;
		case "text": return <TextCard artifact={artifact} />;
		case "link": return <GenericLinkCard artifact={artifact} />;
		case "video-link": return <VideoLinkCard artifact={artifact} />;
		case "video-file": return <VideoFileCard artifact={artifact} />;
	}
}

const ITEM_WIDTH = 320;
const ITEM_GAP = 16;
const ROW_STRIDE = 300;

/** Trackpad pinch (and Ctrl+wheel) zoom range for the canvas. */
const WHITEBOARD_ZOOM_MIN = 0.25;
const WHITEBOARD_ZOOM_MAX = 2.5;

function defaultPositionForIndex(index: number): { x: number; y: number } {
	const col = index % 3;
	const row = Math.floor(index / 3);
	return {
		x: 24 + col * (ITEM_WIDTH + ITEM_GAP),
		y: 24 + row * ROW_STRIDE,
	};
}

type ItemPositions = Record<string, { x: number; y: number }>;

/** Stable identity for drag position + dismiss (message-derived `artifact.id` can change). */
function simpleHash(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) + h) ^ s.charCodeAt(i);
	}
	return (h >>> 0).toString(36);
}

function whiteboardItemKey(a: Artifact): string {
	if (a.manualId) return `manual:${a.manualId}`;
	if (a.kind === "video-link") return `v:${a.content}`;
	if (a.kind === "video-file") return `vf:${a.id}`;
	return `${a.kind}|${a.label}|${a.content.length}|${simpleHash(a.content)}`;
}

function WhiteboardDraggableItem({
	artifact,
	itemKey,
	position,
	layoutZoom,
	onPositionChange,
	onDismiss,
	zLift,
	onDragStart,
	onDragEnd,
	onImageDoubleClick,
}: {
	artifact: Artifact;
	itemKey: string;
	position: { x: number; y: number };
	/** CSS scale on the canvas; pointer deltas must be divided by this for correct drag. */
	layoutZoom: number;
	onPositionChange: (key: string, pos: { x: number; y: number }) => void;
	onDismiss: (key: string) => void;
	zLift: boolean;
	onDragStart: (key: string) => void;
	onDragEnd: () => void;
	onImageDoubleClick?: (content: string, label: string) => void;
}) {
	const dragRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		origX: number;
		origY: number;
	} | null>(null);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (e.button !== 0) {
				return;
			}
			e.preventDefault();
			e.currentTarget.setPointerCapture(e.pointerId);
			onDragStart(itemKey);
			dragRef.current = {
				pointerId: e.pointerId,
				startX: e.clientX,
				startY: e.clientY,
				origX: position.x,
				origY: position.y,
			};
		},
		[itemKey, onDragStart, position.x, position.y],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			const d = dragRef.current;
			if (!d || e.pointerId !== d.pointerId) {
				return;
			}
			const z = layoutZoom > 0 ? layoutZoom : 1;
			const nx = d.origX + (e.clientX - d.startX) / z;
			const ny = d.origY + (e.clientY - d.startY) / z;
			onPositionChange(itemKey, { x: Math.max(0, nx), y: Math.max(0, ny) });
		},
		[itemKey, layoutZoom, onPositionChange],
	);

	const endDrag = useCallback(
		(e: React.PointerEvent) => {
			const d = dragRef.current;
			if (!d || e.pointerId !== d.pointerId) {
				return;
			}
			dragRef.current = null;
			onDragEnd();
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* already released */
			}
		},
		[onDragEnd],
	);

	return (
		<div
			className="whiteboard-board-item"
			style={{
				position: "absolute",
				left: position.x,
				top: position.y,
				width: ITEM_WIDTH,
				zIndex: zLift ? 20 : 1,
				touchAction: "none",
			}}
		>
			<div className="whiteboard-item-toolbar">
				<div
					className="whiteboard-drag-handle"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
					role="button"
					tabIndex={0}
					aria-label={`Move ${artifact.label}`}
					onKeyDown={(e) => {
						const step = e.shiftKey ? 24 : 8;
						if (e.key === "ArrowLeft") {
							e.preventDefault();
							onPositionChange(itemKey, { x: Math.max(0, position.x - step), y: position.y });
						} else if (e.key === "ArrowRight") {
							e.preventDefault();
							onPositionChange(itemKey, { x: position.x + step, y: position.y });
						} else if (e.key === "ArrowUp") {
							e.preventDefault();
							onPositionChange(itemKey, { x: position.x, y: Math.max(0, position.y - step) });
						} else if (e.key === "ArrowDown") {
							e.preventDefault();
							onPositionChange(itemKey, { x: position.x, y: position.y + step });
						}
					}}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="opacity-50">
						<circle cx="9" cy="5" r="1.5" />
						<circle cx="15" cy="5" r="1.5" />
						<circle cx="9" cy="12" r="1.5" />
						<circle cx="15" cy="12" r="1.5" />
						<circle cx="9" cy="19" r="1.5" />
						<circle cx="15" cy="19" r="1.5" />
					</svg>
					<span className="whiteboard-drag-handle-label">{artifact.label}</span>
				</div>
				<button
					type="button"
					className="whiteboard-item-delete"
					aria-label={`Remove ${artifact.label} from whiteboard`}
					title="Remove from whiteboard"
					onClick={(e) => {
						e.stopPropagation();
						onDismiss(itemKey);
					}}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden>
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>
			</div>
			<div className="whiteboard-item-body">
				<ArtifactCard
					artifact={artifact}
					onImageDoubleClick={
						artifact.kind === "image" && onImageDoubleClick
							? () => onImageDoubleClick(artifact.content, artifact.label)
							: undefined
					}
				/>
			</div>
		</div>
	);
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
	return (
		<div className="whiteboard-empty">
			<div className="whiteboard-empty-icon">
				<svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
					<rect x="8" y="12" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
					<rect x="16" y="20" width="14" height="10" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
					<rect x="34" y="20" width="14" height="10" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
					<rect x="16" y="34" width="32" height="6" rx="2" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" />
					<circle cx="32" cy="54" r="3" fill="currentColor" fillOpacity="0.4" />
					<line x1="32" y1="48" x2="32" y2="51" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				</svg>
			</div>
			<p className="whiteboard-empty-title">Your whiteboard is empty</p>
			<p className="whiteboard-empty-sub">
				Paste an image, share a link, or use the toolbar below to add content.
			</p>
		</div>
	);
}

// ─── Toolbar icons ────────────────────────────────────────────────────────────

function NoteIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
			<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
		</svg>
	);
}

function ImageIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<polyline points="21 15 16 10 5 21" />
		</svg>
	);
}

function LinkIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
		</svg>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

type WhiteboardProps = {
	messages: UIMessage[];
	/** Images from chat attachments to show on the whiteboard. */
	externalImages?: Array<{ id: string; url: string; label: string }>;
	/** Called when the user double-taps/double-clicks an image card. */
	onImageDoubleClick?: (content: string, label: string) => void;
	/** Workspace identifier used to key per-workspace localStorage. */
	workspaceId?: string | null;
};

type WhiteboardStorage = {
	manualItems: Artifact[];
	positions: ItemPositions;
	hiddenKeys: string[];
};

function whiteboardStorageKey(workspaceId: string | null | undefined): string {
	return `animclaw:whiteboard:${workspaceId || "default"}`;
}

function loadWhiteboardStorage(workspaceId: string | null | undefined): WhiteboardStorage | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(whiteboardStorageKey(workspaceId));
		if (!raw) return null;
		return JSON.parse(raw) as WhiteboardStorage;
	} catch {
		return null;
	}
}

let manualCounter = 0;
function nextManualId() {
	return `m${++manualCounter}`;
}

export function Whiteboard({ messages, externalImages, onImageDoubleClick, workspaceId }: WhiteboardProps) {
	const [manualItems, setManualItems] = useState<Artifact[]>(() => {
		const saved = loadWhiteboardStorage(workspaceId);
		if (saved?.manualItems?.length) {
			// Advance the counter past any restored IDs so new items don't collide.
			for (const item of saved.manualItems) {
				if (item.manualId) {
					const n = parseInt(item.manualId.replace(/^m/, ""), 10);
					if (!isNaN(n) && n > manualCounter) {
						manualCounter = n;
					}
				}
			}
			return saved.manualItems;
		}
		return [];
	});

	const addManualItem = useCallback((item: Omit<Artifact, "id" | "manualId">) => {
		const manualId = nextManualId();
		setManualItems((prev) => [
			...prev,
			{ ...item, id: `manual-${manualId}`, manualId },
		]);
	}, []);

	// Sync external images (from chat attachments) into manual items.
	// Uses a ref to track already-processed IDs so items are added only once.
	const processedExternalIdsRef = useRef(new Set<string>());
	useEffect(() => {
		for (const img of (externalImages ?? [])) {
			if (!processedExternalIdsRef.current.has(img.id)) {
				processedExternalIdsRef.current.add(img.id);
				addManualItem({ kind: "image", label: img.label, content: img.url });
			}
		}
	}, [externalImages, addManualItem]);

	const derivedArtifacts = useMemo(() => {
		const userVideos = extractUserVideoLinks(messages);
		const fromAssistant = extractArtifacts(messages);
		const fromGenUI = extractGenUIAssets(messages);
		return [...userVideos, ...fromAssistant, ...fromGenUI];
	}, [messages]);

	const artifacts = useMemo(
		() => [...derivedArtifacts, ...manualItems],
		[derivedArtifacts, manualItems],
	);

	const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => {
		const saved = loadWhiteboardStorage(workspaceId);
		return saved?.hiddenKeys ? new Set(saved.hiddenKeys) : new Set();
	});
	const [positions, setPositions] = useState<ItemPositions>(() => {
		const saved = loadWhiteboardStorage(workspaceId);
		return saved?.positions ?? {};
	});
	const [draggingKey, setDraggingKey] = useState<string | null>(null);

	// Persist manual items, positions, and hidden keys to localStorage on every change.
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const payload: WhiteboardStorage = {
				manualItems,
				positions,
				hiddenKeys: Array.from(hiddenKeys),
			};
			localStorage.setItem(whiteboardStorageKey(workspaceId), JSON.stringify(payload));
		} catch {
			// Silently ignore quota errors (e.g. large base64 images).
		}
	}, [manualItems, positions, hiddenKeys, workspaceId]);

	// Toolbar popover state: null = closed, string = current input value
	const [noteInput, setNoteInput] = useState<string | null>(null);
	const [linkInput, setLinkInput] = useState<string | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
	const linkInputRef = useRef<HTMLInputElement>(null);

	// Auto-focus popovers when they open
	useEffect(() => {
		if (noteInput !== null) {
			noteTextareaRef.current?.focus();
		}
	}, [noteInput]);
	useEffect(() => {
		if (linkInput !== null) {
			linkInputRef.current?.focus();
		}
	}, [linkInput]);

	// Paste image from clipboard
	useEffect(() => {
		const handlePaste = (e: ClipboardEvent) => {
			const active = document.activeElement;
			if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
				return;
			}
			const items = Array.from(e.clipboardData?.items ?? []);
			for (const item of items) {
				if (item.type.startsWith("image/")) {
					const file = item.getAsFile();
					if (!file) continue;
					const reader = new FileReader();
					reader.onload = () => {
						addManualItem({
							kind: "image",
							label: "Pasted image",
							content: reader.result as string,
						});
					};
					reader.readAsDataURL(file);
					e.preventDefault();
					break;
				}
			}
		};
		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [addManualItem]);

	const visibleArtifacts = useMemo(
		() => artifacts.filter((a) => !hiddenKeys.has(whiteboardItemKey(a))),
		[artifacts, hiddenKeys],
	);

	// Clean up hiddenKeys for message-derived items that no longer exist
	useEffect(() => {
		const present = new Set(derivedArtifacts.map(whiteboardItemKey));
		setHiddenKeys((prev) => {
			const next = new Set<string>();
			for (const k of prev) {
				if (present.has(k)) {
					next.add(k);
				}
			}
			if (next.size === prev.size) {
				let unchanged = true;
				for (const k of prev) {
					if (!next.has(k)) {
						unchanged = false;
						break;
					}
				}
				if (unchanged) return prev;
			}
			return next;
		});
	}, [derivedArtifacts]);

	useEffect(() => {
		setPositions((prev) => {
			const next = { ...prev };
			let changed = false;
			const keySet = new Set(visibleArtifacts.map(whiteboardItemKey));

			for (const k of Object.keys(next)) {
				if (!keySet.has(k)) {
					delete next[k];
					changed = true;
				}
			}

			visibleArtifacts.forEach((a, index) => {
				const key = whiteboardItemKey(a);
				if (next[key] == null) {
					next[key] = defaultPositionForIndex(index);
					changed = true;
				}
			});

			return changed ? next : prev;
		});
	}, [visibleArtifacts]);

	const onPositionChange = useCallback((key: string, pos: { x: number; y: number }) => {
		setPositions((p) => ({ ...p, [key]: pos }));
	}, []);

	const onDismiss = useCallback((key: string) => {
		if (key.startsWith("manual:")) {
			const manualId = key.slice(7);
			setManualItems((prev) => prev.filter((a) => a.manualId !== manualId));
		} else {
			setHiddenKeys((prev) => new Set([...prev, key]));
		}
		setPositions((p) => {
			const next = { ...p };
			delete next[key];
			return next;
		});
		setDraggingKey((d) => (d === key ? null : d));
	}, []);

	const canvasSize = useMemo(() => {
		const pad = 48;
		const estItemH = 360;
		let w = ITEM_WIDTH + pad * 2;
		let h = estItemH + pad * 2;
		for (const a of visibleArtifacts) {
			const key = whiteboardItemKey(a);
			const p = positions[key];
			if (p) {
				w = Math.max(w, p.x + ITEM_WIDTH + pad);
				h = Math.max(h, p.y + estItemH + pad);
			}
		}
		return { width: w, height: h };
	}, [visibleArtifacts, positions]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const zoomRef = useRef(1);
	const pendingScrollRef = useRef<{ scrollLeft: number; scrollTop: number } | null>(null);
	const [zoom, setZoom] = useState(1);

	useEffect(() => {
		zoomRef.current = zoom;
	}, [zoom]);

	useEffect(() => {
		setZoom(1);
		zoomRef.current = 1;
	}, [workspaceId]);

	useLayoutEffect(() => {
		const el = scrollRef.current;
		const p = pendingScrollRef.current;
		if (!el || !p) {
			return;
		}
		el.scrollLeft = p.scrollLeft;
		el.scrollTop = p.scrollTop;
		pendingScrollRef.current = null;
	}, [zoom]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el || visibleArtifacts.length === 0) {
			return;
		}

		const onWheel = (e: WheelEvent) => {
			// Pinch-to-zoom on trackpad (Chrome/Edge/Safari); Ctrl+mouse wheel also.
			if (!e.ctrlKey) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();

			const rect = el.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			const oldZoom = zoomRef.current;

			const worldX = (el.scrollLeft + mouseX) / oldZoom;
			const worldY = (el.scrollTop + mouseY) / oldZoom;

			const factor = Math.exp(-e.deltaY * 0.01);
			let newZoom = oldZoom * factor;
			newZoom = Math.min(WHITEBOARD_ZOOM_MAX, Math.max(WHITEBOARD_ZOOM_MIN, newZoom));

			if (Math.abs(newZoom - oldZoom) < 1e-6) {
				return;
			}

			pendingScrollRef.current = {
				scrollLeft: worldX * newZoom - mouseX,
				scrollTop: worldY * newZoom - mouseY,
			};
			zoomRef.current = newZoom;
			setZoom(newZoom);
		};

		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [visibleArtifacts.length]);

	const scrollPanRef = useRef<{
		pointerId: number;
		startScrollLeft: number;
		startScrollTop: number;
		startX: number;
		startY: number;
	} | null>(null);
	const [isPanningScroll, setIsPanningScroll] = useState(false);

	const onScrollPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) {
			return;
		}
		if (e.button !== 0 && e.button !== 1) {
			return;
		}
		if (e.button === 1) {
			e.preventDefault();
		}
		const target = e.target as HTMLElement;
		if (e.button === 0) {
			if (target.closest(".whiteboard-board-item")) {
				return;
			}
			if (target.closest("a, button, input, textarea, select, label")) {
				return;
			}
		}
		e.currentTarget.setPointerCapture(e.pointerId);
		scrollPanRef.current = {
			pointerId: e.pointerId,
			startScrollLeft: scrollEl.scrollLeft,
			startScrollTop: scrollEl.scrollTop,
			startX: e.clientX,
			startY: e.clientY,
		};
		setIsPanningScroll(true);
	}, []);

	const onScrollPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const p = scrollPanRef.current;
		if (!p || e.pointerId !== p.pointerId) {
			return;
		}
		const scrollEl = scrollRef.current;
		if (!scrollEl) {
			return;
		}
		scrollEl.scrollLeft = p.startScrollLeft - (e.clientX - p.startX);
		scrollEl.scrollTop = p.startScrollTop - (e.clientY - p.startY);
	}, []);

	const endScrollPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const p = scrollPanRef.current;
		if (!p || e.pointerId !== p.pointerId) {
			return;
		}
		scrollPanRef.current = null;
		setIsPanningScroll(false);
		try {
			e.currentTarget.releasePointerCapture(e.pointerId);
		} catch {
			/* already released */
		}
	}, []);

	// ── Toolbar handlers ────────────────────────────────────────────────────────

	const handleAddNote = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const text = (noteInput ?? "").trim();
			if (text) {
				addManualItem({ kind: "text", label: "Note", content: text });
			}
			setNoteInput(null);
		},
		[noteInput, addManualItem],
	);

	const handleAddLink = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const url = (linkInput ?? "").trim();
			if (!url) {
				setLinkInput(null);
				return;
			}
			const embed = parseVideoEmbed(url);
			if (embed) {
				addManualItem({
					kind: "video-link",
					label: embed.provider === "youtube" ? "YouTube" : "Vimeo",
					content: url,
				});
			} else {
				addManualItem({ kind: "link", label: "Link", content: url });
			}
			setLinkInput(null);
		},
		[linkInput, addManualItem],
	);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				addManualItem({
					kind: "image",
					label: file.name,
					content: reader.result as string,
				});
			};
			reader.readAsDataURL(file);
			e.target.value = "";
		},
		[addManualItem],
	);

	const openNote = () => {
		setLinkInput(null);
		setNoteInput("");
	};
	const openLink = () => {
		setNoteInput(null);
		setLinkInput("");
	};
	const openImage = () => {
		setNoteInput(null);
		setLinkInput(null);
		fileInputRef.current?.click();
	};

	return (
		<>
			<style>{`
				.whiteboard-root {
					--wb-canvas: color-mix(in srgb, var(--color-main-bg, #0f1117) 88%, white 12%);
					position: relative;
					flex: 1;
					display: flex;
					flex-direction: column;
					overflow: hidden;
					background-color: var(--wb-canvas);
					background-image: radial-gradient(
						circle,
						color-mix(in srgb, currentColor 15%, transparent) 1px,
						transparent 1px
					);
					background-size: 24px 24px;
					color: var(--color-text-muted, #555);
				}

				.whiteboard-header {
					display: flex;
					align-items: center;
					gap: 6px;
					padding: 10px 16px;
					border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.06));
					font-size: 12px;
					font-weight: 500;
					color: var(--color-text-muted, #6b7280);
					letter-spacing: 0.04em;
					text-transform: uppercase;
					flex-shrink: 0;
					background: var(--wb-canvas);
				}

				.whiteboard-header-dot {
					width: 6px;
					height: 6px;
					border-radius: 50%;
					background: var(--color-text-muted, #4b5563);
				}

				.whiteboard-scroll {
					flex: 1;
					overflow: auto;
					position: relative;
					min-height: 0;
				}

				.whiteboard-scroll.whiteboard-scroll--panning {
					cursor: grabbing;
					user-select: none;
				}

				.whiteboard-board-item {
					cursor: default;
				}

				.whiteboard-zoom-sleeve {
					position: relative;
					flex-shrink: 0;
					cursor: grab;
				}

				.whiteboard-canvas {
					position: relative;
					min-width: 100%;
					min-height: 100%;
					box-sizing: border-box;
					cursor: grab;
				}

				.whiteboard-item-toolbar {
					display: flex;
					align-items: stretch;
					gap: 6px;
					margin-bottom: 8px;
				}

				.whiteboard-drag-handle {
					display: flex;
					align-items: center;
					gap: 8px;
					flex: 1;
					min-width: 0;
					padding: 8px 10px;
					border-radius: 8px;
					cursor: grab;
					border: 1px solid var(--color-border, rgba(255,255,255,0.08));
					background: var(--color-sidebar-bg, rgba(255,255,255,0.04));
					color: var(--color-text-muted, #6b7280);
					font-size: 11px;
					font-weight: 500;
					touch-action: none;
					user-select: none;
				}

				.whiteboard-item-delete {
					flex-shrink: 0;
					display: flex;
					align-items: center;
					justify-content: center;
					width: 36px;
					border-radius: 8px;
					border: 1px solid color-mix(in srgb, #ef4444 35%, var(--color-border, rgba(255,255,255,0.08)));
					background: color-mix(in srgb, #ef4444 12%, transparent);
					color: #ef4444;
					cursor: pointer;
					transition: background 0.12s, border-color 0.12s, color 0.12s;
				}

				.whiteboard-item-delete:hover {
					background: color-mix(in srgb, #ef4444 22%, transparent);
					border-color: color-mix(in srgb, #ef4444 55%, var(--color-border, rgba(255,255,255,0.08)));
					color: #dc2626;
				}

				.whiteboard-item-delete:active {
					transform: scale(0.96);
				}

				.whiteboard-drag-handle:active {
					cursor: grabbing;
				}

				.whiteboard-drag-handle:focus-visible {
					outline: 2px solid var(--color-accent, #6366f1);
					outline-offset: 2px;
				}

				.whiteboard-drag-handle-label {
					flex: 1;
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					text-align: left;
				}

				.whiteboard-item-body {
					min-width: 0;
				}

				.whiteboard-empty {
					flex: 1;
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					gap: 12px;
					padding: 40px;
					text-align: center;
				}

				.whiteboard-empty-icon {
					opacity: 0.3;
					margin-bottom: 8px;
				}

				.whiteboard-empty-title {
					font-size: 15px;
					font-weight: 500;
					color: var(--color-text-muted, #6b7280);
					margin: 0;
				}

				.whiteboard-empty-sub {
					font-size: 13px;
					color: var(--color-text-muted, #4b5563);
					opacity: 0.7;
					max-width: 280px;
					margin: 0;
					line-height: 1.5;
				}

				.whiteboard-card {
					display: flex;
					flex-direction: column;
					border-radius: 10px;
					border: 1px solid var(--color-border, rgba(255,255,255,0.08));
					background: var(--color-sidebar-bg, rgba(255,255,255,0.03));
					overflow: hidden;
					transition: border-color 0.15s;
				}

				.whiteboard-card:hover {
					border-color: var(--color-border-hover, rgba(255,255,255,0.15));
				}

				.whiteboard-card-header {
					display: flex;
					align-items: center;
					gap: 6px;
					padding: 8px 12px;
					border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.06));
					background: var(--color-sidebar-bg, rgba(255,255,255,0.02));
					flex-shrink: 0;
				}

				.whiteboard-card-dot {
					width: 10px;
					height: 10px;
					border-radius: 50%;
					display: inline-block;
					flex-shrink: 0;
				}

				.whiteboard-card-label {
					font-size: 11px;
					font-weight: 500;
					color: var(--color-text-muted, #6b7280);
					letter-spacing: 0.03em;
					margin-left: auto;
				}

				.whiteboard-iframe {
					width: 100%;
					height: 280px;
					border: none;
					background: #fff;
				}

				.whiteboard-svg-body {
					padding: 16px;
					display: flex;
					align-items: center;
					justify-content: center;
					min-height: 160px;
				}

				.whiteboard-svg-body svg {
					max-width: 100%;
					max-height: 240px;
				}

				.whiteboard-img {
					width: 100%;
					height: auto;
					max-height: 320px;
					object-fit: contain;
					display: block;
					background: #fff;
				}

				.whiteboard-img-hint {
					font-size: 10px;
					color: var(--color-text-muted, #6b7280);
					opacity: 0;
					transition: opacity 0.15s;
					white-space: nowrap;
					pointer-events: none;
				}

				.whiteboard-card:hover .whiteboard-img-hint {
					opacity: 0.75;
				}

				.whiteboard-code {
					padding: 14px 16px;
					margin: 0;
					font-size: 11.5px;
					font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
					line-height: 1.6;
					color: var(--color-text, #e2e8f0);
					overflow-x: auto;
					white-space: pre;
					max-height: 260px;
					overflow-y: auto;
				}

				.whiteboard-text-body {
					margin: 0;
					padding: 14px 16px;
					font-size: 13px;
					line-height: 1.6;
					color: var(--color-text-muted, #9ca3af);
					white-space: pre-wrap;
					word-break: break-word;
				}

				.whiteboard-link-body {
					padding: 12px 14px;
				}

				.whiteboard-link-anchor {
					font-size: 12px;
					color: var(--color-accent, #818cf8);
					word-break: break-all;
					text-decoration: none;
					opacity: 0.85;
				}

				.whiteboard-link-anchor:hover {
					opacity: 1;
					text-decoration: underline;
				}

				/* ── Bottom toolbar ─────────────────────────────────── */

				.whiteboard-toolbar-area {
					flex-shrink: 0;
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 8px;
					padding: 10px 16px 14px;
					position: relative;
					z-index: 30;
				}

				.whiteboard-toolbar {
					display: flex;
					align-items: center;
					gap: 4px;
					padding: 5px 6px;
					border-radius: 12px;
					border: 1px solid var(--color-border, rgba(255,255,255,0.1));
					background: color-mix(in srgb, var(--wb-canvas) 80%, transparent);
					backdrop-filter: blur(12px);
					-webkit-backdrop-filter: blur(12px);
					box-shadow: 0 4px 24px rgba(0,0,0,0.3);
				}

				.whiteboard-toolbar-btn {
					display: flex;
					align-items: center;
					gap: 6px;
					padding: 6px 12px;
					border-radius: 8px;
					border: none;
					background: transparent;
					color: var(--color-text-muted, #6b7280);
					font-size: 12px;
					font-weight: 500;
					cursor: pointer;
					transition: background 0.12s, color 0.12s;
					white-space: nowrap;
				}

				.whiteboard-toolbar-btn:hover {
					background: rgba(255,255,255,0.07);
					color: var(--color-text, #e2e8f0);
				}

				.whiteboard-toolbar-btn.active {
					background: rgba(99,102,241,0.15);
					color: #818cf8;
				}

				.whiteboard-toolbar-sep {
					width: 1px;
					height: 20px;
					background: var(--color-border, rgba(255,255,255,0.08));
					flex-shrink: 0;
				}

				/* ── Popover ─────────────────────────────────────────── */

				.whiteboard-popover {
					width: 300px;
					border-radius: 12px;
					border: 1px solid var(--color-border, rgba(255,255,255,0.12));
					background: var(--color-surface, #1a1d27);
					box-shadow: 0 8px 32px rgba(0,0,0,0.4);
					overflow: hidden;
					animation: wb-pop-in 0.12s ease-out;
				}

				@keyframes wb-pop-in {
					from { opacity: 0; transform: translateY(6px) scale(0.97); }
					to   { opacity: 1; transform: translateY(0) scale(1); }
				}

				.whiteboard-popover-body {
					padding: 12px;
					display: flex;
					flex-direction: column;
					gap: 8px;
				}

				.whiteboard-popover-textarea {
					width: 100%;
					min-height: 80px;
					resize: vertical;
					padding: 9px 11px;
					border-radius: 8px;
					border: 1px solid var(--color-border, rgba(255,255,255,0.1));
					background: rgba(255,255,255,0.04);
					color: var(--color-text, #e2e8f0);
					font-size: 13px;
					line-height: 1.5;
					font-family: inherit;
					outline: none;
					box-sizing: border-box;
					transition: border-color 0.12s;
				}

				.whiteboard-popover-textarea:focus {
					border-color: rgba(99,102,241,0.5);
				}

				.whiteboard-popover-input {
					width: 100%;
					padding: 9px 11px;
					border-radius: 8px;
					border: 1px solid var(--color-border, rgba(255,255,255,0.1));
					background: rgba(255,255,255,0.04);
					color: var(--color-text, #e2e8f0);
					font-size: 13px;
					font-family: inherit;
					outline: none;
					box-sizing: border-box;
					transition: border-color 0.12s;
				}

				.whiteboard-popover-input:focus {
					border-color: rgba(99,102,241,0.5);
				}

				.whiteboard-popover-footer {
					display: flex;
					justify-content: flex-end;
					gap: 6px;
				}

				.whiteboard-popover-cancel {
					padding: 6px 14px;
					border-radius: 7px;
					border: 1px solid var(--color-border, rgba(255,255,255,0.08));
					background: transparent;
					color: var(--color-text-muted, #6b7280);
					font-size: 12px;
					font-weight: 500;
					cursor: pointer;
					transition: background 0.1s;
				}

				.whiteboard-popover-cancel:hover {
					background: rgba(255,255,255,0.05);
				}

				.whiteboard-popover-submit {
					padding: 6px 14px;
					border-radius: 7px;
					border: none;
					background: #6366f1;
					color: #fff;
					font-size: 12px;
					font-weight: 500;
					cursor: pointer;
					transition: background 0.1s;
				}

				.whiteboard-popover-submit:hover {
					background: #4f52e0;
				}

				.whiteboard-popover-submit:disabled {
					opacity: 0.45;
					cursor: default;
				}
			`}</style>

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
				style={{ display: "none" }}
				onChange={handleFileChange}
			/>

			<div className="whiteboard-root">
				<div className="whiteboard-header">
					<span className="whiteboard-header-dot" />
					Whiteboard
				</div>

				{visibleArtifacts.length === 0 ? (
					<EmptyState />
				) : (
					<div
						ref={scrollRef}
						className={`whiteboard-scroll${isPanningScroll ? " whiteboard-scroll--panning" : ""}`}
						onPointerDown={onScrollPointerDown}
						onPointerMove={onScrollPointerMove}
						onPointerUp={endScrollPan}
						onPointerCancel={endScrollPan}
					>
						<div
							className="whiteboard-zoom-sleeve"
							style={{
								width: canvasSize.width * zoom,
								height: canvasSize.height * zoom,
							}}
						>
							<div
								className="whiteboard-canvas"
								style={{
									width: canvasSize.width,
									height: canvasSize.height,
									transform: `scale(${zoom})`,
									transformOrigin: "0 0",
								}}
							>
								{visibleArtifacts.map((artifact, idx) => {
									const itemKey = whiteboardItemKey(artifact);
									const pos =
										positions[itemKey] ?? defaultPositionForIndex(idx);
									return (
										<WhiteboardDraggableItem
											key={itemKey}
											artifact={artifact}
											itemKey={itemKey}
											position={pos}
											layoutZoom={zoom}
											onPositionChange={onPositionChange}
											onDismiss={onDismiss}
											zLift={draggingKey === itemKey}
											onDragStart={setDraggingKey}
											onDragEnd={() => setDraggingKey(null)}
											onImageDoubleClick={onImageDoubleClick}
										/>
									);
								})}
							</div>
						</div>
					</div>
				)}

				{/* Bottom toolbar */}
				<div className="whiteboard-toolbar-area">
					{/* Note popover */}
					{noteInput !== null && (
						<form className="whiteboard-popover" onSubmit={handleAddNote}>
							<div className="whiteboard-popover-body">
								<textarea
									ref={noteTextareaRef}
									className="whiteboard-popover-textarea"
									value={noteInput}
									onChange={(e) => setNoteInput(e.target.value)}
									placeholder="Write a note…"
									onKeyDown={(e) => {
										if (e.key === "Escape") setNoteInput(null);
										if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
											e.preventDefault();
											handleAddNote(e as unknown as React.FormEvent);
										}
									}}
								/>
								<div className="whiteboard-popover-footer">
									<button
										type="button"
										className="whiteboard-popover-cancel"
										onClick={() => setNoteInput(null)}
									>
										Cancel
									</button>
									<button
										type="submit"
										className="whiteboard-popover-submit"
										disabled={!noteInput.trim()}
									>
										Add Note
									</button>
								</div>
							</div>
						</form>
					)}

					{/* Link popover */}
					{linkInput !== null && (
						<form className="whiteboard-popover" onSubmit={handleAddLink}>
							<div className="whiteboard-popover-body">
								<input
									ref={linkInputRef}
									className="whiteboard-popover-input"
									type="url"
									value={linkInput}
									onChange={(e) => setLinkInput(e.target.value)}
									placeholder="Paste a URL…"
									onKeyDown={(e) => {
										if (e.key === "Escape") setLinkInput(null);
									}}
								/>
								<div className="whiteboard-popover-footer">
									<button
										type="button"
										className="whiteboard-popover-cancel"
										onClick={() => setLinkInput(null)}
									>
										Cancel
									</button>
									<button
										type="submit"
										className="whiteboard-popover-submit"
										disabled={!linkInput.trim()}
									>
										Add Link
									</button>
								</div>
							</div>
						</form>
					)}

					{/* Icon toolbar */}
					<div className="whiteboard-toolbar">
						<button
							type="button"
							className={`whiteboard-toolbar-btn${noteInput !== null ? " active" : ""}`}
							onClick={openNote}
							title="Add a note"
						>
							<NoteIcon />
							Note
						</button>
						<div className="whiteboard-toolbar-sep" />
						<button
							type="button"
							className="whiteboard-toolbar-btn"
							onClick={openImage}
							title="Add an image"
						>
							<ImageIcon />
							Image
						</button>
						<div className="whiteboard-toolbar-sep" />
						<button
							type="button"
							className={`whiteboard-toolbar-btn${linkInput !== null ? " active" : ""}`}
							onClick={openLink}
							title="Add a link"
						>
							<LinkIcon />
							Link
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
