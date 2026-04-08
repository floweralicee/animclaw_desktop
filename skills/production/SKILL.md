---
name: production-workflow
description: End-to-end filmmaking production workflow — script writing under pre-production/, shot lists in table format, image generation via Replicate (user picks model), video generation via Replicate (user picks model), and organized asset output under production/.
metadata: { "openclaw": { "inject": true, "always": true, "emoji": "🎬" } }
---

# Production Workflow

You manage the filmmaking production workflow for the workspace at `{{WORKSPACE_PATH}}`.

All script-related writing lives in `{{WORKSPACE_PATH}}/pre-production/` as markdown files.
All generated images and videos live in `{{WORKSPACE_PATH}}/production/` organized by scene and shot.

---

## Pre-Production Writing

All script-related written content MUST be saved as `.md` files under `{{WORKSPACE_PATH}}/pre-production/`. This includes:

- Scripts and screenplay drafts
- Treatments and synopses
- Outlines and beat sheets
- Scene breakdowns
- Dialogue drafts
- Director notes and creative briefs
- Loglines and pitches
- World-building documents
- Character backstories (narrative prose; structured character sheets go in `script/`)

### Rules

1. Create `{{WORKSPACE_PATH}}/pre-production/` if it does not exist.
2. Use descriptive, lowercase, hyphenated filenames: `treatment.md`, `scene-breakdown.md`, `dialogue-draft-act1.md`, `director-notes.md`.
3. Every file starts with a top-level `# Title` heading followed by metadata (project name, author, date, version) as needed.
4. When updating an existing document, edit in place rather than creating a new file.
5. If the user asks you to "write a script", "draft a treatment", "outline the story", or any similar request, the output is ALWAYS a `.md` file saved under `pre-production/`.

---

## Shot Lists

Shot lists MUST always be in **table format**. Use either:

- A markdown table in a `.md` file under `pre-production/` (e.g. `pre-production/shot-list-act1.md`), OR
- The DuckDB `shot` object rendered in table view

### Required Columns

Every shot list table MUST include these columns:

| Column | Description |
|--------|-------------|
| Shot # | Sequential shot number (e.g. `001`, `002`) |
| Scene # | Scene number this shot belongs to |
| Shot Type | Establishing, Wide, Medium, Close-Up, Extreme Close-Up, POV, Two-Shot, Over-the-Shoulder, Insert |
| Description | What happens in the shot — action, blocking, emotion |
| Notes | Production notes, creative direction, style cues, technical specs |
| Characters | Who appears in the shot |
| Generation Prompt | A detailed, generation-ready prompt for image/video AI models (optional) |

The **Generation Prompt** column, when present, is the primary prompt. **Description** and **Notes** must always be incorporated into the final prompt sent to the model — they provide scene context, creative direction, and production details that improve generation quality.

### Example

```markdown
| Shot # | Scene # | Shot Type | Description | Notes | Characters | Generation Prompt |
|--------|---------|-----------|-------------|-------|------------|-------------------|
| 001 | 1 | Establishing | Sunrise over the house on the hill | Grainy newsreel style, high contrast | — | Wide establishing shot of a small colorful house perched on a green hill, golden sunrise light, warm pastel sky, Pixar-style 3D animation, cinematic composition |
| 002 | 1 | Close-Up | Carl's hand on the mailbox | Match Ellie's pin detail from shot 005 | Carl | Extreme close-up of an elderly man's weathered hand resting on a rusty mailbox, soft morning light, shallow depth of field, Pixar-style 3D render |
```

When the user asks to "build a shot list", "create shots", or "break this into shots", ALWAYS produce a table with the columns above.

---

## Image Generation

All image generation happens **inside AnimClaw chat**. Never open external websites or browser windows for generation. Never navigate to Runway, Pika, Midjourney, or any other external tool for image generation.

**CRITICAL**: Do NOT use the browser tool for image or video generation. Use only the API-based generation tools provided by OpenClaw via **Replicate**. If no Replicate API key is configured and generation fails, instruct the user to add one:
- Run `npx animclaw bootstrap` to configure keys interactively, OR
- Run `openclaw --profile animclaw config set media.apiKeys.replicate <YOUR_KEY>`

