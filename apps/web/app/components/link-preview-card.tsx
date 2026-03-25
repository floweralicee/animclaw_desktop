"use client";

import { useEffect, useState } from "react";
import type { VideoEmbedInfo } from "@/lib/embed-url";
import type { LinkPreviewPayload } from "@/lib/link-preview-types";

type LinkPreviewCardProps = {
	url: string;
	embed: VideoEmbedInfo;
	/** Visual density: chat bubbles vs whiteboard grid */
	variant?: "chat" | "whiteboard";
	className?: string;
};

function shortDisplayUrl(href: string): string {
	try {
		const u = new URL(href);
		const path = u.pathname === "/" ? "" : u.pathname;
		const s = `${u.hostname.replace(/^www\./, "")}${path}${u.search}`;
		return s.length > 56 ? `${s.slice(0, 54)}…` : s;
	} catch {
		return href.length > 56 ? `${href.slice(0, 54)}…` : href;
	}
}

function ProviderGlyph({ provider }: { provider: "youtube" | "vimeo" }) {
	if (provider === "youtube") {
		return (
			<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
				<path
					fill="#FF0000"
					d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
				/>
			</svg>
		);
	}
	return (
		<span
			className="shrink-0 w-[18px] h-[18px] rounded-sm flex items-center justify-center text-[10px] font-bold leading-none text-white"
			style={{ background: "#1ab7ea" }}
			aria-hidden
		>
			V
		</span>
	);
}

export function LinkPreviewCard({
	url,
	embed,
	variant = "chat",
	className = "",
}: LinkPreviewCardProps) {
	const [playing, setPlaying] = useState(false);
	const [meta, setMeta] = useState<LinkPreviewPayload | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const res = await fetch(
					`/api/link-preview?url=${encodeURIComponent(url)}`,
				);
				if (!res.ok || cancelled) {
					return;
				}
				const data = (await res.json()) as LinkPreviewPayload;
				if (!cancelled) {
					setMeta(data);
				}
			} catch {
				/* keep defaults */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [url]);

	const title = meta?.title ?? (embed.provider === "youtube" ? "YouTube video" : "Vimeo video");
	const thumb =
		meta?.thumbnailUrl ||
		(embed.provider === "youtube" ? embed.thumbnailUrl : null);
	const embedSrc = meta?.embedUrl ?? embed.embedUrl;

	const isChat = variant === "chat";
	const cardShadow = isChat
		? "0 4px 24px rgba(0,0,0,0.08)"
		: "0 8px 28px rgba(0,0,0,0.12)";

	return (
		<div
			className={`overflow-hidden rounded-lg border ${className}`}
			style={{
				background: "var(--color-surface, #fff)",
				borderColor: "var(--color-border, rgba(0,0,0,0.08))",
				boxShadow: cardShadow,
				maxWidth: isChat ? "min(100%, 420px)" : undefined,
			}}
		>
			<div
				className="relative w-full bg-black/5 group cursor-pointer aspect-video"
				onClick={() => setPlaying(true)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setPlaying(true);
					}
				}}
				role={playing ? undefined : "button"}
				tabIndex={playing ? -1 : 0}
				aria-label={playing ? undefined : `Play video: ${title}`}
			>
				{playing ? (
					<iframe
						src={embedSrc}
						className="absolute inset-0 w-full h-full border-0"
						title={title}
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
						allowFullScreen
					/>
				) : (
					<>
						{thumb ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={thumb}
								alt=""
								className="absolute inset-0 w-full h-full object-cover"
								loading="lazy"
							/>
						) : (
							<div
								className="absolute inset-0 flex items-center justify-center text-xs"
								style={{ color: "var(--color-text-muted)" }}
							>
								Preview loading…
							</div>
						)}
						<div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
							<div
								className="flex items-center justify-center w-16 h-16 rounded-full pl-1 shadow-lg"
								style={{ background: "rgba(0,0,0,0.55)" }}
							>
								<svg
									width="28"
									height="28"
									viewBox="0 0 24 24"
									fill="white"
									aria-hidden
								>
									<path d="M8 5v14l11-7z" />
								</svg>
							</div>
						</div>
					</>
				)}
			</div>

			<div
				className="px-4 py-3 space-y-1.5"
				style={{
					background: "var(--color-surface, #fff)",
				}}
			>
				<div className="flex items-center gap-2 min-w-0">
					<ProviderGlyph provider={embed.provider} />
					<a
						href={meta?.canonicalUrl ?? embed.canonicalUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-[12px] truncate no-underline hover:underline"
						style={{ color: "var(--color-text-muted, #6b7280)" }}
						onClick={(e) => e.stopPropagation()}
					>
						{shortDisplayUrl(meta?.canonicalUrl ?? url)}
					</a>
				</div>
				<a
					href={meta?.canonicalUrl ?? embed.canonicalUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="block text-[15px] font-semibold leading-snug underline decoration-1 underline-offset-2 hover:opacity-90"
					style={{ color: "#e64a19" }}
					onClick={(e) => e.stopPropagation()}
				>
					{title}
				</a>
			</div>
		</div>
	);
}
