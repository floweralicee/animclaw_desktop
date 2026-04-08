"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type { GenUIComponentProps } from "@/lib/generative-ui-registry";
import { IMAGE_GEN_MODELS, VIDEO_GEN_MODELS } from "@/lib/media-generation-models";
import type { ImageGenModel, MediaGenModel } from "@/lib/media-generation-models";

// ── Arg types ──────────────────────────────────────────────────────────────────

export type MediaGenerationRequestArgs = {
	mode: "image" | "video";
	prompt: string;
	shotNumber?: string;
	sceneNumber?: string;
	/** For video mode: URL/path of the reference image to animate */
	referenceImage?: string;
	/** Agent can pass a subset; defaults to full catalog list */
	models?: Array<{ id: string; label: string; costLabel: string }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveImageSrc(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
		return url;
	}
	return `/api/workspace/raw-file?path=${encodeURIComponent(url)}`;
}

function modelListForMode(
	mode: "image" | "video",
	overrides?: Array<{ id: string; label: string; costLabel: string }>,
): Array<ImageGenModel | MediaGenModel> {
	if (overrides && overrides.length > 0) return overrides;
	return mode === "image" ? IMAGE_GEN_MODELS : VIDEO_GEN_MODELS;
}

function defaultModelId(models: Array<{ id: string; default?: true }>): string {
	return models.find((m) => m.default)?.id ?? models[0]?.id ?? "";
}

// ── Cost tiers sub-selector (gpt-image-1.5 quality) ───────────────────────────

const QUALITY_TIERS: Array<{ key: "low" | "medium" | "high"; label: string }> = [
	{ key: "low", label: "Low" },
	{ key: "medium", label: "Medium" },
	{ key: "high", label: "High" },
];

