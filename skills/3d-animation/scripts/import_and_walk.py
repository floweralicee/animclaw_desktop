"""
Walk cycle animation template for rigged character models.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python import_and_walk.py -- \
    --input /path/to/rigged_character.fbx \
    --output /path/to/animated_character.blend

Expects an FBX with a standard humanoid rig (Mixamo / AccuRig / Rigify naming).
Adapt bone names in BONE_MAP if your rig uses different conventions.
"""

import bpy
import sys
import math
import argparse

# ── Configuration ─────────────────────────────────────────────────────────────

TS = 1  # Time scale: 1 = normal, 2 = half speed
WALK_FRAMES = 48  # One full walk cycle
FPS = 24

BONE_MAP = {
    "hips": ["Hips", "mixamorig:Hips", "hips", "pelvis", "Root"],
    "spine": ["Spine", "mixamorig:Spine", "spine"],
    "left_upper_leg": ["LeftUpLeg", "mixamorig:LeftUpLeg", "thigh.L", "upper_leg.L"],
    "right_upper_leg": ["RightUpLeg", "mixamorig:RightUpLeg", "thigh.R", "upper_leg.R"],
    "left_lower_leg": ["LeftLeg", "mixamorig:LeftLeg", "shin.L", "lower_leg.L"],
    "right_lower_leg": ["RightLeg", "mixamorig:RightLeg", "shin.R", "lower_leg.R"],
    "left_upper_arm": ["LeftArm", "mixamorig:LeftArm", "upper_arm.L"],
    "right_upper_arm": ["RightArm", "mixamorig:RightArm", "upper_arm.R"],
    "left_lower_arm": ["LeftForeArm", "mixamorig:LeftForeArm", "forearm.L", "lower_arm.L"],
    "right_lower_arm": ["RightForeArm", "mixamorig:RightForeArm", "forearm.R", "lower_arm.R"],
}


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser(description="Walk cycle animation")
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
    elif ext == "blend":
        with bpy.data.libraries.load(filepath, link=False) as (data_from, data_to):
            data_to.objects = data_from.objects
        for obj in data_to.objects:
            if obj is not None:
                bpy.context.scene.collection.objects.link(obj)
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


def apply_walk_cycle(armature):
    set_rotation_mode(armature)

    hips = resolve_bone(armature, "hips")
    l_upper = resolve_bone(armature, "left_upper_leg")
    r_upper = resolve_bone(armature, "right_upper_leg")
    l_lower = resolve_bone(armature, "left_lower_leg")
    r_lower = resolve_bone(armature, "right_lower_leg")
    l_arm = resolve_bone(armature, "left_upper_arm")
    r_arm = resolve_bone(armature, "right_upper_arm")

    half = WALK_FRAMES // 2

    # Hips vertical bob
    if hips:
        k_loc(hips, 1, 0, 0, 0)
        k_loc(hips, half // 2, 0, 0.02, 0)
        k_loc(hips, half, 0, 0, 0)
        k_loc(hips, half + half // 2, 0, 0.02, 0)
        k_loc(hips, WALK_FRAMES, 0, 0, 0)

    # Left leg: forward stride first half, backward second half
    if l_upper:
        k_rot(l_upper, 1, -30, 0, 0)
        k_rot(l_upper, half, 30, 0, 0)
        k_rot(l_upper, WALK_FRAMES, -30, 0, 0)
    if l_lower:
        k_rot(l_lower, 1, 10, 0, 0)
        k_rot(l_lower, half // 2, 45, 0, 0)
        k_rot(l_lower, half, 10, 0, 0)
        k_rot(l_lower, half + half // 2, 5, 0, 0)
        k_rot(l_lower, WALK_FRAMES, 10, 0, 0)

    # Right leg: opposite phase
    if r_upper:
        k_rot(r_upper, 1, 30, 0, 0)
        k_rot(r_upper, half, -30, 0, 0)
        k_rot(r_upper, WALK_FRAMES, 30, 0, 0)
    if r_lower:
        k_rot(r_lower, 1, 10, 0, 0)
        k_rot(r_lower, half // 2, 5, 0, 0)
        k_rot(r_lower, half, 10, 0, 0)
        k_rot(r_lower, half + half // 2, 45, 0, 0)
        k_rot(r_lower, WALK_FRAMES, 10, 0, 0)

    # Arms swing opposite to legs
    if l_arm:
        k_rot(l_arm, 1, 20, 0, 0)
        k_rot(l_arm, half, -20, 0, 0)
        k_rot(l_arm, WALK_FRAMES, 20, 0, 0)
    if r_arm:
        k_rot(r_arm, 1, -20, 0, 0)
        k_rot(r_arm, half, 20, 0, 0)
        k_rot(r_arm, WALK_FRAMES, -20, 0, 0)


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
    scene.frame_end = WALK_FRAMES * TS
    scene.render.fps = FPS

    apply_walk_cycle(armature)
    make_cyclic(armature)

    bpy.ops.wm.save_as_mainfile(filepath=args.output)
    print(f"Walk cycle saved to {args.output}")


if __name__ == "__main__":
    main()
