"""SF3D's texture/UV interfaces backed by xatlas and ModernGL on Windows.

Only UV packing and barycentric rasterization are replaced. The learned SF3D
geometry, colors, normal maps and material estimator remain the official model.
No CUDA compiler is needed; no image is projected onto a stock cake.
"""
import subprocess
import sys
import tempfile
import types
from pathlib import Path

import moderngl
import numpy as np
import torch


class Unwrapper:
    def __call__(self, positions, normals, faces, island_padding=0.02):
        cache = Path(__file__).resolve().parents[2] / "tmp" / "photo-3d"
        with tempfile.TemporaryDirectory(prefix="sf3d-uv-", dir=cache) as folder:
            source, target = Path(folder) / "mesh.npz", Path(folder) / "atlas.npz"
            np.savez(source, vertices=positions.detach().float().cpu().numpy(), faces=faces.cpu().numpy())
            subprocess.run(
                [sys.executable, str(Path(__file__).with_name("uv_atlas.py")), str(source), str(target), "1024", "4"],
                check=True, timeout=240, capture_output=True,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            with np.load(target, allow_pickle=False) as atlas:
                uv = torch.from_numpy(atlas["uvs"].copy()).to(positions.device)
                indices = torch.from_numpy(atlas["indices"].astype(np.int64)).to(faces.device)
        return uv, indices


class TextureBaker(torch.nn.Module):
    def rasterize(self, uv, face_indices, bake_resolution):
        # Each triangle carries its original vertex barycentrics and face ID.
        # OpenGL reads rows from the bottom; flip them to match SF3D's image UVs.
        triangles = uv.detach().float().cpu().numpy()[face_indices.cpu().numpy()].reshape(-1, 2)
        context = moderngl.create_standalone_context(require=330)
        try:
            program = context.program(
                vertex_shader="""#version 330
                    in vec2 in_uv;
                    out vec3 bary;
                    flat out int face_id;
                    void main() {
                        gl_Position = vec4(in_uv * 2.0 - 1.0, 0.0, 1.0);
                        int corner = gl_VertexID % 3;
                        bary = vec3(corner == 0, corner == 1, corner == 2);
                        face_id = gl_VertexID / 3;
                    }
                """,
                fragment_shader="""#version 330
                    in vec3 bary;
                    flat in int face_id;
                    out vec4 result;
                    void main() { result = vec4(bary, float(face_id)); }
                """,
            )
            buffer = context.buffer(np.ascontiguousarray(triangles, dtype=np.float32).tobytes())
            vao = context.simple_vertex_array(program, buffer, "in_uv")
            target = context.simple_framebuffer((bake_resolution, bake_resolution), components=4, dtype="f4")
            target.use()
            target.clear(0, 0, 0, -1)
            context.disable(moderngl.DEPTH_TEST | moderngl.CULL_FACE | moderngl.BLEND)
            vao.render(mode=moderngl.TRIANGLES)
            pixels = np.frombuffer(target.read(components=4, dtype="f4"), dtype=np.float32)
            pixels = pixels.reshape(bake_resolution, bake_resolution, 4)[::-1].copy()
            return torch.from_numpy(pixels).to(uv.device)
        finally:
            context.release()

    def get_mask(self, raster):
        return raster[..., 3] >= 0

    def interpolate(self, attributes, raster, face_indices):
        mask = self.get_mask(raster)
        output = torch.zeros((*raster.shape[:2], attributes.shape[-1]), device=attributes.device, dtype=attributes.dtype)
        covered = raster[mask]
        triangle_ids = covered[:, 3].long()
        corners = attributes[face_indices[triangle_ids].long()]
        output[mask] = (corners * covered[:, :3].to(attributes.dtype).unsqueeze(-1)).sum(dim=1)
        return output


def install():
    for name, exported, implementation in (
        ("texture_baker", "TextureBaker", TextureBaker),
        ("uv_unwrapper", "Unwrapper", Unwrapper),
    ):
        module = types.ModuleType(name)
        setattr(module, exported, implementation)
        sys.modules[name] = module
