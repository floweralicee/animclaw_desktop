"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GenUIComponentProps, ImagePickerArgs } from "@/lib/generative-ui-registry";

function resolveImageSrc(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
		return url;
	}
	return `/api/workspace/raw-file?path=${encodeURIComponent(url)}`;
}

export function ImagePicker({
	toolCallId,
	status,
	args,
	result,
	respond,
}: GenUIComponentProps<ImagePickerArgs>) {
	const images = args.images ?? [];
	const alreadySelected = typeof result?.selectedIndex === "number" ? (result.selectedIndex as number) : null;
	const [selectedIndex, setSelectedIndex] = useState<number | null>(alreadySelected);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [confirmed, setConfirmed] = useState(status === "done" || alreadySelected !== null);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

	const handleSelect = useCallback(
		(index: number) => {
			if (confirmed) return;
			setSelectedIndex(index);
		},
		[confirmed],
	);

	const handleConfirm = useCallback(() => {
		if (selectedIndex === null || confirmed) return;
		setConfirmed(true);
		const img = images[selectedIndex];
		respond({
			selectedIndex,
			selectedImage: img?.url ?? "",
			selectedPath: img?.path ?? img?.url ?? "",
			selectedLabel: img?.label ?? `Image ${selectedIndex + 1}`,
		});
	}, [selectedIndex, confirmed, images, respond]);

	const isDone = confirmed || status === "done";

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
						<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
						<circle cx="9" cy="9" r="2" />
						<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
					</svg>
					<span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
						{isDone ? "Selected Image" : "Pick an Image"}
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

			{/* Prompt */}
			{args.prompt && (
				<div
					className="px-4 py-2 text-[11px] leading-relaxed"
					style={{
						color: "var(--color-text-muted)",
						borderBottom: "1px solid var(--color-border)",
					}}
				>
					<span className="font-medium" style={{ color: "var(--color-text)" }}>Prompt: </span>
					{args.prompt.length > 200 ? args.prompt.slice(0, 200) + "..." : args.prompt}
				</div>
			)}

			{/* Image grid */}
			<div className="p-3">
				<div className={`grid gap-2 ${images.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
					{images.map((img, i) => {
						const isSelected = selectedIndex === i;
						const isHovered = hoverIndex === i;
						const isOther = isDone && selectedIndex !== null && selectedIndex !== i;

						return (
							<motion.div
								key={`${toolCallId}-img-${i}`}
								layout
								className="relative rounded-xl overflow-hidden cursor-pointer group"
								style={{
									aspectRatio: "1",
									opacity: isOther ? 0.4 : 1,
									outline: isSelected
										? "2.5px solid var(--color-accent)"
										: isHovered && !isDone
											? "2px solid color-mix(in srgb, var(--color-accent) 50%, transparent)"
											: "2px solid transparent",
									outlineOffset: "-2px",
									transition: "opacity 200ms, outline-color 150ms",
								}}
								onClick={() => handleSelect(i)}
								onMouseEnter={() => setHoverIndex(i)}
								onMouseLeave={() => setHoverIndex(null)}
								onDoubleClick={() => setLightboxIndex(i)}
							>
								<img
									src={resolveImageSrc(img.url)}
									alt={img.label ?? `Option ${i + 1}`}
									className="w-full h-full object-cover"
									loading="lazy"
									draggable={false}
								/>
								{/* Number badge */}
								<div
									className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
									style={{
										background: isSelected ? "var(--color-accent)" : "rgba(0,0,0,0.5)",
										color: "#fff",
										backdropFilter: isSelected ? "none" : "blur(4px)",
									}}
								>
									{i + 1}
								</div>
								{/* Checkmark for selected */}
								{isSelected && (
									<motion.div
										initial={{ scale: 0 }}
										animate={{ scale: 1 }}
										className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
										style={{ background: "var(--color-accent)" }}
									>
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
											<polyline points="20 6 9 17 4 12" />
										</svg>
									</motion.div>
								)}
								{/* Hover overlay */}
								{!isDone && (
									<div
										className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
										style={{ background: "rgba(0,0,0,0.15)" }}
									>
										<span className="text-white text-[10px] font-medium px-2 py-1 rounded-md" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
											{isSelected ? "Selected" : "Click to select"}
										</span>
									</div>
								)}
								{img.label && (
									<div
										className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] truncate"
										style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.6))", color: "#fff" }}
									>
										{img.label}
									</div>
								)}
							</motion.div>
						);
					})}
				</div>
			</div>

			{/* Actions */}
			{!isDone && (
				<div
					className="px-4 py-3 flex items-center justify-between"
					style={{ borderTop: "1px solid var(--color-border)" }}
				>
					<span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
						{selectedIndex !== null
							? `Image ${selectedIndex + 1} selected`
							: "Click an image to select it"}
					</span>
					<button
						type="button"
						disabled={selectedIndex === null}
						onClick={handleConfirm}
						className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
						style={{
							background: selectedIndex !== null ? "var(--color-accent)" : "var(--color-surface-hover)",
							color: selectedIndex !== null ? "#fff" : "var(--color-text-muted)",
							cursor: selectedIndex !== null ? "pointer" : "not-allowed",
							opacity: selectedIndex !== null ? 1 : 0.5,
						}}
					>
						Confirm Selection
					</button>
				</div>
			)}

			{isDone && selectedIndex !== null && (
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
						Image {selectedIndex + 1} confirmed
						{images[selectedIndex]?.label ? ` — ${images[selectedIndex].label}` : ""}
					</span>
				</div>
			)}

			{/* Lightbox */}
			<AnimatePresence>
				{lightboxIndex !== null && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center"
						style={{ background: "rgba(0,0,0,0.85)" }}
						onClick={() => setLightboxIndex(null)}
					>
						<motion.img
							initial={{ scale: 0.9 }}
							animate={{ scale: 1 }}
							exit={{ scale: 0.9 }}
							src={resolveImageSrc(images[lightboxIndex]?.url ?? "")}
							alt={images[lightboxIndex]?.label ?? ""}
							className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
							onClick={(e) => e.stopPropagation()}
						/>
						<button
							type="button"
							className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
							style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
							onClick={() => setLightboxIndex(null)}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
