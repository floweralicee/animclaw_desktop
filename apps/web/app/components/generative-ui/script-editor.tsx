"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GenUIComponentProps, ScriptEditorArgs } from "@/lib/generative-ui-registry";

export function ScriptEditor({
	status,
	args,
	result,
	respond,
}: GenUIComponentProps<ScriptEditorArgs>) {
	const [content, setContent] = useState(args.content ?? "");
	const [confirmed, setConfirmed] = useState(status === "done" || !!result);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isDone = confirmed || status === "done";

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 500)}px`;
		}
	}, [content]);

	const handleConfirm = useCallback(() => {
		if (isDone) return;
		setConfirmed(true);
		respond({
			action: "confirm",
			content,
			filePath: args.filePath,
		});
	}, [isDone, content, args.filePath, respond]);

	const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

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
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
					</svg>
					<span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
						{args.title ?? "Script Editor"}
					</span>
					{args.filePath && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
							{args.filePath}
						</span>
					)}
				</div>
				<span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
					{wordCount} words
				</span>
			</div>

			{/* Editor */}
			<div className="p-3">
				{isDone ? (
					<div
						className="text-xs leading-relaxed whitespace-pre-wrap rounded-lg p-3"
						style={{
							color: "var(--color-text)",
							background: "var(--color-surface-hover)",
							maxHeight: 400,
							overflow: "auto",
						}}
					>
						{content}
					</div>
				) : (
					<textarea
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						className="w-full text-xs leading-relaxed resize-none rounded-lg p-3 outline-none"
						style={{
							color: "var(--color-text)",
							background: "var(--color-surface-hover)",
							border: "1px solid var(--color-border)",
							minHeight: 120,
							maxHeight: 500,
						}}
						placeholder="Write or edit the script..."
					/>
				)}
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
						Confirm
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
						Script confirmed — {wordCount} words
					</span>
				</div>
			)}
		</div>
	);
}