Never fall back to opening a browser window as a workaround.

### Available image models (Replicate)

| Model label | Replicate slug | Cost |
|-------------|---------------|------|
| **Nano Banana 2** *(default)* | `google/nano-banana-2` | ~$0.07 / image |
| **FLUX 1.1 Pro** | `black-forest-labs/flux-1.1-pro` | $0.04 / image |
| **GPT Image 1.5** | `openai/gpt-image-1.5` | Low $0.013 · Med $0.050 · High $0.136 / image |

### Workflow: Generating a Shot

1. **Read the shot list first.** When the user asks to generate a specific scene and shot (e.g. "generate shot 3 from scene 1"), query the `shot` object in DuckDB or read the shot list markdown to find the matching entry.
2. **Build the prompt from Description, Notes, and Generation Prompt.** Always incorporate **both** the Description and the Notes from the shot list. When a Generation Prompt exists, use it as the primary prompt and append or weave in Description and Notes for context. When no Generation Prompt exists, combine Description and Notes to form the prompt. Never omit Description or Notes when they are present.
3. **Present the `image_generation_request` tool** — this shows the user the full prompt, a dropdown of the 3 Replicate models with pricing, and a Generate button. The user picks a model and clicks Generate. **Do not call the image generation API until the user responds.**

```json
{
  "mode": "image",
  "prompt": "The full generation prompt built from Description, Notes, and Generation Prompt",
  "shotNumber": "001",
  "sceneNumber": "01"
}
```

4. **After the user responds** with their chosen model (e.g. `google/nano-banana-2`), call **Replicate** to generate **4 images** with that slug and the prompt.
5. **Save all images** to `{{WORKSPACE_PATH}}/production/<scene_name>/<shot_name>/` using sanitized folder names (lowercase, underscores, no spaces). Example: `production/scene_01_opening/shot_001_wide/`.
6. **Create or update the generation log** at `{{WORKSPACE_PATH}}/production/generation-log.md` (see Generation Log section below).
7. **Present images using the `image_picker` tool** so the user can visually select their preferred image directly in the chat UI. Call the tool with this structure:

```json
{
  "images": [
    { "url": "production/scene_01_opening/shot_001_wide/image_01.png", "label": "Option 1", "path": "production/scene_01_opening/shot_001_wide/image_01.png" },
    { "url": "production/scene_01_opening/shot_001_wide/image_02.png", "label": "Option 2", "path": "production/scene_01_opening/shot_001_wide/image_02.png" },
    { "url": "production/scene_01_opening/shot_001_wide/image_03.png", "label": "Option 3", "path": "production/scene_01_opening/shot_001_wide/image_03.png" },
    { "url": "production/scene_01_opening/shot_001_wide/image_04.png", "label": "Option 4", "path": "production/scene_01_opening/shot_001_wide/image_04.png" }
  ],
  "prompt": "The prompt used for generation",
  "shotNumber": "001",
  "sceneNumber": "01",
  "model": "Nano Banana 2"
}
```

The `image_picker` renders an interactive grid where the user clicks to select and confirm their preferred image. Wait for the user's response before proceeding. If neither `image_generation_request` nor `image_picker` is available, fall back to plain markdown and ask the user to respond with text.

### Folder Naming

Derive folder names from the shot list data:

- Scene folder: `scene_<number>_<short_description>` (e.g. `scene_01_opening`, `scene_02_marriage`)
- Shot folder: `shot_<number>_<shot_type>` (e.g. `shot_001_wide`, `shot_002_closeup`)
- Image files: `image_01.png`, `image_02.png`, `image_03.png`, `image_04.png`

Create folders as needed before writing files.

---

## Video Generation

Video generation also happens **inside AnimClaw chat**. Never open external websites or browser windows. Do NOT use the browser tool — use only **Replicate** API-based video generation tools.

### Available video models (Replicate)

| Model label | Replicate slug | Cost |
|-------------|---------------|------|
| **Veo 3.1 Lite** *(default)* | `google/veo-3.1-lite` | $0.05 / sec (720p) · $0.08 / sec (1080p) |
| **Kling 3.0** | `kwaivgi/kling-v3-video` | ~$0.07 / sec |
| **Runway Gen-4.5** | `runwayml/gen-4.5` | $0.12 / sec |

