import { Node, mergeAttributes } from "@tiptap/core";
import { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

export const chatFileMentionPluginKey = new PluginKey("chatFileMention");

export type FileMentionAttrs = {
	label: string;
	path: string;
	/** Distinguish between file, object, and entry mentions */
	mentionType?: "file" | "object" | "entry";
	/** Object name for entry mentions */
	objectName?: string;
};

/** Resolve mention pill colors from the mention type or filename extension. */
function mentionColors(label: string, mentionType?: string): { bg: string; fg: string } {
	if (mentionType === "object") {return { bg: "var(--color-chip-object)", fg: "var(--color-chip-object-text)" };}
	if (mentionType === "entry") {return { bg: "var(--color-chip-report)", fg: "var(--color-chip-report-text)" };}
	const ext = label.split(".").pop()?.toLowerCase() ?? "";
	if (
		["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tiff", "heic"].includes(ext)
	)
		{return { bg: "var(--color-file-image-bg)", fg: "var(--color-file-image)" };}
	if (["mp4", "webm", "mov", "avi", "mkv", "flv"].includes(ext))
		{return { bg: "var(--color-file-video-bg)", fg: "var(--color-file-video)" };}
	if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext))
		{return { bg: "var(--color-file-audio-bg)", fg: "var(--color-file-audio)" };}
	if (ext === "pdf") {return { bg: "var(--color-file-pdf-bg)", fg: "var(--color-file-pdf)" };}
	if (
		[
			"js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java",
			"cpp", "c", "h", "css", "html", "json", "yaml", "yml",
			"toml", "md", "sh", "bash", "sql", "swift", "kt",
		].includes(ext)
	)
		{return { bg: "var(--color-file-code-bg)", fg: "var(--color-file-code)" };}
	if (
		["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv"].includes(ext)
	)
		{return { bg: "var(--color-file-document-bg)", fg: "var(--color-file-document)" };}
	return { bg: "var(--color-file-other-bg)", fg: "var(--color-file-other)" };
}

/**
 * Inline atom node for file mentions in the chat editor.
 * Renders as a non-editable pill: [@icon filename].
 * Serializes to `[file: /absolute/path]` for the chat API.
 */
export const FileMentionNode = Node.create({
	name: "chatFileMention",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			label: { default: "" },
			path: { default: "" },
			mentionType: { default: "file" },
			objectName: { default: "" },
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-chat-file-mention]' }];
	},

	renderHTML({ HTMLAttributes }) {
		const label = (HTMLAttributes.label as string) || "file";
		const mType = HTMLAttributes.mentionType as string | undefined;
		const colors = mentionColors(label, mType);
		return [
			"span",
			mergeAttributes(
				{
					"data-chat-file-mention": "",
					class: "chat-file-mention",
					style: `--mention-bg: ${colors.bg}; --mention-fg: ${colors.fg};`,
					title: HTMLAttributes.path || "",
				},
				HTMLAttributes,
			),
			`@${label}`,
		];
	},
});

/** Suggestion configuration for the @ trigger in the chat editor. */
export type FileMentionSuggestionOptions = Omit<
	SuggestionOptions<{ name: string; path: string; type: string }>,
	"editor"
>;

/**
 * Build the suggestion config for the file mention node.
 * The actual items fetching and rendering is handled by the chat-editor component.
 */
export function buildFileMentionSuggestion(
	overrides: Partial<FileMentionSuggestionOptions>,
): Partial<FileMentionSuggestionOptions> {
	return {
		char: "@",
		pluginKey: chatFileMentionPluginKey,
		startOfLine: false,
		allowSpaces: true,
		...overrides,
	};
}