function QualityPicker({
	tiers,
	selected,
	onSelect,
	disabled,
}: {
	tiers: NonNullable<ImageGenModel["costTiers"]>;
	selected: "low" | "medium" | "high";
	onSelect: (k: "low" | "medium" | "high") => void;
	disabled: boolean;
}) {
	const prices: Record<string, number> = {
		low: tiers.lowUsdPerImage,
		medium: tiers.mediumUsdPerImage,
		high: tiers.highUsdPerImage,
	};
	return (
		<div className="flex items-center gap-1.5 flex-wrap mt-1">
			{QUALITY_TIERS.map(({ key, label }) => (
				<button
					key={key}
					type="button"
					disabled={disabled}
					onClick={() => onSelect(key)}
					className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
					style={{
						background: selected === key ? "var(--color-accent)" : "var(--color-surface-hover)",
						color: selected === key ? "#fff" : "var(--color-text-muted)",
						border: selected === key ? "none" : "1px solid var(--color-border)",
						cursor: disabled ? "not-allowed" : "pointer",
						opacity: disabled ? 0.6 : 1,
					}}
				>
					{label} — ${prices[key].toFixed(3)}
				</button>
			))}
		</div>
	);
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MediaGenerationRequest({
	toolCallId,
	status,
	args,
	result,
	respond,
}: GenUIComponentProps<MediaGenerationRequestArgs>) {
	const models = modelListForMode(args.mode, args.models as Array<{ id: string; label: string; costLabel: string; default?: true }>);

	const alreadySubmittedModelId = typeof result?.selectedModelId === "string" ? result.selectedModelId : null;
	const [selectedModelId, setSelectedModelId] = useState<string>(
		alreadySubmittedModelId ?? defaultModelId(models as Array<{ id: string; default?: true }>),
	);
	const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
	const [submitted, setSubmitted] = useState(status === "done" || alreadySubmittedModelId !== null);
	const [promptExpanded, setPromptExpanded] = useState(false);

	const isDone = submitted || status === "done";
	const isImage = args.mode === "image";

	const selectedModel = models.find((m) => m.id === selectedModelId);
	const hasTiers = isImage && "costTiers" in (selectedModel ?? {}) && !!(selectedModel as ImageGenModel).costTiers;

	const handleGenerate = useCallback(() => {
		if (!selectedModelId || isDone) return;
		setSubmitted(true);
		respond({
			selectedModelId,
			quality: hasTiers ? quality : undefined,
			prompt: args.prompt,
			mode: args.mode,
			shotNumber: args.shotNumber,
			sceneNumber: args.sceneNumber,
			referenceImage: args.referenceImage,
		});
	}, [selectedModelId, isDone, hasTiers, quality, args, respond]);

	const promptTruncated = args.prompt.length > 240;
	const promptDisplay = promptTruncated && !promptExpanded
		? args.prompt.slice(0, 240) + "…"
		: args.prompt;

	const modeIcon = isImage ? (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
			<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
			<circle cx="9" cy="9" r="2" />
			<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
		</svg>
	) : (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
			<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
			<rect x="2" y="6" width="14" height="12" rx="2" />
		</svg>
	);

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
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
					{modeIcon}
					<span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
						{isDone
							? `${isImage ? "Image" : "Video"} Generation Started`
							: `Generate ${isImage ? "Images" : "Video"}`}
					</span>
				</div>
				<div className="flex items-center gap-2">
					{args.shotNumber && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
							{args.sceneNumber ? `Scene ${args.sceneNumber} / ` : ""}Shot {args.shotNumber}
						</span>
					)}
				</div>
			</div>

			{/* Prompt */}
			<div
				className="px-4 py-3"
				style={{ borderBottom: "1px solid var(--color-border)" }}
			>
				<p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
					Prompt
				</p>
				<p className="text-[12px] leading-relaxed" style={{ color: "var(--color-text)" }}>
					{promptDisplay}
				</p>
				{promptTruncated && (
					<button
						type="button"
						onClick={() => setPromptExpanded((v) => !v)}
						className="mt-1 text-[11px] font-medium"
						style={{ color: "var(--color-accent)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
					>
						{promptExpanded ? "Show less" : "Show full prompt"}
					</button>
				)}
			</div>

			{/* Reference image (video mode) */}
			{!isImage && args.referenceImage && (
				<div
					className="px-4 py-3 flex items-center gap-3"
					style={{ borderBottom: "1px solid var(--color-border)" }}
				>
					<div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--color-border)" }}>
						<img
							src={resolveImageSrc(args.referenceImage)}
							alt="Reference"
							className="w-full h-full object-cover"
						/>
					</div>
					<p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
						Reference image — first frame of generated video
					</p>
				</div>
			)}

			{/* Model picker */}
			<div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
				<p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
					Model
				</p>
				<div className="flex flex-col gap-1.5">
					{models.map((m) => {
						const isSelected = m.id === selectedModelId;
						return (
							<button
								key={m.id}
								type="button"
								disabled={isDone}
								onClick={() => setSelectedModelId(m.id)}
								className="flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all"
								style={{
									background: isSelected ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))" : "var(--color-surface-hover)",
									border: isSelected ? "1.5px solid var(--color-accent)" : "1.5px solid transparent",
									cursor: isDone ? "not-allowed" : "pointer",
									opacity: isDone && !isSelected ? 0.4 : 1,
								}}
							>
								<div className="flex items-center gap-2 min-w-0">
									<div
										className="w-3 h-3 rounded-full flex-shrink-0"
										style={{
											background: isSelected ? "var(--color-accent)" : "var(--color-border)",
											boxShadow: isSelected ? "0 0 0 2px color-mix(in srgb, var(--color-accent) 25%, transparent)" : "none",
										}}
									/>
									<span className="text-xs font-medium truncate" style={{ color: "var(--color-text)" }}>
										{m.label}
									</span>
								</div>
								<span className="text-[10px] ml-2 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
									{m.costLabel}
								</span>
							</button>
						);
					})}
				</div>

				{/* Quality tier picker (GPT Image 1.5 only) */}
				{hasTiers && !isDone && (
					<div className="mt-2">
						<p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
							Quality
						</p>
						<QualityPicker
							tiers={(selectedModel as ImageGenModel).costTiers!}
							selected={quality}
							onSelect={setQuality}
							disabled={isDone}
						/>
					</div>
				)}
			</div>

			{/* Action / status */}
			{!isDone ? (
				<div
					className="px-4 py-3 flex items-center justify-between"
					style={{ background: "var(--color-surface-hover)" }}
				>
					<p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
						Pick a model, then generate.
					</p>
					<button
						type="button"
						disabled={!selectedModelId}
						onClick={handleGenerate}
						className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
						style={{
							background: selectedModelId ? "var(--color-accent)" : "var(--color-surface)",
							color: selectedModelId ? "#fff" : "var(--color-text-muted)",
							cursor: selectedModelId ? "pointer" : "not-allowed",
							opacity: selectedModelId ? 1 : 0.5,
						}}
					>
						Generate
					</button>
				</div>
			) : (
				<div
					className="px-4 py-2.5 flex items-center gap-2"
					style={{
						background: "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))",
					}}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span className="text-xs" style={{ color: "var(--color-accent)" }}>
						Generating with {selectedModel?.label ?? selectedModelId}
						{hasTiers ? ` — ${quality} quality` : ""}…
					</span>
				</div>
			)}
		</motion.div>
	);
}