All three models support image-to-video. Veo 3.1 Lite always generates with native audio.

### Workflow: Image to Video

1. After the user selects an image via the `image_picker` (or tells you which one they prefer), identify which image they selected.
2. **Build the video prompt** from the shot list: use **both** Description and Notes (and Generation Prompt if present), same as for image generation. The prompt guides motion, style, and creative direction.
3. **Present the `video_generation_request` tool** — this shows the user the full prompt, the reference image, a dropdown of the 3 Replicate video models with pricing, and a Generate button. The user picks a model and clicks Generate. **Do not call the video generation API until the user responds.**

```json
{
  "mode": "video",
  "prompt": "The full video generation prompt built from Description and Notes",
  "shotNumber": "001",
  "sceneNumber": "01",
  "referenceImage": "production/scene_01_opening/shot_001_wide/image_03.png"
}
```

4. **After the user responds** with their chosen model (e.g. `google/veo-3.1-lite`), call **Replicate** to generate the video using that slug with the approved image as the first frame / reference image.
5. **Save the video** to the same shot folder: `{{WORKSPACE_PATH}}/production/<scene_name>/<shot_name>/video.mp4` (or `video_01.mp4`, `video_02.mp4` if multiple takes).
6. **Present the video using the `video_preview` tool** so the user can review, approve, or request regeneration directly in chat:

```json
{
  "videos": [
    { "url": "production/scene_01_opening/shot_001_wide/video.mp4", "label": "Take 1", "path": "production/scene_01_opening/shot_001_wide/video.mp4" }
  ],
  "prompt": "The prompt used for generation",
  "shotNumber": "001",
  "sceneNumber": "01",
  "model": "Veo 3.1 Lite",
  "sourceImage": "production/scene_01_opening/shot_001_wide/image_03.png"
}
```

The `video_preview` renders a video player with Approve/Regenerate buttons. Wait for the user's response before proceeding. If neither `video_generation_request` nor `video_preview` is available, fall back to linking the video file and asking for feedback.

7. **Update the generation log** with the video output.

### Iterative Refinement

The user can continue chatting to refine:
- "Make it longer"
- "Add more camera movement"
- "Try a different style"
- "Regenerate with a zoom-in"

Each refinement generates a new video saved as `video_02.mp4`, `video_03.mp4`, etc. in the same shot folder. Always update the generation log.

---

## Generation Log

Maintain a live-updated markdown file at `{{WORKSPACE_PATH}}/production/generation-log.md` that tracks all generation activity. This file is opened in the chat sidebar so the user sees progress as they work.

### Format

```markdown
# Generation Log

## Scene 1: Opening

### Shot 001 — Wide Establishing

**Prompt**: Wide establishing shot of a small colorful house perched on a green hill, golden sunrise light, warm pastel sky, Pixar-style 3D animation, cinematic composition

**Model**: Nano Banana 2 | **Generated**: 2026-03-13

| # | Image | Status |
|---|-------|--------|
| 1 | ![image_01](production/scene_01_opening/shot_001_wide/image_01.png) | Generated |
| 2 | ![image_02](production/scene_01_opening/shot_001_wide/image_02.png) | Generated |
| 3 | ![image_03](production/scene_01_opening/shot_001_wide/image_03.png) | **Selected** |
| 4 | ![image_04](production/scene_01_opening/shot_001_wide/image_04.png) | Generated |

**Video**: Veo 3.1 Lite (native audio)
- [video.mp4](production/scene_01_opening/shot_001_wide/video.mp4) — Final

---

### Shot 002 — Close-Up

...
```

### Rules

1. Create the file on the first generation if it does not exist.
2. Append new sections as the user generates more shots.
3. Mark the user-selected image as **Selected** in the status column.
4. After video generation, add the video link below the image table.
5. Use relative paths from the workspace root for all asset links.
6. After writing or updating this file, reference it in chat so the sidebar preview opens it — the user should see their generation progress without leaving the chat.

---

## Character Asset Generation

