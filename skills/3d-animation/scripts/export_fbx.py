"""
Export a .blend file to .fbx with settings compatible with Mixamo, AccuRig, and Maya.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python export_fbx.py -- \
    --input /path/to/animated_character.blend \
    --output /path/to/animated_character.fbx
"""

import bpy
import sys
import argparse


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser(description="Export .blend to .fbx")
    parser.add_argument("--input", required=True, help="Path to .blend file")
    parser.add_argument("--output", required=True, help="Output .fbx path")
    return parser.parse_args(argv)


def main():
    args = parse_args()

    bpy.ops.wm.open_mainfile(filepath=args.input)

    bpy.ops.export_scene.fbx(
        filepath=args.output,
        axis_forward="-Z",
        axis_up="Y",
        bake_space_transform=True,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_step=1,
        bake_anim_simplify_factor=0.0,
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
    )
    print(f"Exported FBX to {args.output}")


if __name__ == "__main__":
    main()
