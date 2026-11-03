"""Download the pinned public Hunyuan Mini Turbo inference checkpoint."""
import os
from pathlib import Path

cache = Path(__file__).resolve().parents[2] / "tmp" / "photo-3d"
os.environ["HF_HOME"] = str(cache / "huggingface")
os.environ["U2NET_HOME"] = str(cache / "rembg")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_OFFLINE", None)
from huggingface_hub import hf_hub_download

for name in ("config.yaml", "model.fp16.safetensors"):
    filename = "hunyuan3d-dit-v2-mini-turbo/" + name
    file = hf_hub_download(
        "tencent/Hunyuan3D-2mini", filename,
        revision="f90a0f7df7d5e6f71109cf333f6a95a0ae3194a6",
        local_dir=cache / "models" / "Hunyuan3D-2mini",
    )
    print(f"Hunyuan Mini: {name}, {Path(file).stat().st_size} bytes", flush=True)
import rembg
rembg.new_session("u2netp", providers=["CPUExecutionProvider"])
print("Hunyuan Mini weights and foreground model ready.", flush=True)
