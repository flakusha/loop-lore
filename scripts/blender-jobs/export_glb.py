# SPDX-License-Identifier: LGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Loop Lore Contributors
"""Stage `export-glb`: import one mesh file and write one GLB.

Invoked only by the local bridge as:
    blender --background --factory-startup -noaudio --python-exit-code 1 \
        --python export_glb.py -- '{"stage":"export-glb","params":{...}}'

Params:
    input: source mesh path (.glb, .gltf, .obj, .fbx, .blend)
    output: destination .glb path
    decimate_ratio: optional float in (0, 1], applied once to the joined mesh

No network, no addons, no linked bpy: the recipe runs in Blender's own process
and prints one machine-readable result line for the bridge to capture.
"""

import json
import os
import sys

import bpy


def read_payload():
    if "--" not in sys.argv:
        raise ValueError("missing -- payload separator")
    payload = json.loads(sys.argv[sys.argv.index("--") + 1])
    if payload.get("stage") != "export-glb":
        raise ValueError("recipe only handles the export-glb stage")
    return payload.get("params", {})


def require_path(params, key, suffix):
    value = params.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError("params.%s must be a non-empty path" % key)
    if suffix and not value.lower().endswith(suffix):
        raise ValueError("params.%s must end with %s" % (key, suffix))
    return value


def import_mesh(path):
    extension = os.path.splitext(path)[1].lower()
    if extension in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif extension == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif extension == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif extension == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path)
    else:
        raise ValueError("unsupported input extension: " + extension)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def apply_decimation(objects, ratio):
    if ratio is None:
        return
    if not isinstance(ratio, (int, float,)) or isinstance(ratio, bool,):
        raise ValueError("params.decimate_ratio must be a number")
    if not 0 < ratio <= 1:
        raise ValueError("params.decimate_ratio must be in (0, 1]")
    for obj in objects:
        modifier = obj.modifiers.new(name="bridge_decimate", type="DECIMATE",)
        modifier.ratio = ratio
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name,)


def main():
    params = read_payload()
    source = require_path(params, "input", None,)
    target = require_path(params, "output", (".glb",),)
    if not os.path.isfile(source,):
        raise FileNotFoundError(source,)

    bpy.ops.object.select_all(action="SELECT",)
    bpy.ops.object.delete(use_global=False,)
    import_mesh(source,)

    objects = mesh_objects()
    if not objects:
        raise ValueError("input contained no mesh objects")
    apply_decimation(objects, params.get("decimate_ratio",),)

    os.makedirs(os.path.dirname(target,) or ".", exist_ok=True,)
    bpy.ops.export_scene.gltf(filepath=target, export_format="GLB",)
    print("BLENDER_RECIPE=" + json.dumps({
        "stage": "export-glb",
        "version": bpy.app.version_string,
        "meshes": len(objects,),
        "output": target,
    },),)


if __name__ == "__main__":
    main()
