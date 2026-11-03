"""Image-conditioned Hunyuan3D Mini Turbo shape + low-memory photo colors.

Tencent code/weights retain their Community License (LICENSE.Hunyuan).
The optional paint diffusion model needs more memory than this GPU. Instead,
photo_texture projects the observed front and estimates the hidden coating.
"""
import gc
import logging
import os
import sys
from pathlib import Path

import torch

CACHE = Path(__file__).resolve().parents[2] / "tmp" / "photo-3d"
REPOSITORY = CACHE / "Hunyuan3D-2"
WEIGHTS = CACHE / "models/Hunyuan3D-2mini/hunyuan3d-dit-v2-mini-turbo"
logger = logging.getLogger("photo3d.hunyuan")


def load_engine(device_option):
    sys.path.insert(0, str(REPOSITORY))
    import yaml
    import rembg
    from transformers.modeling_utils import no_init_weights
    from hy3dgen.shapegen.pipelines import instantiate_from_config, Hunyuan3DDiTFlowMatchingPipeline
    from sf3d_engine import load_checkpoint

    device = "cuda:0" if device_option != "cpu" and torch.cuda.is_available() else "cpu"
    if device_option == "cuda" and device == "cpu":
        raise RuntimeError("La GPU CUDA no está disponible para Hunyuan Mini.")
    dtype = torch.float16 if "cuda" in device else torch.float32
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    config = yaml.safe_load((WEIGHTS / "config.yaml").read_text())
    logger.info("Cargando Hunyuan Mini Turbo en %s", device)
    previous_dtype = torch.get_default_dtype()
    torch.set_default_dtype(dtype)
    try:
        with no_init_weights():
            components = torch.nn.Module()
            for name in ("model", "vae", "conditioner"):
                components.add_module(name, instantiate_from_config(config[name]))
    finally:
        torch.set_default_dtype(previous_dtype)
    # The released inference checkpoint excludes these training-only modules.
    del components.vae.encoder
    del components.vae.pre_kl
    load_checkpoint(components, WEIGHTS / "model.fp16.safetensors", model_name="Hunyuan Mini")
    components.eval().requires_grad_(False)
    gc.collect()
    pipeline = Hunyuan3DDiTFlowMatchingPipeline(
        model=components.model, vae=components.vae, conditioner=components.conditioner,
        scheduler=instantiate_from_config(config["scheduler"]),
        image_processor=instantiate_from_config(config["image_processor"]), device="cpu", dtype=dtype,
    )
    pipeline.device = torch.device(device)
    if "cuda" in device:
        original_conditioner = pipeline.conditioner.forward
        def conditioning(*args, **kwargs):
            pipeline.conditioner.to(device)
            try:
                return original_conditioner(*args, **kwargs)
            finally:
                pipeline.conditioner.to("cpu")
                torch.cuda.empty_cache()
        pipeline.conditioner.forward = conditioning
        original_model = pipeline.model.forward
        def sampling(*args, **kwargs):
            pipeline.model.to(device)
            return original_model(*args, **kwargs)
        pipeline.model.forward = sampling
        original_vae = pipeline.vae.forward
        def decoding(*args, **kwargs):
            pipeline.model.to("cpu")
            torch.cuda.empty_cache()
            pipeline.vae.to(device)
            return original_vae(*args, **kwargs)
        pipeline.vae.forward = decoding
    session = rembg.new_session("u2netp", providers=["CPUExecutionProvider"])
    logger.info("Hunyuan Mini preparado; pesos verificados")
    return pipeline, device, session


def reconstruct(engine, image, texture_resolution, progress, resolution=192, steps=8):
    import rembg
    import torch.nn.functional as functional
    from photo_texture import apply_photo_colors
    pipeline, device, session = engine
    progress("background")
    foreground = rembg.remove(image.convert("RGBA"), session=session)
    progress("shape")
    original_attention = functional.scaled_dot_product_attention
    def bounded_attention(query, key, value, *args, **kwargs):
        mask = kwargs.get("attn_mask", args[0] if args else None)
        causal = kwargs.get("is_causal", args[2] if len(args) > 2 else False)
        if query.shape[-2] > 128 and mask is None and not causal:
            return torch.cat([original_attention(chunk, key, value, *args, **kwargs)
                              for chunk in query.split(128, dim=-2)], dim=-2)
        return original_attention(query, key, value, *args, **kwargs)
    functional.scaled_dot_product_attention = bounded_attention
    try:
        generator = torch.Generator(device=device).manual_seed(12345)
        mesh = pipeline(
            image=foreground, num_inference_steps=steps, guidance_scale=5.0,
            octree_resolution=resolution, num_chunks=2048, mc_algo="mc",
            generator=generator, enable_pbar=False,
            callback=lambda index, *_: logger.info("Generación de forma: paso %s/%s", index + 1, steps),
            callback_steps=1,
        )[0]
    finally:
        functional.scaled_dot_product_attention = original_attention
        # Keep the next request's image encoder from competing with the decoder
        # left by this request. Also release VRAM if generation failed.
        if "cuda" in device:
            for module in (pipeline.conditioner, pipeline.model, pipeline.vae):
                module.to("cpu")
            torch.cuda.empty_cache()
    if mesh is None or not len(mesh.vertices):
        raise ValueError("La foto no produjo una forma de torta válida.")
    progress("texture")
    return apply_photo_colors(mesh, foreground, texture_resolution)
