"use client";

import { useState, useCallback } from "react";
import type { GenUIComponentProps, StoryboardEditorArgs, GenUIStoryboardPanel } from "@/lib/generative-ui-registry";

function resolveImageSrc(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
		return url;
	}
	return `/api/workspace/raw-file?path=${encodeURIComponent(url)}`;
}

export function StoryboardEditor({
	toolCallId,
	status,
	args,
	result,
	respond,
}: GenUIComponentProps<StoryboardEditorArgs>) {
	const [panels, setPanels] = useState<GenUIStoryboardPanel[]>(args.panels ?? []);
	const [confirmed, setConfirmed] = useState(status === "done" || !!result);
	const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
	const isDone = confirmed || status === "done";

	const handleDragStart = useCallback((index: number) => {
		if (isDone) return;
		setDraggingIndex(index);
	}, [isDone]);

	const handleDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
		e.preventDefault();
		if (draggingIndex === null || draggingIndex === targetIndex) return;
		setPanels((prev) => {
			const next = [...prev];
			const [moved] = next.splice(draggingIndex, 1);
			next.splice(targetIndex, 0, moved);
			return next;
		});
		setDraggingIndex(targetIndex);
	}, [draggingIndex]);

	const handleDragEnd = useCallback(() => {
		setDraggingIndex(null);
	}, []);

	const handleConfirm = useCallback(() => {
		if (isDone) return;
		setConfirmed(true);
		respond({
			action: "confirm",
			panels: panels.map((p) => ({
				id: p.id,
				shotNumber: p.shotNumber,
				sceneNumber: p.sceneNumber,
			})),
			order: panels.map((p) => p.id),
		});
	}, [isDone, panels, respond]);

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
						<rect x="2" y="2" width="8" height="8" rx="1" />
						<rect x="14" y="2" width="8" height="8" rx="1" />
						<rect x="2" y="14" width="8" height="8" rx="1" />
						<rect x="14" y="14" width="8" height="8" rx="1" />
					</svg>
					<span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
						{args.title ?? "Storyboard"}
					</span>
					<span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
						{panels.length} panels
					</span>
				</div>
				{!isDone && (
					<span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
						Drag to reorder
					</span>
				)}
			</div>

			{/* Panels grid */}
			<div className="p-3">
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
					{panels.map((panel, i) => (
						<div
							key={`${toolCallId}-panel-${panel.id}`}
							draggable={!isDone}
							onDragStart={() => handleDragStart(i)}
							onDragOver={(e) => handleDragOver(e, i)}
							onDragEnd={handleDragEnd}
							className="rounded-xl overflow-hidden"
							style={{
								background: "var(--color-surface-hover)",
								border: draggingIndex === i
									? "2px solid var(--color-accent)"
									: "1px solid var(--color-border)",
								cursor: isDone ? "default" : "grab",
								opacity: draggingIndex === i ? 0.6 : 1,
								transition: "opacity 150ms, border-color 150ms",
							}}
						>
							{/* Panel image */}
							<div style={{ aspectRatio: "16/9", background: "#1a1a1a" }}>
								{panel.imageUrl ? (
									<img
										src={resolveImageSrc(panel.imageUrl)}
										alt={`Shot ${panel.shotNumber}`}
										className="w-full h-full object-cover"
										loading="lazy"
										draggable={false}
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center">
										<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255,255,255,0.2)" }}>
											<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
											<circle cx="9" cy="9" r="2" />
											<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
										</svg>
									</div>
								)}
							</div>
							{/* Panel info */}
							<div className="px-2 py-1.5">
								<div className="flex items-center gap-1.5">
									<span className="text-[10px] font-bold" style={{ color: "var(--color-accent)" }}>
										{panel.sceneNumber ? `S${panel.sceneNumber}/` : ""}#{panel.shotNumber}
									</span>
								</div>
								{panel.description && (
									<p className="text-[10px] mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--color-text-muted)" }}>
										{panel.description}
									</p>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Actions */}
			{!isDone && (
				<div
					className="px-4 py-3 flex items-center justify-end"
					style={{ borderTop: "1px solid var(--color-border)" }}
				>
					<button
						type="button"
						onClick={handleConfirm}
						className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
						style={{
							background: "var(--color-accent)",
							color: "#fff",
							cursor: "pointer",
						}}
					>
						Confirm Storyboard
					</button>
				</div>
			)}

			{isDone && (
				<div
					className="px-4 py-2.5 flex items-center gap-2"
					style={{
						borderTop: "1px solid var(--color-border)",
						background: "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))",
					}}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span className="text-xs" style={{ color: "var(--color-accent)" }}>
						Storyboard confirmed — {panels.length} panels
					</span>
				</div>
			)}
		</div>
	);
}
