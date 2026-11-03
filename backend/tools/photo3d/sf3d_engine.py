"""Official SF3D reconstruction, adapted for a 6 GB Pascal GPU.

Full precision weights move between CPU/GPU one component at a time. Attention
and density queries are chunked, avoiding unsupported BF16 on Pascal.
"""
import gc
import logging
import os
import sys
from pathlib import Path

import torch

CACHE = Path(__file__).resolve().parents[2] / "tmp" / "photo-3d"
REPOSITORY = CACHE / "stable-fast-3d"
WEIGHTS = CACHE / "models" / "stable-fast-3d"
logger = logging.getLogger("photo3d.sf3d")


def load_checkpoint(model, filename, model_name="SF3D"):
    """Strictly validate all keys/shapes, then copy one tensor at a time.

    SF3D registers some modulation weights through two module paths. Safetensors
    stores each shared parameter once; validate those aliases by storage identity.
    Loading the whole state dictionary at once duplicates 4 GB on Windows.
    """
    from safetensors import safe_open
    targets = model.state_dict()
    def identity(tensor):
        return (tensor.untyped_storage().data_ptr(), tensor.storage_offset(), tuple(tensor.shape), tensor.dtype)
    with safe_open(str(filename), framework="pt", device="cpu") as checkpoint:
        keys = set(checkpoint.keys())
        unexpected = keys - targets.keys()
        loaded_storage = {identity(targets[name]) for name in keys if name in targets}
        missing = {name for name in targets.keys() - keys if identity(targets[name]) not in loaded_storage}
        if unexpected or missing:
            raise RuntimeError(f"Checkpoint {model_name} incompatible: {len(missing)} claves faltantes, {len(unexpected)} inesperadas")
        for name in sorted(keys):
            if tuple(checkpoint.get_slice(name).get_shape()) != tuple(targets[name].shape):
                raise RuntimeError(f"Forma de tensor {model_name} incompatible: {name}")
        with torch.no_grad():
            for name in sorted(keys):
                targets[name].copy_(checkpoint.get_tensor(name))


def offload_component(module, device):
    """Keep full precision parameters, with only the current encoder in VRAM."""
    original = module.forward
    def forward(*args, **kwargs):
        module.to(device)
        try:
            return original(*args, **kwargs)
        finally:
            module.to("cpu")
            torch.cuda.empty_cache()
    module.forward = forward


