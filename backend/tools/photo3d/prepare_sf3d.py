"""Download gated SF3D weights using the user's locally stored HF login.

Authentication is never logged or included in the browser/API configuration.
"""
import os
from pathlib import Path

cache = Path(__file__).resolve().parents[2] / "tmp" / "photo-3d"
os.environ["HF_HOME"] = str(cache / "huggingface")
os.environ["U2NET_HOME"] = str(cache / "rembg")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_OFFLINE", None)

from huggingface_hub import hf_hub_download

for filename in ("config.yaml", "model.safetensors"):
    result = hf_hub_download(
        "stabilityai/stable-fast-3d", filename,
        revision="f0c9a8ffd62cb1bbc8a7a53c9f87a0be1b6be778",
        local_dir=cache / "models" / "stable-fast-3d",
    )
    print(f"SF3D: {filename}, {Path(result).stat().st_size} bytes", flush=True)

# The complete checkpoint contains the learned DINO and CLIP parameters.
# Only their architecture configuration is needed in addition to that checkpoint.
hf_hub_download("facebook/dinov2-large", "config.json")
print("SF3D weights and image encoder configuration are ready.", flush=True)
