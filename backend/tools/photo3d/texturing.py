"""TripoSR's MIT-licensed UV atlas/baker, with chunked CUDA color queries.

https://github.com/VAST-AI-Research/TripoSR/blob/main/tsr/bake_texture.py
The official positions_to_colors path queries CPU positions against a CUDA scene.
Keep its atlas/rasterizer and move only covered texels to the model device.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import moderngl
import torch
import trimesh
from PIL import Image
from tsr.bake_texture import rasterize_position_atlas


def texture_mesh(mesh, model, scene, resolution):
    padding = round(max(2, resolution / 256))
    # xatlas holds the Python GIL while unwrapping complex meshes. Run that
    # official step separately so /health and progress polling stay responsive.
    cache = Path(__file__).resolve().parents[2] / "tmp" / "photo-3d"
    with tempfile.TemporaryDirectory(prefix="uv-", dir=cache) as folder:
        source, destination = Path(folder) / "mesh.npz", Path(folder) / "atlas.npz"
        np.savez(source, vertices=mesh.vertices, faces=mesh.faces)
        subprocess.run(
            [sys.executable, str(Path(__file__).with_name("uv_atlas.py")), str(source), str(destination), str(resolution), str(padding)],
            check=True, timeout=240, capture_output=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        with np.load(destination, allow_pickle=False) as result:
            atlas = {key: result[key].copy() for key in result.files}
    positions = rasterize_position_atlas(
        mesh, atlas["vmapping"], atlas["indices"], atlas["uvs"], resolution, padding
    ).reshape(-1, 4)
    moderngl.get_context().release()
    covered = np.flatnonzero(positions[:, 3] > 0)
    # White padding avoids dark seams when a phone samples mipmaps at UV borders.
    colors = np.full((resolution * resolution, 3), 255, dtype=np.uint8)
    with torch.inference_mode():
        for start in range(0, len(covered), 8192):
            indices = covered[start:start + 8192]
            points = torch.from_numpy(positions[indices, :3].copy()).to(scene.device)
            sampled = model.renderer.query_triplane(model.decoder, points, scene)["color"]
            colors[indices] = (sampled.clamp(0, 1).cpu().numpy() * 255).astype(np.uint8)
    texture = Image.fromarray(colors.reshape(resolution, resolution, 3)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    material = trimesh.visual.material.PBRMaterial(
        name="TripoSR cake texture", baseColorTexture=texture,
        metallicFactor=0.0, roughnessFactor=1.0,
    )
    return trimesh.Trimesh(
        vertices=mesh.vertices[atlas["vmapping"]], faces=atlas["indices"],
        vertex_normals=mesh.vertex_normals[atlas["vmapping"]],
        visual=trimesh.visual.TextureVisuals(uv=atlas["uvs"], material=material),
        process=False,
    )
