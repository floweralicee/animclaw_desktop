/** Parse embeddable video URLs (YouTube, Vimeo) for inline players. */

export type VideoEmbedInfo = {
	provider: "youtube" | "vimeo";
	videoId: string;
	embedUrl: string;
	thumbnailUrl: string;
	canonicalUrl: string;
};

const YT_ID = /^[\w-]{11}$/;

function parseYouTubeVideoId(raw: string): string | null {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return null;
	}
	const host = u.hostname.replace(/^www\./, "").toLowerCase();

	if (host === "youtu.be") {
		const id = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
		return YT_ID.test(id) ? id : null;
	}

	if (!host.endsWith("youtube.com")) {
		return null;
	}

	if (u.pathname === "/watch" || u.pathname.startsWith("/watch")) {
		const v = u.searchParams.get("v");
		return v && YT_ID.test(v) ? v : null;
	}

	const embed = u.pathname.match(/^\/embed\/([\w-]{11})/);
	if (embed) {
		return embed[1];
	}

	const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/);
	if (shorts) {
		return shorts[1];
	}

	return null;
}

function parseVimeoVideoId(raw: string): string | null {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return null;
	}
	const host = u.hostname.replace(/^www\./, "").toLowerCase();

	if (host === "vimeo.com") {
		const m = u.pathname.match(/^\/(\d{6,})/);
		return m ? m[1] : null;
	}

	if (host === "player.vimeo.com") {
		const m = u.pathname.match(/^\/video\/(\d{6,})/);
		return m ? m[1] : null;
	}

	return null;
}

export function parseVideoEmbed(raw: string): VideoEmbedInfo | null {
	const trimmed = raw.trim();
	const yt = parseYouTubeVideoId(trimmed);
	if (yt) {
		return {
			provider: "youtube",
			videoId: yt,
			embedUrl: `https://www.youtube.com/embed/${yt}?autoplay=1`,
			thumbnailUrl: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`,
			canonicalUrl: `https://www.youtube.com/watch?v=${yt}`,
		};
	}

	const vm = parseVimeoVideoId(trimmed);
	if (vm) {
		return {
			provider: "vimeo",
			videoId: vm,
			embedUrl: `https://player.vimeo.com/video/${vm}?autoplay=1`,
			thumbnailUrl: "", // filled by link-preview API (oEmbed)
			canonicalUrl: `https://vimeo.com/${vm}`,
		};
	}

	return null;
}

/** Collect http(s) URLs from plain text (one pass, deduped). */
export function extractHttpUrls(text: string): string[] {
	const re = /https?:\/\/[^\s<>"'{}|\\^`[\]()]+/gi;
	const seen = new Set<string>();
	const out: string[] = [];
	let m: RegExpExecArray | null;
	// eslint-disable-next-line no-cond-assign -- intentional exec loop
	while ((m = re.exec(text)) !== null) {
		let u = m[0];
		// trim trailing punctuation often glued to URLs
		u = u.replace(/[),.;:!?]+$/g, "");
		if (!seen.has(u)) {
			seen.add(u);
			out.push(u);
		}
	}
	return out;
}

/** Strip leading `[Context: ...]` block from persisted user message text. */
export function stripContextPrefix(text: string): string {
	return text.replace(/^\[Context:[^\]]+\]\s*\n*/m, "").trim();
}

/** True when the string is only whitespace and http(s) URLs (Milanote-style single-URL paste). */
export function isOnlyUrls(text: string): boolean {
	const stripped = stripContextPrefix(text);
	const withoutUrls = stripped.replace(/https?:\/\/[^\s<>"'{}|\\^`[\]()]+/gi, "");
	return stripped.length > 0 && withoutUrls.replace(/\s+/g, "").length === 0;
}
