"""
Idle (breathing/sway) animation template for rigged character models.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python import_and_idle.py -- \
    --input /path/to/rigged_character.fbx \
    --output /path/to/animated_character.blend

Expects an FBX with a standard humanoid rig (Mixamo / AccuRig / Rigify naming).
"""

import bpy
import sys
import math
import argparse

TS = 1
IDLE_FRAMES = 72  # 3-second loop at 24fps
FPS = 24

BONE_MAP = {
    "hips": ["Hips", "mixamorig:Hips", "hips", "pelvis", "Root"],
    "spine": ["Spine", "mixamorig:Spine", "spine"],
    "spine1": ["Spine1", "mixamorig:Spine1", "spine.001"],
    "head": ["Head", "mixamorig:Head", "head"],
    "left_upper_arm": ["LeftArm", "mixamorig:LeftArm", "upper_arm.L"],
    "right_upper_arm": ["RightArm", "mixamorig:RightArm", "upper_arm.R"],
    "left_hand": ["LeftHand", "mixamorig:LeftHand", "hand.L"],
    "right_hand": ["RightHand", "mixamorig:RightHand", "hand.R"],
}


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser(description="Idle animation")
    parser.add_argument("--input", required=True, help="Path to rigged FBX/GLB")
    parser.add_argument("--output", required=True, help="Output .blend path")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in bpy.data.collections:
        bpy.data.collections.remove(collection)


def import_model(filepath):
    ext = filepath.lower().rsplit(".", 1)[-1]
    if ext == "fbx":
        bpy.ops.import_scene.fbx(filepath=filepath)
    elif ext in ("glb", "gltf"):
        bpy.ops.import_scene.gltf(filepath=filepath)
    else:
        raise ValueError(f"Unsupported format: {ext}")


def find_armature():
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def resolve_bone(armature, role):
    candidates = BONE_MAP.get(role, [])
    for name in candidates:
        if name in armature.pose.bones:
            return armature.pose.bones[name]
    return None


def set_rotation_mode(armature):
    for pb in armature.pose.bones:
        pb.rotation_mode = "XYZ"


def k_rot(bone, frame, rx, ry, rz):
    bone.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
    bone.keyframe_insert(data_path="rotation_euler", frame=frame * TS)


def k_loc(bone, frame, x, y, z):
    bone.location = (x, y, z)
    bone.keyframe_insert(data_path="location", frame=frame * TS)


def apply_idle(armature):
    set_rotation_mode(armature)

    hips = resolve_bone(armature, "hips")
    spine = resolve_bone(armature, "spine")
    spine1 = resolve_bone(armature, "spine1")
    head = resolve_bone(armature, "head")
    l_arm = resolve_bone(armature, "left_upper_arm")
    r_arm = resolve_bone(armature, "right_upper_arm")

    mid = IDLE_FRAMES // 2

    # Subtle breathing: hips rise/fall
    if hips:
        k_loc(hips, 1, 0, 0, 0)
        k_loc(hips, mid, 0, 0.012, 0)
        k_loc(hips, IDLE_FRAMES, 0, 0, 0)

    # Spine slight forward lean on inhale
    if spine:
        k_rot(spine, 1, 0, 0, 0)
        k_rot(spine, mid, -1.5, 0, 0)
        k_rot(spine, IDLE_FRAMES, 0, 0, 0)

    if spine1:
        k_rot(spine1, 1, 0, 0, 0)
        k_rot(spine1, mid, -1, 0, 0)
        k_rot(spine1, IDLE_FRAMES, 0, 0, 0)

    # Head micro-nod
    if head:
        k_rot(head, 1, 0, 0, 0)
        k_rot(head, mid, 1, 0, 0.5)
        k_rot(head, IDLE_FRAMES, 0, 0, 0)

    # Arms gentle sway
    if l_arm:
        k_rot(l_arm, 1, 0, 0, 2)
        k_rot(l_arm, mid, 0, 0, -1)
        k_rot(l_arm, IDLE_FRAMES, 0, 0, 2)
    if r_arm:
        k_rot(r_arm, 1, 0, 0, -2)
        k_rot(r_arm, mid, 0, 0, 1)
        k_rot(r_arm, IDLE_FRAMES, 0, 0, -2)


def make_cyclic(armature):
    if armature.animation_data and armature.animation_data.action:
        for fc in armature.animation_data.action.fcurves:
            mod = fc.modifiers.new(type="CYCLES")
            mod.mode_before = "REPEAT"
            mod.mode_after = "REPEAT"


def main():
    args = parse_args()
    clear_scene()
    import_model(args.input)

    armature = find_armature()
    if not armature:
        print("ERROR: No armature found in imported model")
        sys.exit(1)

    bpy.context.view_layer.objects.active = armature

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = IDLE_FRAMES * TS
    scene.render.fps = FPS

    apply_idle(armature)
    make_cyclic(armature)

    bpy.ops.wm.save_as_mainfile(filepath=args.output)
    print(f"Idle animation saved to {args.output}")


if __name__ == "__main__":
    main()
