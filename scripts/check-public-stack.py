#!/usr/bin/env python3
"""Read-only smoke check for the local production stack, without leaking contacts."""

import json
from urllib.request import urlopen

BASE = "http://127.0.0.1:8082"


def get(path: str):
    with urlopen(BASE + path, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"{path}: HTTP {response.status}")
        return response.read()


get("/")
get("/api/v1/live")
settings = json.loads(get("/api/v1/settings/public"))["data"]
assert settings["cod"]["enabled"] is True
assert settings["payments"]["onlineEnabled"] is False
assert settings["localPayments"]["yapeEnabled"] is True
assert settings["localPayments"]["plinEnabled"] is True
assert settings["business"]["ruc"] == ""
catalog = json.loads(get("/api/v1/catalog/products"))["data"]
products = catalog if isinstance(catalog, list) else catalog.get("products", catalog.get("items", []))
print("web: OK; api: OK; contra entrega: ON; Yape: ON; Plin: ON; pago online: OFF")
print(f"public products: {len(products)}")
