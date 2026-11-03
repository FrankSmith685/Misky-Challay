"""Isolated version of TripoSR's make_atlas (MIT; see LICENSE.TripoSR).

https://github.com/VAST-AI-Research/TripoSR/blob/main/tsr/bake_texture.py
Keep this process free of PyTorch/model imports to avoid duplicating GPU memory.
"""
import sys

import numpy as np
import xatlas


def main():
    source, destination, resolution, padding = sys.argv[1:]
    with np.load(source, allow_pickle=False) as mesh:
        atlas = xatlas.Atlas()
        atlas.add_mesh(mesh["vertices"], mesh["faces"])
    options = xatlas.PackOptions()
    options.resolution = int(resolution)
    options.padding = int(padding)
    options.bilinear = True
    atlas.generate(pack_options=options)
    vmapping, indices, uvs = atlas[0]
    np.savez(destination, vmapping=vmapping, indices=indices, uvs=uvs)


if __name__ == "__main__":
    main()
