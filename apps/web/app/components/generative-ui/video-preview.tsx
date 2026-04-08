"use client";

import { useState, useCallback, useRef } from "react";
import type { GenUIComponentProps, VideoPreviewArgs } from "@/lib/generative-ui-registry";

function resolveVideoSrc(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:")) {
		return url;
	}
	return `/api/workspace/raw-file?path=${encodeURIComponent(url)}`;
}

function resolveImageSrc(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
		return url;
	}
	return `/api/workspace/raw-file?path=${encodeURIComponent(url)}`;
}

export function VideoPreview({
	toolCallId,
	status,
	args,
	result,
	respond,
}: GenUIComponentProps<VideoPreviewArgs>) {
	const videos = args.videos ?? [];
	const alreadyApproved = typeof result?.approvedIndex === "number" ? (result.approvedIndex as number) : null;
	const [activeIndex, setActiveIndex] = useState(0);
	const [decision, setDecision] = useState<"approved" | "regenerate" | null>(
		status === "done"
			? (alreadyApproved !== null ? "approved" : (result?.action === "regenerate" ? "regenerate" : null))
			: null,
	);
	const videoRef = useRef<HTMLVideoElement>(null);

	const isDone = decision !== null || status === "done";
	const activeVideo = videos[activeIndex];

	const handleApprove = useCallback(() => {
		if (isDone || !activeVideo) return;
		setDecision("approved");
		respond({
			action: "approve",
			approvedIndex: activeIndex,
			approvedVideo: activeVideo.url,
			approvedPath: activeVideo.path ?? activeVideo.url,
		});
	}, [isDone, activeVideo, activeIndex, respond]);

	const handleRegenerate = useCallback(() => {
		if (isDone) return;
		setDecision("regenerate");
		respond({
			action: "regenerate",
			currentIndex: activeIndex,
			feedback: "User requested regeneration",
		});
	}, [isDone, activeIndex, respond]);

	if (videos.length === 0) {
		return (
			<div className="rounded-2xl p-4 text-xs" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
				No videos to preview.
			</div>
		);
	}

	return (
		<div
			className="rounded-2xl overflow-hidden"
			style={{
				background: "var(--color-surface)",
				border: "1px solid var(--color-border)",
			}}
		>
			{/* Header */}
			<div
				className="px-4 py-2.5 flex items-center justify-between"
				style={{
					borderBottom: "1px solid var(--color-border)",
					background: "var(--color-surface-hover)",
				}}
			>
				<div className="flex items-center gap-2">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
						<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
						<rect x="2" y="6" width="14" height="12" rx="2" />
					</svg>
					<span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
						{isDone ? "Video Review Complete" : "Review Video"}
					</span>
				</div>
				<div className="flex items-center gap-2">
					{args.model && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}>
							{args.model}
						</span>
					)}
					{args.shotNumber && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
							{args.sceneNumber ? `Scene ${args.sceneNumber} / ` : ""}Shot {args.shotNumber}
						</span>
					)}
				</div>
			</div>

			{/* Video player */}
			<div className="relative" style={{ background: "#000" }}>
				<video
					ref={videoRef}
					key={`${toolCallId}-video-${activeIndex}`}
					src={resolveVideoSrc(activeVideo?.url ?? "")}
					controls
					className="w-full max-h-[400px]"
					style={{ aspectRatio: "16/9", objectFit: "contain" }}
					preload="metadata"
				/>
				{/* Source image reference */}
				{args.sourceImage && (
					<div className="absolute top-2 right-2 w-16 h-16 rounded-lg overflow-hidden" style={{ border: "2px solid rgba(255,255,255,0.3)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
						<img
							src={resolveImageSrc(args.sourceImage)}
							alt="Source"
							className="w-full h-full object-cover"
						/>
						<div className="absolute bottom-0 left-0 right-0 text-center text-[8px] py-0.5" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
							Source
						</div>
					</div>
				)}
			</div>

			{/* Video selector (multiple takes) */}
			{videos.length > 1 && (
				<div
					className="px-4 py-2 flex items-center gap-2 overflow-x-auto"
					style={{ borderTop: "1px solid var(--color-border)" }}
				>
					{videos.map((v, i) => (
						<button
							key={`${toolCallId}-tab-${i}`}
							type="button"
							onClick={() => setActiveIndex(i)}
							className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap"
							style={{
								background: i === activeIndex ? "var(--color-accent)" : "var(--color-surface-hover)",
								color: i === activeIndex ? "#fff" : "var(--color-text-muted)",
								cursor: "pointer",
							}}
						>
							{v.label ?? `Take ${i + 1}`}
						</button>
					))}
				</div>
			)}

			{/* Prompt */}
			{args.prompt && (
				<div
					className="px-4 py-2 text-[11px] leading-relaxed"
					style={{
						color: "var(--color-text-muted)",
						borderTop: "1px solid var(--color-border)",
					}}
				>
					<span className="font-medium" style={{ color: "var(--color-text)" }}>Prompt: </span>
					{args.prompt.length > 200 ? args.prompt.slice(0, 200) + "..." : args.prompt}
				</div>
			)}

			{/* Actions */}
			{!isDone && (
				<div
					className="px-4 py-3 flex items-center justify-between gap-3"
					style={{ borderTop: "1px solid var(--color-border)" }}
				>
					<button
						type="button"
						onClick={handleRegenerate}
						className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
						style={{
							background: "var(--color-surface-hover)",
							color: "var(--color-text-muted)",
							cursor: "pointer",
							border: "1px solid var(--color-border)",
						}}
					>
						Regenerate
					</button>
					<button
						type="button"
						onClick={handleApprove}
						className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
						style={{
							background: "var(--color-accent)",
							color: "#fff",
							cursor: "pointer",
						}}
					>
						Approve Video
					</button>
				</div>
			)}

			{isDone && (
				<div
					className="px-4 py-2.5 flex items-center gap-2"
					style={{
						borderTop: "1px solid var(--color-border)",
						background: decision === "approved"
							? "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))"
							: "color-mix(in srgb, var(--color-warning, #f59e0b) 6%, var(--color-surface))",
					}}
				>
					{decision === "approved" ? (
						<>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
								<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
								<polyline points="22 4 12 14.01 9 11.01" />
							</svg>
							<span className="text-xs" style={{ color: "var(--color-accent)" }}>
								Video approved
								{activeVideo?.label ? ` — ${activeVideo.label}` : ""}
							</span>
						</>
					) : (
						<>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-warning, #f59e0b)" }}>
								<path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
							</svg>
							<span className="text-xs" style={{ color: "var(--color-warning, #f59e0b)" }}>
								Regeneration requested
							</span>
						</>
					)}
				</div>
			)}
		</div>
	);
}
