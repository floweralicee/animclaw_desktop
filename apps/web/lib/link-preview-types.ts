export type LinkPreviewPayload = {
	provider: "youtube" | "vimeo" | "link";
	title: string;
	thumbnailUrl: string | null;
	embedUrl: string | null;
	canonicalUrl: string;
};