def load_engine(device_option):
    sys.path.insert(0, str(REPOSITORY))
    from sf3d_compat import install
    install()
    from omegaconf import OmegaConf
    from sf3d.system import SF3D
    from sf3d.models.mesh import Mesh
    from sf3d.models.utils import scale_tensor
    from sf3d.models.tokenizers.dinov2 import Dinov2Model
    import open_clip
    import rembg

    device = "cuda:0" if device_option != "cpu" and torch.cuda.is_available() else "cpu"
    if device_option == "cuda" and device == "cpu":
        raise RuntimeError("La GPU CUDA no está disponible para SF3D.")
    if device == "cpu":
        os.environ["SF3D_USE_CPU"] = "1"
    torch.set_num_threads(min(4, os.cpu_count() or 1))

    class LocalSF3D(SF3D):
        @property
        def device(self):
            # The first encoder rests on CPU between forwards; it must not
            # determine the device of the image and conditioning tensors.
            return torch.device(device)

        def triplane_to_meshes(self, triplanes):
            meshes = []
            for triplane in triplanes:
                points = scale_tensor(self.isosurface_helper.grid_vertices.to(triplanes.device), self.isosurface_helper.points_range, self.bbox)
                densities, offsets = [], []
                for chunk in points.split(8192):
                    features = self.query_triplane(chunk, triplane)
                    # Geometry is evaluated in float32 for the exponential SDF.
                    decoded = self.decoder(features, include=["vertex_offset", "density"])
                    densities.append(decoded["density"].float())
                    offsets.append(decoded["vertex_offset"].float())
                sdf = torch.cat(densities, dim=-2).reshape(-1, 1) - self.cfg.isosurface_threshold
                deform = torch.cat(offsets, dim=-2).reshape(-1, 3)
                mesh = self.isosurface_helper(sdf, deform)
                mesh.v_pos = scale_tensor(mesh.v_pos, self.isosurface_helper.points_range, self.bbox)
                meshes.append(mesh)
            if getattr(self, "progress", None):
                self.progress("texture")
            return meshes

    # Avoid downloading duplicate encoder weights: SF3D's checkpoint includes
    # these exact parameters. Restore both factory methods even on load failure.
    original_dino = Dinov2Model.__dict__.get("from_pretrained")
    original_clip = open_clip.create_model_and_transforms
    def local_dino(cls, name, *args, **kwargs):
        from transformers import Dinov2Config
        return cls(Dinov2Config.from_pretrained(name, local_files_only=True))
    def local_clip(name, *args, **kwargs):
        kwargs["pretrained"] = None
        return original_clip(name, *args, **kwargs)
    Dinov2Model.from_pretrained = classmethod(local_dino)
    open_clip.create_model_and_transforms = local_clip
    try:
        logger.info("Cargando checkpoint completo de Stable Fast 3D en %s", device)
        from transformers.modeling_utils import no_init_weights
        # Every parameter is overwritten by the strict checkpoint load.
        # Skip random initialization; stream tensors instead of duplicating the checkpoint.
        with no_init_weights():
            model = LocalSF3D(OmegaConf.load(WEIGHTS / "config.yaml"))
        logger.info("Arquitectura preparada; leyendo pesos SF3D")
        load_checkpoint(model, WEIGHTS / "model.safetensors")
        logger.info("Checkpoint SF3D verificado")
    finally:
        if original_dino is None:
            del Dinov2Model.from_pretrained
        else:
            Dinov2Model.from_pretrained = original_dino
        open_clip.create_model_and_transforms = original_clip
    gc.collect()
    model.eval().requires_grad_(False)
    # Keep learned weights in float32 and offload encoders after each forward.
    if "cuda" in device:
        model.camera_embedder.to(device)
        model.tokenizer.to(device)
        model.decoder.to(device)
        model.isosurface_helper.to(device)
        model.bbox = model.bbox.to(device)
        for component in (model.image_tokenizer, model.backbone, model.post_processor,
                          model.image_estimator, model.global_estimator):
            if component is not None:
                offload_component(component, device)
    else:
        model.to(device)
    logger.info("SF3D cargado en %s", device)
    session = rembg.new_session("u2netp", providers=["CPUExecutionProvider"])
    return model, device, session


def reconstruct(engine, image, texture_resolution, progress):
    model, device, session = engine
    from sf3d.utils import remove_background, resize_foreground
    progress("background")
    image = resize_foreground(remove_background(image.convert("RGBA"), session), 0.85)
    progress("shape")
    model.progress = progress
    # Bound SDPA's fallback attention matrix on a GPU without FlashAttention.
    # Splitting independent query rows preserves the full precision operation.
    import torch.nn.functional as functional
    original_attention = functional.scaled_dot_product_attention
    def bounded_attention(query, key, value, *args, **kwargs):
        mask = kwargs.get("attn_mask", args[0] if args else None)
        causal = kwargs.get("is_causal", args[2] if len(args) > 2 else False)
        if query.shape[-2] > 256 and mask is None and not causal:
            return torch.cat([original_attention(chunk, key, value, *args, **kwargs)
                              for chunk in query.split(256, dim=-2)], dim=-2)
        return original_attention(query, key, value, *args, **kwargs)
    functional.scaled_dot_product_attention = bounded_attention
    try:
        with torch.inference_mode():
            mesh, _ = model.run_image(image, bake_resolution=texture_resolution, remesh="none")
    finally:
        functional.scaled_dot_product_attention = original_attention
    mesh.visual.material.name = "SF3D cake material"
    return mesh
