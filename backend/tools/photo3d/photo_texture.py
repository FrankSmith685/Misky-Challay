"""Photo color projection onto an inferred Hunyuan mesh, with estimated backs.

The geometry comes from the actual image-to-3D model. This low-memory texture
path uses the photographed front and an estimated coating palette on unseen
surfaces; it does not claim to reconstruct a photographic view of the back.
"""
import numpy as np
import trimesh
from PIL import Image


def apply_photo_colors(mesh, foreground, resolution=1024, face_limit=60000):
    mesh = mesh.copy()
    mesh.remove_unreferenced_vertices()
    if len(mesh.faces) > face_limit:
        mesh = mesh.simplify_quadric_decimation(face_count=face_limit, aggression=5)
    trimesh.smoothing.filter_taubin(mesh, iterations=3)
    mesh.fix_normals(multibody=True)

    rgba = np.asarray(foreground.convert("RGBA"))
    rows, columns = np.where(rgba[:, :, 3] > 128)
    if not len(rows):
        raise ValueError("La foto no contiene una torta separable del fondo.")
    crop = rgba[rows.min():rows.max() + 1, columns.min():columns.max() + 1]
    height, width = crop.shape[:2]
    samples = crop[int(height * .6):int(height * .83), int(width * .3):int(width * .7)]
    opaque = samples[samples[:, :, 3] > 128, :3]
    if not len(opaque):
        opaque = crop[crop[:, :, 3] > 128, :3]
    coating = np.percentile(opaque, 70, axis=0).astype(np.uint8)
    background = Image.new("RGBA", (width, height), (*coating.tolist(), 255))
    background.alpha_composite(Image.fromarray(crop))
    photo = background.convert("RGB")
    photo.thumbnail((resolution - 32, resolution - 32), Image.Resampling.LANCZOS)
    atlas = Image.new("RGB", (resolution, resolution), tuple(coating.tolist()))
    atlas.paste(photo, (4, 4))
    # A small studio-shaded coating strip gives the unobserved side a visible
    # curve while keeping the original photographed front's lighting.
    shades = 32
    strip = np.empty((16, resolution, 3), dtype=np.uint8)
    for index in range(resolution):
        factor = .76 + .24 * index / max(1, resolution - 1)
        strip[:, index] = (coating * factor).astype(np.uint8)
    atlas.paste(Image.fromarray(strip), (0, resolution - 16))

    triangles = mesh.vertices[mesh.faces]
    vertex_normals = mesh.vertex_normals[mesh.faces]
    bounds, extent = mesh.bounds, mesh.extents
    u = np.clip((triangles[:, :, 0] - bounds[0, 0]) / extent[0], 0, 1)
    v = np.clip(1 - (triangles[:, :, 1] - bounds[0, 1]) / extent[1], 0, 1)
    uv = np.stack(((4 + u * (photo.width - 1)) / resolution,
                   1 - (4 + v * (photo.height - 1)) / resolution), axis=-1)
    normals = mesh.face_normals
    top_decoration = triangles.mean(axis=1)[:, 1] > bounds[0, 1] + extent[1] * .66
    photographed = (normals[:, 2] > .1) | top_decoration
    light = np.array([-.5, .7, .5])
    light /= np.linalg.norm(light)
    shade = np.clip(.5 + normals @ light * .5, 0, 1)
    uv[~photographed, :, 0] = shade[~photographed, None]
    uv[~photographed, :, 1] = 8 / resolution
    material = trimesh.visual.material.PBRMaterial(
        name="Hunyuan cake photo", baseColorTexture=atlas,
        metallicFactor=0, roughnessFactor=1, doubleSided=True,
    )
    return trimesh.Trimesh(
        vertices=triangles.reshape(-1, 3), faces=np.arange(triangles.size // 3).reshape(-1, 3),
        vertex_normals=vertex_normals.reshape(-1, 3),
        visual=trimesh.visual.TextureVisuals(uv=uv.reshape(-1, 2), material=material), process=False,
    )
