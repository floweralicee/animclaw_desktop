---
name: 3d-animation-pipeline
description: Character-to-animation pipeline — T-pose concept art via Nano Banana, 3D model generation with Meshy AI, auto-rigging (Mixamo / AccuRig / Rigify), and Blender animation with preview rendering.
metadata: { "openclaw": { "inject": false, "always": false, "emoji": "🧊" } }
---

# 3D Animation Pipeline

End-to-end pipeline for turning a character description into an animated 3D model. All generated assets live under `{{WORKSPACE_PATH}}/production/3d-models/`.

**CRITICAL**: Every image generated or downloaded in this pipeline MUST be presented inline using `![label](path)` so it appears on the whiteboard automatically. Never describe an image without showing it.

---

## Phase 1 — T-Pose Reference Art

Generate three T-pose reference images (front, side, back) using **Nano Banana**.

### Prompt Template

For each view, combine the user's character description with:

```
<character description>, T-pose, arms straight out, neutral expression, full body,
plain white background, character sheet reference, <view> view, clean lines,
consistent proportions across views
```

Where `<view>` is one of: `front`, `left side`, `back`.

### Workflow

1. Generate **3 images** (one per view) via Nano Banana.
2. Save to `{{WORKSPACE_PATH}}/production/3d-models/<character_name>/reference/front.png`, `side.png`, `back.png`.
3. Display all 3 images inline — they appear on the whiteboard automatically.
4. **Ask the user**: show the 3 images and ask:
   > Here are the T-pose reference images. Do these look correct for your character? I'll use the front view as the primary input for 3D model generation. Let me know if you'd like to regenerate any angle.

Wait for approval before proceeding to Phase 2.

---

## Phase 2 — 3D Model Generation (Meshy AI)

Convert the approved reference image into a 3D model using the **Meshy AI Image-to-3D API**.

### API Workflow

1. **Create task**: `POST https://api.meshy.ai/openapi/v1/image-to-3d` with the front-view image URL and topology `quad`.
2. **Poll status**: `GET https://api.meshy.ai/openapi/v1/image-to-3d/{task_id}` every 10 seconds until `status` is `SUCCEEDED`.
3. **Download** the `.glb` file from the response `model_urls.glb` field.
4. Save to `{{WORKSPACE_PATH}}/production/3d-models/<character_name>/model/character.glb`.

### Authentication

Include header `Authorization: Bearer <MESHY_API_KEY>`. If not configured, instruct the user:
- Run `npx animclaw bootstrap` to configure keys, OR
- Run `openclaw --profile animclaw config set media.apiKeys.meshy <YOUR_KEY>`

### Preview

After download, render a turntable preview by outputting an HTML artifact with an embedded Three.js viewer:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{margin:0;overflow:hidden;background:#1a1a2e}</style>
</head><body>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.168/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.168/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,100);
camera.position.set(0,1.2,3);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff,0.6));
const dir=new THREE.DirectionalLight(0xffffff,0.8);
dir.position.set(2,4,3);scene.add(dir);
const controls=new OrbitControls(camera,renderer.domElement);
controls.autoRotate=true;controls.autoRotateSpeed=4;
controls.target.set(0,0.8,0);controls.update();
new GLTFLoader().load('MODEL_URL_HERE',g=>{scene.add(g.scene)});
(function loop(){requestAnimationFrame(loop);controls.update();renderer.render(scene,camera)})();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
</script></body></html>
```

Replace `MODEL_URL_HERE` with the workspace asset URL for the `.glb` file. This appears as an interactive 3D preview on the whiteboard.

**Ask the user**: "Here's your 3D model preview. Does it look correct? Approve to proceed to rigging."

---

## Phase 3 — Auto-Rigging

Present rigging options to the user:

> Choose a rigging method:
> 1. **Mixamo** — Adobe's auto-rigger (browser-based, good for humanoid characters)
> 2. **AccuRig** — Reallusion's desktop auto-rigger (if installed locally)
> 3. **Blender Rigify** — Fully local, no external tools needed

### Option A: Mixamo (Browser Automation)

1. Use the browser skill to navigate to `https://www.mixamo.com/`
2. Upload the `.glb` or `.fbx` file.
3. Let Mixamo auto-rig, then download the rigged `.fbx`.
4. Save to `{{WORKSPACE_PATH}}/production/3d-models/<character_name>/rigged/character_rigged.fbx`.

