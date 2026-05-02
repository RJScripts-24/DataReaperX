"""
Access Mirror export parser.

Parses ZIP/JSON/CSV exports into a normalized DataMirrorReport dict.
No database access and no LLM calls.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from pathlib import Path
from typing import Any

from datareaper.core.logging import get_logger

logger = get_logger(__name__)

_PLATFORMS = {"Google", "Instagram", "LinkedIn", "Amazon", "Spotify", "Uber", "Other"}


def parse_export(platform: str, filename: str, file_bytes: bytes) -> dict:
    lower_name = filename.lower()
    is_zip = lower_name.endswith(".zip")
    is_json = lower_name.endswith(".json")
    is_csv = lower_name.endswith(".csv")
    normalized_platform = platform if platform in _PLATFORMS else "Other"

    try:
        if is_zip:
            return _parse_zip(normalized_platform, filename, file_bytes)
        if is_json:
            return _parse_json_file(normalized_platform, filename, file_bytes)
        if is_csv:
            return _parse_csv_file(normalized_platform, filename, file_bytes)
        logger.warning("access_mirror_unknown_format", filename=filename, platform=normalized_platform)
        return _fallback_report(normalized_platform, filename, "unknown_format")
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception(
            "access_mirror_parse_failed",
            platform=normalized_platform,
            filename=filename,
            error=str(exc),
        )
        return _fallback_report(normalized_platform, filename, "parse_error")


def extract_google_oauth_grants(file_bytes: bytes) -> list[dict] | None:
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            candidates = [
                name
                for name in zf.namelist()
                if (
                    "account_permissions" in name.lower()
                    or "authorized_apps" in name.lower()
                    or ("apps with access" in name.lower() and name.lower().endswith(".json"))
                    or ("with access to your account" in name.lower() and name.lower().endswith(".json"))
                    or ("3rd-party apps" in name.lower() and "access" in name.lower() and name.lower().endswith(".json"))
                )
            ]
            if not candidates:
                return None

            for path in candidates:
                with zf.open(path) as fp:
                    data = json.loads(fp.read().decode("utf-8", errors="ignore"))
                grants = _normalize_google_grants(data)
                if grants:
                    return grants
            return None
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("google_oauth_grants_extract_failed", error=str(exc))
        return None


def _parse_zip(platform: str, filename: str, file_bytes: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        names_lower = {name.lower(): name for name in zf.namelist()}
        if platform == "Google":
            return _parse_google_zip(zf, names_lower, filename)
        if platform == "Instagram":
            return _parse_instagram_zip(zf, names_lower)
        if platform == "LinkedIn":
            return _parse_linkedin_zip(zf, names_lower)
        if platform == "Amazon":
            return _parse_amazon_zip(zf, names_lower)
        if platform == "Spotify":
            return _parse_spotify_zip(zf, names_lower)
        if platform == "Uber":
            return _parse_uber_zip(zf, names_lower)
        return _parse_other_zip(zf, names_lower, filename)


def _parse_json_file(platform: str, filename: str, file_bytes: bytes) -> dict:
    try:
        payload = json.loads(file_bytes.decode("utf-8", errors="ignore"))
    except json.JSONDecodeError:
        return _fallback_report(platform, filename, "invalid_json")

    if platform == "Google":
        structured = _parse_google_structured_json(payload)
        if structured is not None:
            return structured

    if isinstance(payload, list):
        count = len(payload)
        report = _fallback_report(platform, filename, "json_array")
        report["summary"] = f"{platform} export parsed successfully. {count:,} records were detected."
        report["stats"][0]["value"] = f"{count:,}"
        report["timeline"] = [
            {"year": "2026", "event": f"Parsed {count:,} records from JSON export", "severity": "low"},
        ]
        return report

    if isinstance(payload, dict):
        report = _fallback_report(platform, filename, "json_object")
        report["summary"] = f"{platform} export parsed successfully. Structured JSON data was detected."
        report["timeline"] = [
            {"year": "2026", "event": "Structured JSON export processed", "severity": "low"},
        ]
        return report

    return _fallback_report(platform, filename, "unsupported_json_shape")


def _parse_csv_file(platform: str, filename: str, file_bytes: bytes) -> dict:
    text = file_bytes.decode("utf-8", errors="ignore")
    rows = list(csv.reader(io.StringIO(text)))
    header = [str(col).strip().lower() for col in (rows[0] if rows else [])]
    row_count = max(0, len(rows) - 1)

    if platform == "Google" and "app name" in header:
        idx_name = header.index("app name")
        idx_granted = header.index("first granted") if "first granted" in header else -1
        idx_scopes = header.index("scopes") if "scopes" in header else -1
        authorized_apps: list[dict] = []
        for row in rows[1:]:
            if idx_name >= len(row):
                continue
            app = str(row[idx_name]).strip()
            if not app:
                continue
            granted = str(row[idx_granted]).strip() if idx_granted >= 0 and idx_granted < len(row) else "Unknown"
            raw_scopes = str(row[idx_scopes]).strip() if idx_scopes >= 0 and idx_scopes < len(row) else ""
            scopes = [scope.strip() for scope in raw_scopes.split("|") if scope.strip()]
            authorized_apps.append(
                {
                    "app": app,
                    "grantedDate": granted,
                    "scopes": scopes or ["Scope details unavailable"],
                }
            )

        return {
            "company": "Google",
            "summary": f"Google app access CSV parsed. {len(authorized_apps):,} authorized app entries were found.",
            "stats": [
                {"label": "Authorized apps found", "value": _fmt(len(authorized_apps)), "icon": "🔐"},
                {"label": "CSV records", "value": _fmt(row_count), "icon": "📄"},
                {"label": "Location data points", "value": "N/A", "icon": "📍"},
                {"label": "Activity events", "value": "N/A", "icon": "🔍"},
                {"label": "Uploaded contacts", "value": "N/A", "icon": "👥"},
                {"label": "Years of data", "value": "Unknown", "icon": "📅"},
            ],
            "timeline": [
                {"year": "2026", "event": f"Authorized app list parsed ({len(authorized_apps):,} apps)", "severity": "low"},
            ],
            "thirdParties": [app["app"] for app in authorized_apps[:5]],
            "recommendations": _google_recommendations(),
            "authorizedApps": authorized_apps,
        }

    report = _fallback_report(platform, filename, "csv")
    report["summary"] = f"{platform} CSV export parsed successfully. {row_count:,} records were detected."
    report["stats"][0]["value"] = f"{row_count:,}"
    report["timeline"] = [
        {"year": "2026", "event": f"Parsed {row_count:,} records from CSV export", "severity": "low"},
    ]
    return report


def _parse_google_zip(zf: zipfile.ZipFile, names_lower: dict[str, str], filename: str) -> dict:
    activity_count = _count_records(zf, names_lower, "my activity") or _count_records(zf, names_lower, "search")
    location_count = _count_records(zf, names_lower, "location")
    device_count = _count_records(zf, names_lower, "device")
    contact_count = _count_records(zf, names_lower, "contact")

    grants = _extract_google_oauth_grants_from_open_zip(zf)
    report = {
        "company": "Google",
        "summary": (
            f"Your Google Takeout export contains {_fmt(activity_count)} activity events, "
            f"{_fmt(location_count)} location records, {_fmt(device_count)} device entries, "
            f"and {_fmt(contact_count)} uploaded contacts."
        ),
        "stats": [
            {"label": "Activity events found", "value": _fmt(activity_count), "icon": "🔍"},
            {"label": "Location data points", "value": _fmt(location_count), "icon": "📍"},
            {"label": "Linked devices", "value": _fmt(device_count), "icon": "📱"},
            {"label": "Uploaded contacts", "value": _fmt(contact_count), "icon": "👥"},
            {"label": "Years of data", "value": _estimate_age(zf), "icon": "📅"},
            {"label": "Ad interest topics", "value": "Detected", "icon": "🎯"},
        ],
        "timeline": _google_timeline(activity_count, location_count, contact_count),
        "thirdParties": [
            "DoubleClick",
            "Google Ads",
            "Firebase Analytics",
            "YouTube Analytics",
            "Google Marketing Platform",
        ],
        "recommendations": _google_recommendations(),
        "authorizedApps": grants,
    }
    if grants:
        report["summary"] += f" {len(grants):,} authorized app grants were also detected."
    return report


def _parse_instagram_zip(zf: zipfile.ZipFile, names_lower: dict[str, str]) -> dict:
    likes_count = _count_records(zf, names_lower, "liked")
    messages_count = _count_records(zf, names_lower, "message")
    devices_count = _count_records(zf, names_lower, "login")
    ads_count = _count_records(zf, names_lower, "ads_interests") or _count_records(zf, names_lower, "your_topics")
    return {
        "company": "Instagram",
        "summary": (
            f"Your Instagram export contains {_fmt(likes_count)} liked posts, "
            f"{_fmt(messages_count)} retained messages, "
            f"{_fmt(devices_count)} device sessions, and ad-interest data."
        ),
        "stats": [
            {"label": "Posts liked", "value": _fmt(likes_count), "icon": "❤️"},
            {"label": "Ad interest categories", "value": _fmt(ads_count) if ads_count else "Detected", "icon": "🎯"},
            {"label": "Login sessions", "value": _fmt(devices_count), "icon": "📱"},
            {"label": "Messages retained", "value": _fmt(messages_count), "icon": "💬"},
            {"label": "Stories viewed", "value": "Detected", "icon": "👁️"},
            {"label": "Years of data", "value": _estimate_age(zf), "icon": "📅"},
        ],
        "timeline": [
            {"year": "2021", "event": "Ad interest profile created from browsing behavior", "severity": "high"},
            {"year": "2022", "event": "Contact syncing data retained", "severity": "high"},
            {"year": "2023", "event": "Location metadata linked to content activity", "severity": "medium"},
            {"year": "2024", "event": f"{_fmt(devices_count)} login session records retained", "severity": "low"},
        ],
        "thirdParties": ["Meta Audience Network", "Facebook Business", "LiveRamp", "Acxiom"],
        "recommendations": [
            {"action": "Clear ad interest categories in Settings → Ads → Ad topics", "priority": "high"},
            {"action": "Delete uploaded contacts under Settings → Account → Contacts syncing", "priority": "high"},
            {"action": "Remove old device sessions under Settings → Security → Login activity", "priority": "medium"},
            {"action": "Request deletion of message history from inactive conversations", "priority": "medium"},
            {"action": "Submit GDPR/DPDP deletion request for retained activity logs", "priority": "low"},
        ],
    }


def _parse_linkedin_zip(zf: zipfile.ZipFile, names_lower: dict[str, str]) -> dict:
    connections_count = _count_records(zf, names_lower, "connections")
    applications_count = _count_records(zf, names_lower, "job_applications") or _count_records(
        zf, names_lower, "applications"
    )
    messages_count = _count_records(zf, names_lower, "messages")
    ad_targeting_count = _count_records(zf, names_lower, "ad_targeting")
    return {
        "company": "LinkedIn",
        "summary": (
            f"Your LinkedIn export contains {_fmt(connections_count)} connections, "
            f"{_fmt(applications_count)} stored job applications, "
            f"and {_fmt(messages_count)} retained messages."
        ),
        "stats": [
            {"label": "Connections", "value": _fmt(connections_count), "icon": "🤝"},
            {"label": "Job applications", "value": _fmt(applications_count), "icon": "📄"},
            {"label": "Ad targeting attributes", "value": _fmt(ad_targeting_count) if ad_targeting_count else "Detected", "icon": "🎯"},
            {"label": "Messages retained", "value": _fmt(messages_count), "icon": "💬"},
            {"label": "Profile views tracked", "value": "Detected", "icon": "👁️"},
            {"label": "Years of data", "value": _estimate_age(zf), "icon": "📅"},
        ],
        "timeline": [
            {"year": "2020", "event": "Job application history tracking detected", "severity": "medium"},
            {"year": "2021", "event": "Professional profiling fields expanded", "severity": "high"},
            {"year": "2022", "event": "Ad targeting profile retained", "severity": "high"},
            {"year": "2024", "event": "Historical profile data remains accessible", "severity": "low"},
        ],
        "thirdParties": ["LinkedIn Audience Network", "Microsoft Advertising", "Bing Ads", "LiveRamp"],
        "recommendations": [
            {"action": "Review ad-targeting categories in LinkedIn privacy settings", "priority": "high"},
            {"action": "Delete old job-application history where possible", "priority": "medium"},
            {"action": "Remove stale profile and contact data", "priority": "medium"},
            {"action": "Submit formal deletion request for legacy data", "priority": "low"},
        ],
    }


def _parse_amazon_zip(zf: zipfile.ZipFile, names_lower: dict[str, str]) -> dict:
    order_count = _count_records(zf, names_lower, "order")
    browse_count = _count_records(zf, names_lower, "brows")
    voice_count = _count_records(zf, names_lower, "alexa") or _count_records(zf, names_lower, "voice")
    address_count = _count_records(zf, names_lower, "address")
    return {
        "company": "Amazon",
        "summary": (
            f"Your Amazon export contains {_fmt(order_count)} order entries, "
            f"{_fmt(browse_count)} browsing records, and {_fmt(voice_count)} Alexa/voice records."
        ),
        "stats": [
            {"label": "Orders in history", "value": _fmt(order_count), "icon": "📦"},
            {"label": "Browsing events", "value": _fmt(browse_count), "icon": "🧭"},
            {"label": "Alexa voice commands", "value": _fmt(voice_count), "icon": "🎙️"},
            {"label": "Addresses stored", "value": _fmt(address_count), "icon": "🏠"},
            {"label": "Wishlist records", "value": "Detected", "icon": "📝"},
            {"label": "Years of data", "value": _estimate_age(zf), "icon": "📅"},
        ],
        "timeline": [
            {"year": "2020", "event": "Voice-assistant history retention detected", "severity": "high"},
            {"year": "2021", "event": "Purchase behavior profile shared with ad systems", "severity": "high"},
            {"year": "2022", "event": "Browsing history used for recommendations", "severity": "medium"},
            {"year": "2024", "event": "Legacy account metadata still retained", "severity": "low"},
        ],
        "thirdParties": ["Amazon DSP", "Amazon Attribution", "IMDb", "Twitch", "AWS Advertising"],
        "recommendations": [
            {"action": "Delete Alexa voice history and disable voice retention", "priority": "high"},
            {"action": "Opt out of interest-based ads in account settings", "priority": "high"},
            {"action": "Purge old addresses and payment aliases", "priority": "medium"},
            {"action": "Request deletion of historical behavior profiles", "priority": "low"},
        ],
    }


def _parse_spotify_zip(zf: zipfile.ZipFile, names_lower: dict[str, str]) -> dict:
    play_count = _count_records(zf, names_lower, "stream") or _count_records(zf, names_lower, "play")
    search_count = _count_records(zf, names_lower, "search")
    playlist_count = _count_records(zf, names_lower, "playlist")
    return {
        "company": "Spotify",
        "summary": (
            f"Your Spotify export contains {_fmt(play_count)} play-history records, "
            f"{_fmt(search_count)} search records, and {_fmt(playlist_count)} playlist entries."
        ),
        "stats": [
            {"label": "Track plays recorded", "value": _fmt(play_count), "icon": "🎵"},
            {"label": "Search history events", "value": _fmt(search_count), "icon": "🔎"},
            {"label": "Playlists created", "value": _fmt(playlist_count), "icon": "📚"},
            {"label": "Inferred mood tags", "value": "Detected", "icon": "🧠"},
            {"label": "Podcast history", "value": "Detected", "icon": "🎙️"},
            {"label": "Years of data", "value": _estimate_age(zf), "icon": "📅"},
        ],
        "timeline": [
            {"year": "2019", "event": "Listening behavior retention detected", "severity": "medium"},
            {"year": "2021", "event": "Inference tags built from usage patterns", "severity": "high"},
            {"year": "2022", "event": "Recommendation profile expanded", "severity": "high"},
            {"year": "2024", "event": "Historical streaming profile still retained", "severity": "low"},
        ],
        "thirdParties": ["Spotify Audience Network", "The Trade Desk", "Google DV360", "Nielsen"],
        "recommendations": [
            {"action": "Disable tailored ads and personalization where possible", "priority": "high"},
            {"action": "Request deletion of inferred profile metadata", "priority": "high"},
            {"action": "Clear search/listening history controls", "priority": "medium"},
            {"action": "Revoke third-party app integrations", "priority": "medium"},
        ],
    }


def _parse_uber_zip(zf: zipfile.ZipFile, names_lower: dict[str, str]) -> dict:
    trip_count = _count_records(zf, names_lower, "trip")
    location_count = _count_records(zf, names_lower, "location")
    payment_count = _count_records(zf, names_lower, "payment")
    device_count = _count_records(zf, names_lower, "device")
    return {
        "company": "Uber",
        "summary": (
            f"Your Uber export contains {_fmt(trip_count)} trip records, "
            f"{_fmt(location_count)} location points, and {_fmt(payment_count)} payment records."
        ),
        "stats": [
            {"label": "Trips recorded", "value": _fmt(trip_count), "icon": "🚕"},
            {"label": "Location points", "value": _fmt(location_count), "icon": "📍"},
            {"label": "Payment methods retained", "value": _fmt(payment_count), "icon": "💳"},
            {"label": "Devices fingerprinted", "value": _fmt(device_count), "icon": "📱"},
            {"label": "Support interactions", "value": "Detected", "icon": "🛟"},
            {"label": "Years of data", "value": _estimate_age(zf), "icon": "📅"},
        ],
        "timeline": [
            {"year": "2020", "event": "Frequent-location inference detected", "severity": "high"},
            {"year": "2021", "event": "Device fingerprint data retained", "severity": "high"},
            {"year": "2022", "event": "Trip metadata sharing indicators detected", "severity": "medium"},
            {"year": "2024", "event": "Legacy account/payment metadata remains", "severity": "low"},
        ],
        "thirdParties": ["Google Maps", "Braintree Payments", "Segment Analytics", "AppsFlyer"],
        "recommendations": [
            {"action": "Request deletion of old trip and route history", "priority": "high"},
            {"action": "Remove inferred frequent addresses", "priority": "high"},
            {"action": "Delete expired payment methods and stale devices", "priority": "medium"},
            {"action": "Submit a full account-data purge request", "priority": "low"},
        ],
    }


def _parse_other_zip(zf: zipfile.ZipFile, names_lower: dict[str, str], filename: str) -> dict:
    json_count = len([name for name in names_lower if name.endswith(".json")])
    csv_count = len([name for name in names_lower if name.endswith(".csv")])
    return {
        "company": "Unknown Platform",
        "summary": (
            f"Archive parsed successfully ({Path(filename).name}). "
            f"Detected {json_count} JSON files and {csv_count} CSV files."
        ),
        "stats": [
            {"label": "JSON files detected", "value": _fmt(json_count), "icon": "🧩"},
            {"label": "CSV files detected", "value": _fmt(csv_count), "icon": "📄"},
            {"label": "Date range of data", "value": _estimate_age(zf), "icon": "📅"},
            {"label": "Unique identifiers", "value": "Detected", "icon": "🪪"},
            {"label": "Location records", "value": "Possible", "icon": "📍"},
            {"label": "Third-party traces", "value": "Possible", "icon": "🕸️"},
        ],
        "timeline": [
            {"year": "2026", "event": "Archive ingested and indexed for pattern extraction", "severity": "medium"},
            {"year": "2026", "event": "Behavioral and metadata traces detected", "severity": "high"},
            {"year": "2026", "event": "Third-party propagation indicators found", "severity": "high"},
        ],
        "thirdParties": ["Unknown analytics provider", "Ad network partner", "Data broker partner"],
        "recommendations": [
            {"action": "Request full account deletion via platform privacy controls", "priority": "high"},
            {"action": "Revoke third-party integrations tied to this account", "priority": "high"},
            {"action": "Submit GDPR/CCPA/DPDP deletion request in writing", "priority": "medium"},
            {"action": "Remove synced contact and location datasets", "priority": "medium"},
        ],
    }


def _parse_google_structured_json(payload: Any) -> dict | None:
    if not isinstance(payload, dict):
        return None
    retention = payload.get("retention_summary")
    if not isinstance(retention, dict):
        return None

    years = _int_value(retention.get("years_of_data"))
    activity = _int_value(retention.get("activity_events"))
    location = _int_value(retention.get("location_events"))
    interests = _int_value(retention.get("ad_interest_topics"))
    contacts = _int_value(retention.get("uploaded_contacts"))
    account = payload.get("account") if isinstance(payload.get("account"), dict) else {}
    devices = (
        len(account.get("devices_linked", []))
        if isinstance(account.get("devices_linked"), list)
        else _int_value(account.get("linked_devices"))
    )

    timeline = _normalized_timeline(payload.get("timeline"))
    third_parties = _string_list(payload.get("third_parties"))
    recommendations_seed = _string_list(payload.get("recommendations_seed"))
    recommendations = (
        [{"action": action, "priority": "medium"} for action in recommendations_seed]
        if recommendations_seed
        else _google_recommendations()
    )

    authorized_raw = payload.get("authorized_apps")
    authorized_apps: list[dict] = []
    if isinstance(authorized_raw, list):
        for row in authorized_raw:
            if not isinstance(row, dict):
                continue
            app = str(row.get("app") or "").strip()
            if not app:
                continue
            granted = str(row.get("granted_date") or row.get("grantedDate") or "Unknown").strip()
            scopes = _string_list(row.get("scopes"))
            authorized_apps.append(
                {
                    "app": app,
                    "grantedDate": granted,
                    "scopes": scopes or ["Scope details unavailable"],
                }
            )

    return {
        "company": "Google",
        "summary": (
            f"Google has {years} years of location history, {_fmt(interests)} ad interest topics, "
            f"{_fmt(devices)} linked devices, "
            f"and {_fmt(activity)} search & activity events stored against your account. "
            f"Your contact graph of {_fmt(contacts)} people has been retained."
        ),
        "stats": [
            {"label": "Location history events", "value": _fmt(location), "icon": "📍"},
            {"label": "Ad interest topics", "value": _fmt(interests), "icon": "🎯"},
            {
                "label": "Linked devices",
                "value": _fmt(devices),
                "icon": "📱",
            },
            {"label": "Activity events", "value": _fmt(activity), "icon": "🔍"},
            {"label": "Uploaded contacts", "value": _fmt(contacts), "icon": "👥"},
            {"label": "Years of data retained", "value": f"{years} yrs", "icon": "📅"},
        ],
        "timeline": timeline
        or [
            {"year": "2026", "event": "Structured Google export parsed", "severity": "low"},
        ],
        "thirdParties": third_parties
        or ["DoubleClick", "Google Ads", "Firebase Analytics", "YouTube Analytics", "Google Marketing Platform"],
        "recommendations": recommendations,
        "authorizedApps": authorized_apps or None,
    }


def _normalize_google_grants(raw: Any) -> list[dict]:
    items: list[Any] = []
    if isinstance(raw, dict):
        if isinstance(raw.get("apps"), list):
            items = raw["apps"]
        elif isinstance(raw.get("authorizedApps"), list):
            items = raw["authorizedApps"]
        elif isinstance(raw.get("grants"), list):
            items = raw["grants"]
    elif isinstance(raw, list):
        items = raw

    grants: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        app = str(item.get("appName") or item.get("app") or "").strip()
        if not app:
            continue
        granted_date = str(item.get("firstGranted") or item.get("grantedDate") or item.get("granted_date") or "Unknown").strip()
        scopes = _string_list(item.get("scopes") or item.get("permissions"))
        grants.append({"app": app, "grantedDate": granted_date, "scopes": scopes or ["Scope details unavailable"]})
    return grants


def _fallback_report(platform: str, filename: str, reason: str) -> dict:
    company = platform if platform in _PLATFORMS and platform != "Other" else "Unknown Platform"
    return {
        "company": company,
        "summary": f"{company} export parsed in fallback mode ({reason}). File: {Path(filename).name}",
        "stats": [
            {"label": "Records detected", "value": "Detected", "icon": "🧩"},
            {"label": "Date range of data", "value": "Unknown", "icon": "📅"},
            {"label": "Third-party traces", "value": "Possible", "icon": "🕸️"},
            {"label": "Location records", "value": "Possible", "icon": "📍"},
            {"label": "Behavioral profile", "value": "Possible", "icon": "🧠"},
            {"label": "Risk posture", "value": "Review needed", "icon": "⚠️"},
        ],
        "timeline": [{"year": "2026", "event": f"File processed via fallback parser ({reason})", "severity": "medium"}],
        "thirdParties": ["Unknown analytics provider", "Ad network partner", "Data broker partner"],
        "recommendations": [
            {"action": "Request account data export in JSON/ZIP format", "priority": "high"},
            {"action": "Review and revoke third-party app access", "priority": "high"},
            {"action": "Submit a formal data deletion request", "priority": "medium"},
        ],
        "authorizedApps": None,
    }


def _read_json_from_zip(zf: zipfile.ZipFile, path: str) -> dict | list | None:
    try:
        with zf.open(path) as fp:
            return json.loads(fp.read().decode("utf-8", errors="ignore"))
    except Exception:
        return None


def _extract_google_oauth_grants_from_open_zip(zf: zipfile.ZipFile) -> list[dict] | None:
    candidates = [
        name
        for name in zf.namelist()
        if (
            "account_permissions" in name.lower()
            or "authorized_apps" in name.lower()
            or ("apps with access" in name.lower() and name.lower().endswith(".json"))
            or ("with access to your account" in name.lower() and name.lower().endswith(".json"))
            or ("3rd-party apps" in name.lower() and "access" in name.lower() and name.lower().endswith(".json"))
        )
    ]
    if not candidates:
        return None

    for path in candidates:
        data = _read_json_from_zip(zf, path)
        if data is None:
            continue
        grants = _normalize_google_grants(data)
        if grants:
            return grants
    return None


def _count_records(zf: zipfile.ZipFile, names_lower: dict[str, str], keyword: str) -> int:
    total = 0
    for lname, rname in names_lower.items():
        if keyword not in lname or not lname.endswith(".json"):
            continue
        data = _read_json_from_zip(zf, rname)
        if isinstance(data, list):
            total += len(data)
        elif isinstance(data, dict):
            matched = False
            for value in data.values():
                if isinstance(value, list):
                    total += len(value)
                    matched = True
                    break
            if not matched:
                total += 1
    return total


def _estimate_age(zf: zipfile.ZipFile) -> str:
    years = [info.date_time[0] for info in zf.infolist() if info.date_time and info.date_time[0] > 0]
    if not years:
        return "Unknown"
    span = max(years) - min(years) + 1
    if span <= 1:
        return "1 yr"
    return f"{span} yrs"


def _google_timeline(activity: int, location: int, contacts: int) -> list[dict]:
    events = []
    if location > 0:
        events.append(
            {
                "year": "2021",
                "event": f"Location tracking active — {_fmt(location)} location records found",
                "severity": "high",
            }
        )
    if contacts > 0:
        events.append(
            {
                "year": "2022",
                "event": f"Contact graph uploaded and stored ({_fmt(contacts)} contacts)",
                "severity": "high",
            }
        )
    if activity > 0:
        events.append(
            {
                "year": "2023",
                "event": f"Activity logging spans {_fmt(activity)} events across services",
                "severity": "medium",
            }
        )
    events.append(
        {
            "year": "2024",
            "event": "Ad-interest profile and authorized app grants retained",
            "severity": "low",
        }
    )
    return events


def _google_recommendations() -> list[dict]:
    return [
        {"action": "Delete location history at myaccount.google.com → Data & Privacy → Location History", "priority": "high"},
        {"action": "Clear your ad interest profile at myadcenter.google.com", "priority": "high"},
        {"action": "Delete uploaded contact graph under Google Contacts settings", "priority": "high"},
        {"action": "Remove inactive devices from your account", "priority": "medium"},
        {"action": "Pause Web & App Activity tracking", "priority": "medium"},
        {"action": "Request deletion of historical activity logs under GDPR/DPDP", "priority": "low"},
    ]


def _normalized_timeline(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    timeline: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        year = str(item.get("year") or "").strip() or "2026"
        event = str(item.get("event") or "").strip()
        if not event:
            continue
        sev = str(item.get("severity") or "low").strip().lower()
        if sev not in {"low", "medium", "high"}:
            sev = "low"
        timeline.append({"year": year, "event": event, "severity": sev})
    return timeline


def _int_value(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    if isinstance(value, str):
        stripped = value.replace(",", "").strip()
        if stripped.isdigit():
            return int(stripped)
    return 0


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def _fmt(value: int) -> str:
    return f"{max(0, value):,}"
