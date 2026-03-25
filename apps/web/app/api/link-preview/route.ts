import { NextResponse } from "next/server";
import { parseVideoEmbed, type VideoEmbedInfo } from "@/lib/embed-url";
import type { LinkPreviewPayload } from "@/lib/link-preview-types";

const UA =
	"Mozilla/5.0 (compatible; AnimclawBot/1.0; +https://github.com/animclaw)";

async function fetchOEmbed(
	url: string,
): Promise<{ title?: string; thumbnail_url?: string } | null> {
	try {
		const oembed =
			url.includes("vimeo.com") || url.includes("player.vimeo.com")
				? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
				: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
		const res = await fetch(oembed, {
			headers: { "User-Agent": UA },
			next: { revalidate: 3600 },
		});
		if (!res.ok) {
			return null;
		}
		return (await res.json()) as {
			title?: string;
			thumbnail_url?: string;
		};
	} catch {
		return null;
	}
}

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const raw = searchParams.get("url")?.trim();
	if (!raw || (!raw.startsWith("http://") && !raw.startsWith("https://"))) {
		return NextResponse.json(
			{ error: "Invalid or missing url" },
			{ status: 400 },
		);
	}

	let video: VideoEmbedInfo | null = null;
	try {
		video = parseVideoEmbed(raw);
	} catch {
		video = null;
	}

	if (video) {
		const meta = await fetchOEmbed(video.canonicalUrl);
		const title =
			typeof meta?.title === "string" && meta.title.trim()
				? meta.title.trim()
				: video.provider === "youtube"
					? "YouTube video"
					: "Vimeo video";
		const thumb =
			video.provider === "youtube"
				? video.thumbnailUrl || null
				: typeof meta?.thumbnail_url === "string"
					? meta.thumbnail_url
					: video.thumbnailUrl || null;

		const payload: LinkPreviewPayload = {
			provider: video.provider,
			title,
			thumbnailUrl: thumb,
			embedUrl: video.embedUrl,
			canonicalUrl: video.canonicalUrl,
		};
		return NextResponse.json(payload);
	}

	let hostname = raw;
	try {
		hostname = new URL(raw).hostname.replace(/^www\./, "");
	} catch {
		/* keep raw */
	}

	const payload: LinkPreviewPayload = {
		provider: "link",
		title: hostname,
		thumbnailUrl: null,
		embedUrl: null,
		canonicalUrl: raw,
	};
	return NextResponse.json(payload);
}