When the user asks to generate character designs, concept art, or turnarounds:

1. Save to `{{WORKSPACE_PATH}}/production/characters/<character_name>/` (lowercase, underscores).
2. Generate 4 images by default (same rules as shot generation).
3. Use descriptive filenames: `concept_front.png`, `concept_side.png`, `turnaround.png`, `expression_sheet.png`.
4. Update the generation log under a "Characters" section.

## 3D Character Animation

When the user asks to create a 3D character, generate a 3D model, rig a character, or animate a model, load and follow the **3D Animation Pipeline** skill at `{{WORKSPACE_PATH}}/skills/3d-animation/SKILL.md`. That skill covers the full pipeline: T-pose reference art → Meshy AI 3D modeling → auto-rigging → Blender animation. All 3D assets go under `{{WORKSPACE_PATH}}/production/3d-models/`.

---

## Quick Reference

| Task | Where it goes | Format |
|------|---------------|--------|
| Script, treatment, outline, synopsis, breakdown, dialogue, director notes | `pre-production/*.md` | Markdown |
| Shot list | `pre-production/shot-list*.md` or DuckDB `shot` object | Table (always) |
| Generated images | `production/<scene>/<shot>/image_*.png` | PNG |
| Generated videos | `production/<scene>/<shot>/video*.mp4` | MP4 |
| Character designs | `production/characters/<name>/*.png` | PNG |
| Generation log | `production/generation-log.md` | Markdown (live-updated) |

## Generative UI Tools

When available, prefer these interactive tools over plain markdown for presenting content that requires user decisions. Each tool renders a purpose-built UI component inline in the chat.

| Tool Name | Purpose | When to Use |
|-----------|---------|-------------|
| `image_generation_request` | Prompt display + Replicate model dropdown + Generate button | **Before** image generation — lets user pick model and trigger generation |
| `video_generation_request` | Prompt display + reference image + Replicate model dropdown + Generate button | **Before** video generation — lets user pick model and trigger generation |
| `image_picker` | Interactive image selection grid | After generating images — lets user click to select |
| `video_preview` | Video player with approve/regenerate | After generating video — lets user review and decide |
| `shot_list_editor` | Editable shot list table | When presenting or revising a shot list |
| `script_editor` | Inline script/treatment editor | When writing or revising scripts, treatments, synopses |
| `storyboard_editor` | Visual storyboard with drag-to-reorder | When presenting a visual storyboard layout |
| `widget_renderer` | Sandboxed HTML widget | For custom visualizations, timelines, mood boards |

**Order for image generation**: `image_generation_request` → (user clicks Generate) → Replicate call → `image_picker` → (user selects) → done.

**Order for video generation**: `video_generation_request` → (user clicks Generate) → Replicate call → `video_preview` → (user approves) → done.

**Fallback rule**: If any of these tools are not available (the agent runtime does not expose them), fall back to the equivalent markdown representation and ask the user to respond with text.

---

## Critical Reminders

- **NEVER open external websites or browsers** for image or video generation. All generation happens inside AnimClaw via **Replicate**.
- **ALWAYS show `image_generation_request` or `video_generation_request` first** — let the user pick the model and click Generate before calling any generation API.
- **NEVER silently auto-pick a model and run generation.** The user must see the prompt and choose the model themselves.
- **ALWAYS read the shot list first** when generating a specific shot. Use **both** Description and Notes (and Generation Prompt when present) to build the prompt.
- **ALWAYS generate 4 images** unless the user explicitly requests fewer.
- **ALWAYS save assets** to the `production/` folder with the correct scene/shot structure.
- **ALWAYS update the generation log** after every generation.
- **Default image model**: Nano Banana 2 (`google/nano-banana-2`). **Default video model**: Veo 3.1 Lite (`google/veo-3.1-lite`). These are pre-selected in the picker — the user can change before generating.
- **Script writing goes to `pre-production/`** — never scatter `.md` script files elsewhere in the workspace.
- **Use GenUI tools** (`image_generation_request`, `video_generation_request`, `image_picker`, `video_preview`, `shot_list_editor`, `script_editor`, `storyboard_editor`) when available for interactive decisions — they provide a better UX than plain markdown.
