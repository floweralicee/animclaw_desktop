"""
Render preview frames from a .blend file (turntable or animation frames).

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python render_preview.py -- \
    --input /path/to/animated_character.blend \
    --output-dir /path/to/preview/ \
    --mode turntable \
    --frames 8

Modes:
  turntable  - Orbits camera around the model, renders N frames (default)
  animation  - Renders evenly-spaced frames from the animation timeline
"""

import bpy
import sys
import os
import math
import argparse


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser(description="Render preview frames")
    parser.add_argument("--input", required=True, help="Path to .blend file")
    parser.add_argument("--output-dir", required=True, help="Output directory for frames")
    parser.add_argument("--mode", choices=["turntable", "animation"], default="turntable")
    parser.add_argument("--frames", type=int, default=8, help="Number of frames to render")
    parser.add_argument("--resolution", type=int, default=512, help="Render resolution (square)")
    return parser.parse_args(argv)


def setup_render(resolution):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True


def find_model_center():
    """Find the bounding box center of all mesh objects."""
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ bpy.mathutils.Vector(corner) if hasattr(bpy, "mathutils") else obj.matrix_world @ __import__("mathutils").Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], world[i])
                maxs[i] = max(maxs[i], world[i])
    if mins[0] == float("inf"):
        return (0, 0, 0), 2.0
    center = tuple((mins[i] + maxs[i]) / 2 for i in range(3))
    size = max(maxs[i] - mins[i] for i in range(3))
    return center, max(size, 0.5)


def ensure_camera():
    cam = None
    for obj in bpy.data.objects:
        if obj.type == "CAMERA":
            cam = obj
            break
    if not cam:
        cam_data = bpy.data.cameras.new("PreviewCamera")
        cam = bpy.data.objects.new("PreviewCamera", cam_data)
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def ensure_light():
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            return
    light_data = bpy.data.lights.new("PreviewLight", "SUN")
    light_data.energy = 3.0
    light = bpy.data.objects.new("PreviewLight", light_data)
    light.location = (3, -3, 5)
    bpy.context.scene.collection.objects.link(light)


def render_turntable(output_dir, num_frames, resolution):
    setup_render(resolution)
    ensure_light()
    camera = ensure_camera()
    center, size = find_model_center()
    radius = size * 2.0

    for i in range(num_frames):
        angle = (2 * math.pi * i) / num_frames
        camera.location = (
            center[0] + radius * math.sin(angle),
            center[1] - radius * math.cos(angle),
            center[2] + size * 0.4,
        )
        direction = tuple(center[j] - camera.location[j] for j in range(3))
        camera.rotation_euler = (
            math.atan2(math.sqrt(direction[0] ** 2 + direction[1] ** 2), -direction[2]) - math.pi / 2,
            0,
            math.atan2(direction[0], -direction[1]),
        )

        filepath = os.path.join(output_dir, f"preview_frame_{i + 1:03d}.png")
        bpy.context.scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)
        print(f"Rendered {filepath}")


def render_animation_frames(output_dir, num_frames, resolution):
    setup_render(resolution)
    ensure_light()
    ensure_camera()

    scene = bpy.context.scene
    total = scene.frame_end - scene.frame_start + 1
    step = max(1, total // num_frames)

    for i in range(num_frames):
        frame = scene.frame_start + i * step
        if frame > scene.frame_end:
            frame = scene.frame_end
        scene.frame_set(frame)

        filepath = os.path.join(output_dir, f"preview_frame_{i + 1:03d}.png")
        scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)
        print(f"Rendered frame {frame} -> {filepath}")


def main():
    args = parse_args()

    bpy.ops.wm.open_mainfile(filepath=args.input)
    os.makedirs(args.output_dir, exist_ok=True)

    if args.mode == "turntable":
        render_turntable(args.output_dir, args.frames, args.resolution)
    else:
        render_animation_frames(args.output_dir, args.frames, args.resolution)

    print(f"Preview complete: {args.frames} frames in {args.output_dir}")


if __name__ == "__main__":
    main()
