"""
Jump animation template for rigged character models.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python import_and_jump.py -- \
    --input /path/to/rigged_character.fbx \
    --output /path/to/animated_character.blend

Expects an FBX with a standard humanoid rig (Mixamo / AccuRig / Rigify naming).
"""

import bpy
import sys
import math
import argparse

TS = 1
JUMP_FRAMES = 48  # 2-second jump at 24fps
FPS = 24
JUMP_HEIGHT = 0.6  # Meters

BONE_MAP = {
    "hips": ["Hips", "mixamorig:Hips", "hips", "pelvis", "Root"],
    "spine": ["Spine", "mixamorig:Spine", "spine"],
    "spine1": ["Spine1", "mixamorig:Spine1", "spine.001"],
    "head": ["Head", "mixamorig:Head", "head"],
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
    parser = argparse.ArgumentParser(description="Jump animation")
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


def apply_jump(armature):
    """
    Jump phases:
      1-8:   Anticipation (crouch)
      8-12:  Launch
      12-24: Airborne (apex at ~18)
      24-32: Descent
      32-40: Landing (absorb)
      40-48: Recovery to idle
    """
    set_rotation_mode(armature)

    hips = resolve_bone(armature, "hips")
    spine = resolve_bone(armature, "spine")
    head = resolve_bone(armature, "head")
    l_upper = resolve_bone(armature, "left_upper_leg")
    r_upper = resolve_bone(armature, "right_upper_leg")
    l_lower = resolve_bone(armature, "left_lower_leg")
    r_lower = resolve_bone(armature, "right_lower_leg")
    l_arm = resolve_bone(armature, "left_upper_arm")
    r_arm = resolve_bone(armature, "right_upper_arm")
    l_forearm = resolve_bone(armature, "left_lower_arm")
    r_forearm = resolve_bone(armature, "right_lower_arm")

    # Hips: crouch → launch → apex → land → recover
    if hips:
        k_loc(hips, 1, 0, 0, 0)                 # Start
        k_loc(hips, 8, 0, -0.15, 0)              # Crouch
        k_loc(hips, 12, 0, 0.1, 0)               # Launch
        k_loc(hips, 18, 0, JUMP_HEIGHT, 0)        # Apex
        k_loc(hips, 24, 0, 0.3, 0)               # Falling
        k_loc(hips, 32, 0, -0.12, 0)             # Impact absorb
        k_loc(hips, 40, 0, -0.05, 0)             # Settling
        k_loc(hips, JUMP_FRAMES, 0, 0, 0)        # Recover

    # Spine: lean forward on crouch, extend on jump, compress on land
    if spine:
        k_rot(spine, 1, 0, 0, 0)
        k_rot(spine, 8, 15, 0, 0)                # Lean forward in crouch
        k_rot(spine, 12, -5, 0, 0)               # Extend on launch
        k_rot(spine, 18, -8, 0, 0)               # Arch at apex
        k_rot(spine, 32, 12, 0, 0)               # Compress on landing
        k_rot(spine, JUMP_FRAMES, 0, 0, 0)

    # Head: tilt to match body, look up at apex
    if head:
        k_rot(head, 1, 0, 0, 0)
        k_rot(head, 8, 10, 0, 0)                 # Look down in crouch
        k_rot(head, 18, -15, 0, 0)               # Look up at apex
        k_rot(head, 32, 8, 0, 0)                 # Compress
        k_rot(head, JUMP_FRAMES, 0, 0, 0)

    # Legs: bend for crouch, extend in air, bend for landing
    for upper, lower in [(l_upper, l_lower), (r_upper, r_lower)]:
        if upper:
            k_rot(upper, 1, 0, 0, 0)
            k_rot(upper, 8, -60, 0, 0)           # Deep bend
            k_rot(upper, 12, -15, 0, 0)          # Extend for launch
            k_rot(upper, 18, 10, 0, 0)           # Legs slightly forward at apex
            k_rot(upper, 32, -50, 0, 0)          # Absorb landing
            k_rot(upper, JUMP_FRAMES, 0, 0, 0)
        if lower:
            k_rot(lower, 1, 0, 0, 0)
            k_rot(lower, 8, 70, 0, 0)            # Knees bent in crouch
            k_rot(lower, 12, 10, 0, 0)           # Extend
            k_rot(lower, 18, -15, 0, 0)          # Tucked at apex
            k_rot(lower, 32, 55, 0, 0)           # Absorb
            k_rot(lower, JUMP_FRAMES, 0, 0, 0)

    # Arms: swing up with jump, come down on landing
    for arm, forearm, sign in [(l_arm, l_forearm, 1), (r_arm, r_forearm, -1)]:
        if arm:
            k_rot(arm, 1, 0, 0, 5 * sign)
            k_rot(arm, 8, 20, 0, 10 * sign)      # Pull back in crouch
            k_rot(arm, 12, -40, 0, 5 * sign)     # Swing up on launch
            k_rot(arm, 18, -60, 0, 15 * sign)    # Arms up at apex
            k_rot(arm, 32, 10, 0, 10 * sign)     # Come down
            k_rot(arm, JUMP_FRAMES, 0, 0, 5 * sign)
        if forearm:
            k_rot(forearm, 1, 0, 0, 0)
            k_rot(forearm, 8, -30, 0, 0)         # Bent in crouch
            k_rot(forearm, 18, -20, 0, 0)        # Slightly bent at apex
            k_rot(forearm, 32, -25, 0, 0)        # Absorb
            k_rot(forearm, JUMP_FRAMES, 0, 0, 0)


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
    scene.frame_end = JUMP_FRAMES * TS
    scene.render.fps = FPS

    apply_jump(armature)

    bpy.ops.wm.save_as_mainfile(filepath=args.output)
    print(f"Jump animation saved to {args.output}")


if __name__ == "__main__":
    main()
