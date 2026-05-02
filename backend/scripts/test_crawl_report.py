from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _ensure_src_on_path() -> None:
    root = Path(__file__).resolve().parents[1]
    src = root / "src"
    src_text = str(src)
    if src_text not in sys.path:
        sys.path.insert(0, src_text)


def _truncate(value: Any, width: int) -> str:
    text = str(value) if value is not None else ""
    if len(text) <= width:
        return text
    if width <= 1:
        return text[:width]
    return text[: width - 1] + "..."


def _print_title(text: str) -> None:
    print()
    print("=" * 108)
    print(text)
    print("=" * 108)


def _print_table(
    title: str,
    columns: list[tuple[str, str, int]],
    rows: list[dict],
    limit: int,
) -> None:
    _print_title(title)
    if not rows:
        print("No rows")
        return

    selected = rows[:limit]
    header = " | ".join(name.ljust(width) for name, _, width in columns)
    divider = "-+-".join("-" * width for _, _, width in columns)
    print(header)
    print(divider)
    for row in selected:
        line = " | ".join(
            _truncate(row.get(key, ""), width).ljust(width)
            for _, key, width in columns
        )
        print(line)

    if len(rows) > limit:
        print(f"... {len(rows) - limit} more row(s) not shown")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run DataReaper crawl and print a readable report"
    )
    parser.add_argument(
        "seeds",
        nargs="+",
        help="Seed identifiers such as email or username",
    )
    parser.add_argument(
        "--depth",
        type=int,
        default=2,
        help="Max recursion depth for run_osint_loop (default: 2)",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=20,
        help="Maximum rows to show per section (default: 20)",
    )
    parser.add_argument(
        "--raw-json",
        action="store_true",
        help="Print raw JSON payload only",
    )
    parser.add_argument(
        "--save-json",
        default="",
        help="Optional output path for full JSON payload",
    )
    return parser.parse_args()


async def _run_crawl(seeds: list[str], depth: int) -> dict:
    _ensure_src_on_path()
    from datareaper.osint.pipeline import run_osint_loop

    return await run_osint_loop(seeds, max_depth=depth, llm=None, browser=None)


def _print_report(payload: dict, seeds: list[str], depth: int, max_rows: int) -> None:
    accounts = list(payload.get("accounts") or [])
    usernames = list(payload.get("usernames") or [])
    urls = list(payload.get("discovered_urls") or [])
    profiles = list(payload.get("profiles") or [])
    boot_log = list(payload.get("boot_log") or [])
    identity = dict(payload.get("identity") or {})

    _print_title("DataReaper Crawl Report")
    print("Timestamp:", datetime.now(UTC).isoformat())
    print("Seeds:", ", ".join(seeds))
    print("Depth:", depth)

    _print_title("Summary")
    print(f"Accounts found   : {len(accounts)}")
    print(f"Usernames tracked: {len(usernames)}")
    print(f"URLs discovered  : {len(urls)}")
    print(f"Profiles scraped : {len(profiles)}")

    _print_title("Identity")
    print("Name     :", identity.get("real_name") or identity.get("name") or "")
    print("Location :", identity.get("location") or "")
    print("Employer :", identity.get("employer") or "")
    print("Sources  :", len(identity.get("sources") or []))

    _print_title("Boot Log")
    if not boot_log:
        print("No boot log entries")
    else:
        for index, entry in enumerate(boot_log, start=1):
            print(f"{index:02d}. {entry}")

    account_rows = []
    for row in accounts:
        account_rows.append(
            {
                "platform": row.get("platform") or row.get("site") or "",
                "username": row.get("username") or "",
                "confidence": row.get("confidence") or "",
                "url": row.get("url") or row.get("profile_url") or "",
            }
        )
    _print_table(
        "Accounts",
        [
            ("platform", "platform", 14),
            ("username", "username", 24),
            ("confidence", "confidence", 10),
            ("url", "url", 56),
        ],
        account_rows,
        max_rows,
    )

    url_rows = [{"url": value} for value in urls]
    _print_table("Discovered URLs", [("url", "url", 106)], url_rows, max_rows)

    profile_rows: list[dict[str, Any]] = []
    for row in profiles:
        profile_rows.append(
            {
                "name": row.get("name") or "",
                "confidence": row.get("confidence") or "",
                "emails": len(row.get("discovered_emails") or []),
                "same_as": len(row.get("same_as_urls") or []),
                "url": row.get("url") or "",
            }
        )
    _print_table(
        "Profiles",
        [
            ("name", "name", 28),
            ("confidence", "confidence", 10),
            ("emails", "emails", 8),
            ("same_as", "same_as", 8),
            ("url", "url", 50),
        ],
        profile_rows,
        max_rows,
    )


def main() -> int:
    args = _parse_args()
    seeds = [item.strip() for item in args.seeds if item.strip()]
    if not seeds:
        print("No valid seeds provided")
        return 2

    try:
        payload = asyncio.run(_run_crawl(seeds, args.depth))
    except Exception as exc:
        print("Crawl execution failed:", str(exc))
        return 1

    if args.save_json:
        output_path = Path(args.save_json)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        print(f"Saved JSON report to {output_path}")

    if args.raw_json:
        print(json.dumps(payload, ensure_ascii=True, indent=2))
        return 0

    _print_report(payload, seeds, args.depth, args.max_rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())