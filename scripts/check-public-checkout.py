#!/usr/bin/env python3
"""Read-only price quote against production before accepting a real order."""

import json
from urllib.request import Request, urlopen

BASE = "http://127.0.0.1:8082/api/v1"


def request(path: str, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    with urlopen(Request(BASE + path, data=data, headers={"Content-Type": "application/json"}), timeout=20) as response:
        return json.loads(response.read())["data"]


catalog = request("/catalog/products")
products = catalog if isinstance(catalog, list) else catalog.get("products", catalog.get("items", []))
candidate = next((product for product in products if product.get("type") == "FIXED"), None)
if candidate is None:
    raise SystemExit("No fixed product in public catalog")
detail = request("/catalog/products/" + candidate["slug"])
product = detail.get("product", detail) if isinstance(detail, dict) else detail
variants = product.get("variants", [])
if not variants:
    raise SystemExit(f"No variants in product detail; keys={list(product.keys())}")
variant = variants[0]
payload = {
    "items": [{"productId": candidate["id"], "variantId": variant["id"], "quantity": 1}],
    "deliveryType": "DELIVERY",
    "serviceMode": "SCHEDULED",
    "address": {"line1": "Ubicación de prueba, Miraflores", "latitude": -12.1219, "longitude": -77.0297},
    "paymentMethod": "CASH",
}
quote = request("/checkout/quote", payload)
assert quote["grandTotal"] > 0
print("Cash quote: OK; product:", candidate["slug"], "; total:", quote["grandTotal"])
