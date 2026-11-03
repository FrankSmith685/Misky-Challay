"""Loopback-only TripoSR / Stable Fast 3D / Hunyuan Mini adapter.

TripoSR code and weights: https://github.com/VAST-AI-Research/TripoSR (MIT).
The optional CUDA marching-cubes extension is replaced by scikit-image on CPU
to avoid requiring a compiler/CUDA toolkit on the customer's Windows machine.
"""
from __future__ import annotations

import argparse
import base64
import gc
import io
import json
import logging
import os
import re
import socket
import sys
import threading
import time
import types
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
CACHE = BACKEND / "tmp" / "photo-3d"
REPOSITORY = CACHE / "TripoSR"
WEIGHTS = CACHE / "models" / "TripoSR"
JOBS = CACHE / "jobs"
os.environ.setdefault("HF_HOME", str(CACHE / "huggingface"))
os.environ.setdefault("U2NET_HOME", str(CACHE / "rembg"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("NUMBA_CACHE_DIR", str(CACHE / "numba-cache"))
sys.path.insert(0, str(REPOSITORY))

logger = logging.getLogger("photo3d")
lock = threading.RLock()
tasks: dict[str, dict] = {}
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="photo3d")
engine = None
background_session = None
arguments = None
UUID = re.compile(r"^[a-f0-9-]{36}$")


def save(task: dict) -> None:
    with lock:
        tasks[task["uid"]] = task.copy()
        temporary = JOBS / f"{task['uid']}.{uuid.uuid4().hex}.tmp"
        temporary.write_text(json.dumps(task), encoding="utf-8")
        temporary.replace(JOBS / f"{task['uid']}.json")


def load(uid: str) -> dict | None:
    if not UUID.fullmatch(uid):
        return None
    with lock:
        if uid in tasks:
            return tasks[uid].copy()
    try:
        result = json.loads((JOBS / f"{uid}.json").read_text(encoding="utf-8"))
        # A worker process restart cannot resume a half-computed scene code.
        if result["status"] not in ("completed", "error"):
            result.update(status="error", message="El servicio local se reinició. Vuelve a convertir la foto.")
        return result
    except (OSError, ValueError, KeyError):
        return None


def get_engine():
    global engine, background_session
    if engine is not None:
        return engine
    if arguments.engine == "hunyuanmini":
        from hunyuan_engine import load_engine
        engine = load_engine(arguments.device)
        return engine
    if arguments.engine == "sf3d":
        from sf3d_engine import load_engine
        engine = load_engine(arguments.device)
        return engine
    import numpy as np
    import torch
    from skimage.measure import marching_cubes

    def cpu_marching_cubes(volume, level):
        array = np.ascontiguousarray(volume.detach().float().cpu().numpy())
        vertices, faces, _, _ = marching_cubes(array, level, gradient_direction="ascent")
        # Match torchmcubes' xyz convention; TripoSR performs the inverse swap.
        return torch.from_numpy(vertices[:, [2, 1, 0]].copy()), torch.from_numpy(faces.copy().astype(np.int64))

    shim = types.ModuleType("torchmcubes")
    shim.marching_cubes = cpu_marching_cubes
    sys.modules["torchmcubes"] = shim
    from omegaconf import OmegaConf
    from tsr.system import TSR
    import rembg

    device = "cuda:0" if arguments.device != "cpu" and torch.cuda.is_available() else "cpu"
    if arguments.device == "cuda" and device == "cpu":
        raise RuntimeError("PyTorch no pudo utilizar la GPU. Revisa la instalación CUDA del entorno local.")
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    logger.info("Cargando TripoSR en %s", device)
    configuration = OmegaConf.load(WEIGHTS / "config.yaml")
    OmegaConf.resolve(configuration)
    model = TSR(configuration)
    # mmap/assign avoids a second full in-memory copy of the checkpoint on a 16 GB PC.
    state = torch.load(WEIGHTS / "model.ckpt", map_location="cpu", weights_only=True, mmap=True)
    model.load_state_dict(state, assign=True)
    del state
    gc.collect()
    model.renderer.set_chunk_size(arguments.chunk_size)
    model.to(device).eval()
    background_session = rembg.new_session("u2netp", providers=["CPUExecutionProvider"])
    engine = (model, device)
    return engine


def generate(uid: str, image_bytes: bytes) -> None:
    task = load(uid)
    if task is None:
        return
    try:
        import numpy as np
        import torch
        from PIL import Image

        task.update(status="processing", stage="loading")
        save(task)
        loaded_engine = get_engine()
        started = time.monotonic()
        if arguments.engine in ("sf3d", "hunyuanmini"):
            if arguments.engine == "sf3d":
                from sf3d_engine import reconstruct
            else:
                from hunyuan_engine import reconstruct
            def progress(stage):
                task.update(stage=stage, status="texturing" if stage == "texture" else "processing")
                save(task)
            with Image.open(io.BytesIO(image_bytes)) as uploaded:
                extra = {"resolution": arguments.resolution, "steps": arguments.steps} if arguments.engine == "hunyuanmini" else {}
                mesh = reconstruct(loaded_engine, uploaded, arguments.texture_resolution, progress, **extra)
            model_bytes = mesh.export(file_type="glb", include_normals=True)
            finish(task, mesh, model_bytes, started)
            return
        from tsr.utils import remove_background, resize_foreground, to_gradio_3d_orientation
        model, device = loaded_engine
        task["stage"] = "background"
        save(task)
        with Image.open(io.BytesIO(image_bytes)) as uploaded:
            image = uploaded.convert("RGB")
        image = resize_foreground(remove_background(image, background_session), 0.85)
        pixels = np.asarray(image).astype(np.float32) / 255.0
        image = Image.fromarray(((pixels[:, :, :3] * pixels[:, :, 3:4] + (1 - pixels[:, :, 3:4]) * 0.5) * 255).astype(np.uint8))
        task["stage"] = "shape"
        save(task)
        with torch.inference_mode():
            scene = model([image], device=device)
            task.update(status="texturing", stage="mesh")
            save(task)
            mesh = model.extract_mesh(scene, arguments.texture_resolution == 0, resolution=arguments.resolution)[0]
        if not len(mesh.vertices) or not len(mesh.faces):
            raise ValueError("La foto no produjo una superficie. Prueba una imagen con la torta completa y el fondo despejado.")
        mesh.remove_unreferenced_vertices()
        mesh.fix_normals(multibody=True)
        if arguments.texture_resolution:
            from texturing import texture_mesh
            task["stage"] = "texture"
            save(task)
            mesh = texture_mesh(mesh, model, scene[0], arguments.texture_resolution)
        del scene
        mesh = to_gradio_3d_orientation(mesh)
        model_bytes = mesh.export(file_type="glb", include_normals=True)
        finish(task, mesh, model_bytes, started)
    except Exception as error:
        logger.exception("Falló la conversión local %s", uid)
        message = "No se pudo reconstruir esta foto. Prueba otra imagen de una sola torta."
        if "out of memory" in str(error).lower():
            message = "La GPU no tiene memoria libre suficiente. Cierra otras vistas 3D o inicia el servicio con --device cpu."
        task.update(status="error", stage="failed", message=message)
        save(task)
    finally:
        gc.collect()
        if "torch" in sys.modules:
            torch = sys.modules["torch"]
            if torch.cuda.is_available():
                torch.cuda.empty_cache()


def finish(task, mesh, model_bytes, started):
    if not len(mesh.vertices) or not len(mesh.faces):
        raise ValueError("La foto no produjo una superficie válida.")
    if len(model_bytes) > 40 * 1024 * 1024:
        raise ValueError("El modelo supera el tamaño permitido. Reduce la resolución del servicio local.")
    destination = JOBS / f"{task['uid']}.glb"
    temporary = destination.with_suffix(".glb.tmp")
    temporary.write_bytes(model_bytes)
    temporary.replace(destination)
    task.update(status="completed", stage="ready", engine=arguments.engine, seconds=round(time.monotonic() - started, 2), vertices=len(mesh.vertices), faces=len(mesh.faces), resolution=160 if arguments.engine == "sf3d" else arguments.resolution, textureResolution=arguments.texture_resolution)
    save(task)
    logger.info("Conversión terminada: %s, %s vértices, %ss", task["uid"], task["vertices"], task["seconds"])


class LocalPhotoServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        # Windows otherwise lets a second worker bind while requests reach the old one.
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, value: dict) -> None:
        content = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(content)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            logger.info("El cliente cerró la consulta; el modelo se conserva para reanudarla.")

    def do_GET(self):
        if self.path == "/health":
            weight = WEIGHTS / "model.ckpt" if arguments.engine == "triposr" else CACHE / "models/stable-fast-3d/model.safetensors" if arguments.engine == "sf3d" else CACHE / "models/Hunyuan3D-2mini/hunyuan3d-dit-v2-mini-turbo/model.fp16.safetensors"
            return self.reply(200, {"status": "ready", "engine": arguments.engine, "adapterVersion": 4, "weightsReady": weight.is_file(), "resolution": 160 if arguments.engine == "sf3d" else arguments.resolution, "textureResolution": arguments.texture_resolution})
        if self.path.startswith("/status/"):
            task = load(self.path.removeprefix("/status/"))
            if task is None:
                return self.reply(404, {"status": "error", "message": "Trabajo no encontrado"})
            if task["status"] == "completed":
                try:
                    task["model_base64"] = base64.b64encode((JOBS / f"{task['uid']}.glb").read_bytes()).decode("ascii")
                except OSError:
                    return self.reply(404, {"status": "error", "message": "Modelo no disponible"})
            return self.reply(200, task)
        return self.reply(404, {"message": "Ruta no encontrada"})

    def do_POST(self):
        if self.path != "/send":
            return self.reply(404, {"message": "Ruta no encontrada"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 310_000:
                return self.reply(413, {"message": "Referencia demasiado grande"})
            body = json.loads(self.rfile.read(length))
            encoded = body.get("image", "")
            if not isinstance(encoded, str):
                raise ValueError("Imagen inválida")
            image_bytes = base64.b64decode(encoded.split(",", 1)[-1], validate=True)
            if not image_bytes or len(image_bytes) > 220_000:
                raise ValueError("Imagen demasiado grande")
            from PIL import Image
            with Image.open(io.BytesIO(image_bytes)) as image:
                if image.format not in ("JPEG", "PNG", "WEBP") or image.width * image.height > 4_194_304:
                    raise ValueError("Formato o dimensiones no admitidos")
                image.verify()
            with lock:
                if sum(task["status"] not in ("completed", "error") for task in tasks.values()) >= 2:
                    return self.reply(429, {"message": "El servicio local está ocupado"})
                uid = str(uuid.uuid4())
                task = {"uid": uid, "engine": arguments.engine, "status": "processing", "stage": "queued", "createdAt": time.time()}
                save(task)
            executor.submit(generate, uid, image_bytes)
            return self.reply(202, {"uid": uid})
        except (ValueError, TypeError, OSError):
            return self.reply(400, {"message": "Adjunta una referencia JPG, PNG o WebP válida"})


def main():
    global arguments
    parser = argparse.ArgumentParser(description="Servicio local de reconstrucción 3D de tortas")
    parser.add_argument("--engine", choices=("triposr", "sf3d", "hunyuanmini"), default="triposr")
    parser.add_argument("--steps", type=int, choices=(6, 8, 12, 16), default=8)
    parser.add_argument("--port", type=int, default=8091)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--chunk-size", type=int, choices=(512, 1024, 2048, 4096), default=1024)
    parser.add_argument("--resolution", type=int, choices=(96, 128, 160, 192, 256), default=192)
    parser.add_argument("--texture-resolution", type=int, choices=(0, 512, 1024, 2048), default=1024)
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if arguments.engine == "triposr" and (not (WEIGHTS / "model.ckpt").is_file() or not (REPOSITORY / "tsr" / "system.py").is_file()):
        parser.error("Ejecuta primero scripts/setup-photo3d-local.ps1 para descargar el motor y sus pesos.")
    if arguments.engine == "sf3d":
        if not (CACHE / "models/stable-fast-3d/model.safetensors").is_file() or not (CACHE / "stable-fast-3d/sf3d/system.py").is_file():
            parser.error("Ejecuta primero scripts/setup-photo3d-sf3d.ps1 para preparar Stable Fast 3D.")
        if arguments.texture_resolution == 0:
            parser.error("SF3D necesita una resolución de textura de 512, 1024 o 2048.")
    if arguments.engine == "hunyuanmini":
        if not (CACHE / "models/Hunyuan3D-2mini/hunyuan3d-dit-v2-mini-turbo/model.fp16.safetensors").is_file() or not (CACHE / "Hunyuan3D-2/hy3dgen/shapegen/pipelines.py").is_file():
            parser.error("Ejecuta scripts/setup-photo3d-hunyuan.ps1 para preparar Hunyuan Mini.")
        if arguments.texture_resolution == 0:
            parser.error("Hunyuan Mini necesita una resolución de textura de 512, 1024 o 2048.")
    JOBS.mkdir(parents=True, exist_ok=True)
    try:
        server = LocalPhotoServer(("127.0.0.1", arguments.port), Handler)
    except OSError:
        logger.error("El puerto %s ya está ocupado. Detén el motor anterior y vuelve a ejecutar npm run dev:local3d.", arguments.port)
        raise SystemExit(1)
    logger.info("%s local: http://127.0.0.1:%s, textura %s", arguments.engine, arguments.port, arguments.texture_resolution)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        executor.shutdown(wait=True)


if __name__ == "__main__":
    main()
