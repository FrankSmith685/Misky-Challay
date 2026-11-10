#!/usr/bin/env python3
"""Prepare a fresh production stack from an existing private .env.docker.

Run only before the new database volume is initialized. Credentials are
regenerated in place and never printed. The one-time admin password is written
to a private file beside this script's target environment file.
"""

from pathlib import Path
import os
import secrets
import sys


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: configure-public-deployment.py PATH_TO_.env.docker")
    path = Path(sys.argv[1]).resolve()
    if not path.is_file():
        raise SystemExit("missing .env.docker")
    if path.name != ".env.docker":
        raise SystemExit("expected a file named .env.docker")

    original = path.read_text(encoding="utf-8")
    values: dict[str, str] = {}
    for line in original.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()

    mail_from = values.get("MAIL_FROM", "")
    if not mail_from or "@ejemplo." in mail_from or "@example." in mail_from:
        raise SystemExit("MAIL_FROM must be a working contact address")
    if not values.get("MAIL_HOST") or not values.get("MAIL_PASSWORD"):
        raise SystemExit("working SMTP credentials are required")
    if not values.get("VAPID_PUBLIC_KEY") or not values.get("VAPID_PRIVATE_KEY"):
        raise SystemExit("VAPID keys are required")
    if values.get("ADMIN_EMAIL", "").endswith(("@ejemplo.com", "@example.com")):
        raise SystemExit("ADMIN_EMAIL must be a real mailbox")

    admin_password = secrets.token_urlsafe(48)
    updates = {
        "NODE_ENV": "production",
        "PREVIEW_MODE": "false",
        "ALLOW_PENDING_BUSINESS_INFO": "true",
        "COD_ENABLED": "true",
        "COD_MAX_AMOUNT": "300",
        "WEB_PORT": "127.0.0.1:8082",
        "FRONTEND_URL": "https://miskychallay.pe",
        "CORS_ORIGIN": "https://miskychallay.pe,https://www.miskychallay.pe",
        "TRUST_PROXY": "1",
        "DB_SYNC": "false",
        "DB_ALTER": "false",
        "DB_FORCE": "false",
        "DB_AUTO_CREATE": "false",
        "DB_SEED": "true",
        "SEED_DEMO_DATA": "false",
        "SEED_MISKY_CATALOG": "false",
        "DB_PASSWORD": secrets.token_urlsafe(48),
        "DB_ROOT_PASSWORD": secrets.token_urlsafe(48),
        "JWT_ACCESS_SECRET": secrets.token_urlsafe(48),
        "JWT_REFRESH_SECRET": secrets.token_urlsafe(48),
        "SETTINGS_ENCRYPTION_KEY": secrets.token_urlsafe(48),
        "MOCK_WEBHOOK_SECRET": secrets.token_urlsafe(48),
        "ADMIN_PASSWORD": admin_password,
        "MERCADOPAGO_ACCESS_TOKEN": "",
        "MERCADOPAGO_WEBHOOK_SECRET": "",
        "MERCADOPAGO_MODE": "live",
        "STRIPE_SECRET_KEY": "",
        "STRIPE_WEBHOOK_SECRET": "",
        "BUSINESS_LEGAL_NAME": "Misky Challay (datos legales pendientes)",
        "BUSINESS_COMMERCIAL_NAME": "Misky Challay",
        "BUSINESS_RUC": "",
        "BUSINESS_ADDRESS": "",
        "BUSINESS_PHONE": "",
        "BUSINESS_EMAIL": mail_from,
        "BUSINESS_SUPPORT_EMAIL": mail_from,
        "VAPID_SUBJECT": f"mailto:{mail_from}",
        "MOBILE_RETURN_BASE_URL": "https://miskychallay.pe",
    }

    found: set[str] = set()
    output: list[str] = []
    for line in original.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            if key in updates:
                output.append(f"{key}={updates[key]}")
                found.add(key)
                continue
        output.append(line)
    for key in updates.keys() - found:
        output.append(f"{key}={updates[key]}")

    password_file = path.with_name(".admin-initial-password")
    if password_file.exists():
        raise SystemExit("initial admin password file already exists; refusing to rotate again")
    path.write_text("\n".join(output) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)
    password_file.write_text(admin_password + "\n", encoding="utf-8")
    os.chmod(password_file, 0o600)
    print("Production environment configured; secrets stored privately on server")


if __name__ == "__main__":
    main()
