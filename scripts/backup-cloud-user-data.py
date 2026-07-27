#!/usr/bin/env python3
"""Back up CloudBase NoSQL user_data before deploying a new version."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-id", required=True)
    parser.add_argument("--collection", default="user_data")
    parser.add_argument("--out-dir", default="backups/cloud-user-data")
    parser.add_argument("--page-size", type=int, default=500)
    return parser.parse_args()


def run_tcb(env_id: str, commands: list[dict[str, Any]]) -> dict[str, Any]:
    cmd = [
        "tcb",
        "db",
        "nosql",
        "execute",
        "--command",
        json.dumps(commands, ensure_ascii=False, separators=(",", ":")),
        "--json",
        "-e",
        env_id,
    ]
    proc = subprocess.run(cmd, text=True, capture_output=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        raise SystemExit(proc.returncode)

    # tcb prints progress lines before JSON. Keep parsing resilient.
    raw = proc.stdout
    start = raw.find("{")
    if start < 0:
        raise RuntimeError(f"tcb output did not contain JSON: {raw}")
    return json.loads(raw[start:])


def ejson_number(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, dict):
        for key in ("$numberInt", "$numberLong", "$numberDouble"):
            if key in value:
                return int(float(value[key]))
    raise RuntimeError(f"cannot parse numeric value: {value!r}")


def first_result(payload: dict[str, Any]) -> Any:
    return payload["data"]["results"][0]


def count_docs(env_id: str, collection: str) -> int:
    payload = run_tcb(env_id, [
        {
            "TableName": collection,
            "CommandType": "COMMAND",
            "Command": json.dumps({"count": collection, "query": {}}, ensure_ascii=False),
        }
    ])
    result = first_result(payload)
    if isinstance(result, list) and result:
        result = result[0]
    return ejson_number(result["n"])


def find_docs(env_id: str, collection: str, skip: int, limit: int) -> list[dict[str, Any]]:
    payload = run_tcb(env_id, [
        {
            "TableName": collection,
            "CommandType": "QUERY",
            "Command": json.dumps(
                {"find": collection, "filter": {}, "skip": skip, "limit": limit},
                ensure_ascii=False,
            ),
        }
    ])
    result = first_result(payload)
    if isinstance(result, list) and len(result) == 1 and isinstance(result[0], dict) and "cursor" in result[0]:
      return result[0]["cursor"].get("firstBatch", [])
    if isinstance(result, list):
      return result
    raise RuntimeError(f"unexpected query result shape: {result!r}")


def main() -> int:
    args = parse_args()
    if args.page_size <= 0:
        raise SystemExit("--page-size must be positive")

    created_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    total = count_docs(args.env_id, args.collection)
    docs: list[dict[str, Any]] = []
    for skip in range(0, total, args.page_size):
        docs.extend(find_docs(args.env_id, args.collection, skip, args.page_size))

    backup = {
        "app": "fushi-ditu",
        "kind": "cloud-user-data-backup",
        "version": 1,
        "createdAt": created_at,
        "envId": args.env_id,
        "collection": args.collection,
        "count": total,
        "documents": docs,
    }

    out_dir = pathlib.Path(args.out_dir) / args.env_id
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = created_at.replace(":", "").replace("-", "")
    out_file = out_dir / f"{stamp}-{args.collection}.json"
    out_file.write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✓ backed up {total} {args.collection} docs")
    print(f"  backup: {out_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
