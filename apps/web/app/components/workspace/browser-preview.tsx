"use client";

type BrowserPreviewProps = {
	url: string;
	onClose: () => void;
};

/** Renders an embedded iframe for a URL (e.g. video generation site). Many sites block embedding via X-Frame-Options. */
export function BrowserPreview({ url, onClose }: BrowserPreviewProps) {
	const displayUrl = url.startsWith("http") ? url : `https://${url}`;

	return (
		<aside
			className="h-full border-l flex flex-col"
			style={{
				borderColor: "var(--color-border)",
				background: "var(--color-bg)",
			}}
		>
			{/* Header: close + URL + open in new tab */}
			<div
				className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0"
				style={{ borderBottom: "1px solid var(--color-border)" }}
			>
				<button
					type="button"
					onClick={onClose}
					className="p-1 rounded-md transition-colors flex-shrink-0"
					style={{ color: "var(--color-text-muted)" }}
					title="Close preview"
					onMouseEnter={(e) => {
						(e.currentTarget as HTMLElement).style.background = "var(--color-surface-hover)";
					}}
					onMouseLeave={(e) => {
						(e.currentTarget as HTMLElement).style.background = "transparent";
					}}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>
				<span
					className="text-[11px] truncate min-w-0 flex-1"
					style={{ color: "var(--color-text-muted)", fontFamily: "'SF Mono', 'Fira Code', monospace" }}
					title={displayUrl}
				>
					{displayUrl.replace(/^https?:\/\//, "").replace(/^www\./, "")}
				</span>
				<a
					href={displayUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium flex-shrink-0 transition-colors"
					style={{
						color: "var(--color-accent)",
						background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
					}}
					title="Open in new tab"
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M15 3h6v6" />
						<path d="M10 14 21 3" />
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
					</svg>
					Open in new tab
				</a>
			</div>
			{/* Fallback message for when iframe is blocked */}
			<div
				className="px-3 py-2 text-[11px] flex-shrink-0"
				style={{
					background: "color-mix(in srgb, var(--color-text-muted) 8%, transparent)",
					color: "var(--color-text-muted)",
					borderBottom: "1px solid var(--color-border)",
				}}
			>
				Some sites block embedding. If the preview is blank, use &quot;Open in new tab&quot; above.
			</div>
			{/* Iframe */}
			<div className="flex-1 min-h-0 relative">
				<iframe
					src={displayUrl}
					className="w-full h-full border-0"
					title="Browser preview"
					sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
				/>
			</div>
		</aside>
	);
}
