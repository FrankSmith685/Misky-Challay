"""Download the public TripoSR weights into the project, without an API account."""
import json
import os
from pathlib import Path

cache = Path(__file__).resolve().parents[2] / "tmp" / "photo-3d"
os.environ["HF_HOME"] = str(cache / "huggingface")
os.environ["U2NET_HOME"] = str(cache / "rembg")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

from huggingface_hub import hf_hub_download

for filename in ("config.yaml", "model.ckpt"):
    result = hf_hub_download("stabilityai/TripoSR", filename, local_dir=cache / "models" / "TripoSR")
    print(json.dumps({"downloaded": filename, "bytes": Path(result).stat().st_size}), flush=True)

hf_hub_download("facebook/dino-vitb16", "config.json")
import rembg
import torch

rembg.new_session("u2netp", providers=["CPUExecutionProvider"])
print(json.dumps({"ready": True, "torch": torch.__version__, "cuda": torch.cuda.is_available(), "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}), flush=True)
