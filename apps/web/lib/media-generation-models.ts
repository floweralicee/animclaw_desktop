/**
 * Approved Replicate media generation models.
 *
 * Single source of truth for the 3 image and 3 video model slugs shown in
 * the pre-generation dropdown. Update cost labels here when Replicate changes
 * pricing on the model pages — no runtime API fetch is needed.
 *
 * Image pricing: replicate.com/pricing and individual model pages.
 * Video pricing: Veo 3.1 Lite from model README; Kling / Runway from community sources.
 */

export type MediaGenModel = {
	/** Replicate slug (owner/model) passed to the API call */
	id: string;
	/** Display name shown in the dropdown */
	label: string;
	/** Short cost string shown next to the label */
	costLabel: string;
	/** Pre-selected by default in the picker */
	default?: true;
};

export type ImageGenModel = MediaGenModel & {
	/** Quality tiers if the model bills per quality level (gpt-image-1.5) */
	costTiers?: {
		lowUsdPerImage: number;
		mediumUsdPerImage: number;
		highUsdPerImage: number;
	};
};

export const IMAGE_GEN_MODELS: ImageGenModel[] = [
	{
		id: "google/nano-banana-2",
		label: "Nano Banana 2",
		costLabel: "~$0.07 / image",
		default: true,
	},
	{
		id: "black-forest-labs/flux-1.1-pro",
		label: "FLUX 1.1 Pro",
		costLabel: "$0.04 / image",
	},
	{
		id: "openai/gpt-image-1.5",
		label: "GPT Image 1.5",
		costLabel: "Low $0.013 · Med $0.050 · High $0.136 / img",
		costTiers: {
			lowUsdPerImage: 0.013,
			mediumUsdPerImage: 0.05,
			highUsdPerImage: 0.136,
		},
	},
];

export const VIDEO_GEN_MODELS: MediaGenModel[] = [
	{
		id: "google/veo-3.1-lite",
		label: "Veo 3.1 Lite",
		costLabel: "$0.05 / sec (720p) · $0.08 / sec (1080p)",
		default: true,
	},
	{
		id: "kwaivgi/kling-v3-video",
		label: "Kling 3.0",
		costLabel: "~$0.07 / sec",
	},
	{
		id: "runwayml/gen-4.5",
		label: "Runway Gen-4.5",
		costLabel: "$0.12 / sec",
	},
];

export function getDefaultImageModel(): ImageGenModel {
	return IMAGE_GEN_MODELS.find((m) => m.default) ?? IMAGE_GEN_MODELS[0];
}

export function getDefaultVideoModel(): MediaGenModel {
	return VIDEO_GEN_MODELS.find((m) => m.default) ?? VIDEO_GEN_MODELS[0];
}
