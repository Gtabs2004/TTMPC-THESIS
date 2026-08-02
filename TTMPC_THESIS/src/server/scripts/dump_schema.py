"""Dump full public-schema metadata from Supabase to schema_dump.json.

Calls the RPC public.dump_public_schema() (must be created in Supabase first,
granted to service_role only). Reads SUPABASE_URL (or VITE_SUPABASE_URL) and
SUPABASE_SERVICE_ROLE_KEY from TTMPC_THESIS/.env. Never prints the key.

Run from repo root:
    TTMPC_THESIS\\src\\server\\.venv\\Scripts\\python.exe \\
        TTMPC_THESIS\\src\\server\\scripts\\dump_schema.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]  # TTMPC_THESIS/
ENV_PATH = ROOT / ".env"
OUT_PATH = ROOT / "src" / "server" / "schema_dump.json"

load_dotenv(ENV_PATH)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env")
    sys.exit(1)

SUPABASE_URL = SUPABASE_URL.rstrip("/")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

print("Calling RPC public.dump_public_schema()...")
r = requests.post(
    f"{SUPABASE_URL}/rest/v1/rpc/dump_public_schema",
    headers=HEADERS,
    json={},
    timeout=60,
)
if r.status_code != 200:
    print(f"ERROR {r.status_code}: {r.text[:500]}")
    sys.exit(1)

payload = r.json()
raw_columns = payload.get("columns") or []
raw_constraints = payload.get("constraints") or []
print(f"  columns: {len(raw_columns)}")
print(f"  constraint rows: {len(raw_constraints)}")

col_keys: dict[tuple[str, str], list[str]] = {}
col_fk_target: dict[tuple[str, str], str] = {}
for k in raw_constraints:
    key = (k["table_name"], k["column_name"])
    ctype = k["constraint_type"]
    col_keys.setdefault(key, []).append(ctype)
    if ctype == "FOREIGN KEY" and k.get("ref_table") and k.get("ref_column"):
        col_fk_target[key] = f"{k['ref_table']}.{k['ref_column']}"

tables_out: dict[str, dict] = {}
for col in raw_columns:
    t = col["table_name"]
    tables_out.setdefault(t, {"columns": []})
    cname = col["column_name"]
    keys = col_keys.get((t, cname), [])
    tables_out[t]["columns"].append(
        {
            "name": cname,
            "position": col["ordinal_position"],
            "data_type": col["data_type"],
            "udt_name": col["udt_name"],
            "nullable": col["is_nullable"] == "YES",
            "default": col["column_default"],
            "char_max_length": col["character_maximum_length"],
            "is_pk": "PRIMARY KEY" in keys,
            "is_fk": "FOREIGN KEY" in keys,
            "is_unique": "UNIQUE" in keys,
            "fk_target": col_fk_target.get((t, cname)),
        }
    )

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with OUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(
        {"tables": tables_out, "table_count": len(tables_out)},
        f,
        indent=2,
        default=str,
    )

print(f"\nWrote {OUT_PATH.relative_to(ROOT.parent)}")
print(f"Tables: {len(tables_out)}")