### Option B: AccuRig (Desktop)

1. Export the model as `.fbx` from Blender if needed.
2. Open in AccuRig: `open -a "AccuRig" <model_path>` (macOS).
3. Instruct the user to complete auto-rigging in AccuRig and export `.fbx`.
4. Save the rigged file to the `rigged/` folder.

### Option C: Blender Rigify (Local)

Generate a Blender Python script that:
1. Imports the `.glb` model.
2. Adds a Rigify meta-rig aligned to the mesh.
3. Generates the rig and parents the mesh with automatic weights.
4. Saves to `{{WORKSPACE_PATH}}/production/3d-models/<character_name>/rigged/character_rigged.blend`.

Run: `/Applications/Blender.app/Contents/MacOS/Blender --python <script_path>`

After rigging, render a wireframe overlay screenshot and show it on the whiteboard.

---

## Phase 4 — Blender Animation

### Workflow

1. **Ask the user** which animation they want:
   > Which animation would you like to apply?
   > - **Walk cycle** — looping walk
   > - **Idle** — subtle breathing/sway
   > - **Jump** — jump and land
   > - **Custom** — describe what you want

2. Generate a Blender Python script using the animation templates in `skills/3d-animation/scripts/`. The script should:
   - Import the rigged `.fbx` or `.blend`.
   - Apply keyframe animation matching the chosen type.
   - Set `scene.frame_end` appropriately.
   - Save as `{{WORKSPACE_PATH}}/production/3d-models/<character_name>/animated/character_animated.blend`.

3. Run Blender in background to render a preview:
   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender --background --python <script_path>
   ```

4. Export animated `.fbx`:
   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender --background --python <export_script_path>
   ```

5. Render a short turntable or animation preview image sequence (8-12 frames) and show key frames on the whiteboard.

6. Save final files:
   - `animated/character_animated.blend`
   - `animated/character_animated.fbx`
   - `animated/preview_frame_001.png` through `preview_frame_008.png`

---

## Folder Structure

```
production/3d-models/<character_name>/
  reference/
    front.png, side.png, back.png
  model/
    character.glb
  rigged/
    character_rigged.fbx (or .blend)
  animated/
    character_animated.blend
    character_animated.fbx
    preview_frame_*.png
```

Create directories as needed before writing files. Use lowercase, underscore-separated character names.

---

## Generation Log

After each phase, append an entry to `{{WORKSPACE_PATH}}/production/generation-log.md` under a `## 3D Animation` section:

```markdown
## 3D Animation: <Character Name>

### Phase 1 — Reference Art
**Model**: Nano Banana | **Generated**: <date>
| View | Image | Status |
|------|-------|--------|
| Front | ![front](production/3d-models/<name>/reference/front.png) | Generated |
| Side | ![side](production/3d-models/<name>/reference/side.png) | Generated |
| Back | ![back](production/3d-models/<name>/reference/back.png) | Generated |

### Phase 2 — 3D Model
**Service**: Meshy AI | **Format**: GLB
- [character.glb](production/3d-models/<name>/model/character.glb)

### Phase 3 — Rigging
**Method**: <chosen method>
- [character_rigged.fbx](production/3d-models/<name>/rigged/character_rigged.fbx)

### Phase 4 — Animation
**Type**: <animation type> | **Frames**: <count>
- [character_animated.blend](production/3d-models/<name>/animated/character_animated.blend)
- [character_animated.fbx](production/3d-models/<name>/animated/character_animated.fbx)
```

---

## Critical Reminders

- **ALWAYS show images inline** — every generated or downloaded image must use `![label](url)` so it appears on the whiteboard.
- **ALWAYS ask the user** before proceeding between phases — show the visual result and wait for approval.
- **NEVER open external websites** for image generation. Nano Banana runs via API inside AnimClaw.
- **Mixamo and AccuRig** are exceptions where browser/desktop interaction is needed for rigging.
- **ALWAYS update the generation log** after completing each phase.
- **Use Blender CLI** (`--background --python`) for all Blender operations — no manual UI.
