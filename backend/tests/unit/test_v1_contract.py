"""Unit tests for private helper functions in datareaper.api.routes.v1_contract."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi.responses import JSONResponse

from datareaper.api.routes.v1_contract import (
    _activity_color,
    _agent_mode,
    _api_error,
    _engagement_status,
    _escalation_reason_text,
    _escalation_status,
    _is_gmail_thread_id,
    _normalized_email,
    _paginate,
    _parse_cursor,
    _parse_datetime,
    _radar_status_from_engagement,
    _scan_status,
    _seed_matches_owner,
    _threat_type_from_target,
    _trend_from_value,
)
from datareaper.schemas.api_v1 import PageInfo


# ---------------------------------------------------------------------------
# _normalized_email
# ---------------------------------------------------------------------------


def test_normalized_email_lowercases_uppercase_input() -> None:
    assert _normalized_email("User@Example.COM") == "user@example.com"


def test_normalized_email_strips_surrounding_whitespace() -> None:
    assert _normalized_email("  hello@example.com  ") == "hello@example.com"


def test_normalized_email_strips_and_lowercases_combined() -> None:
    assert _normalized_email("  ALICE@Domain.Org  ") == "alice@domain.org"


def test_normalized_email_none_returns_empty_string() -> None:
    assert _normalized_email(None) == ""


def test_normalized_email_empty_string_returns_empty_string() -> None:
    assert _normalized_email("") == ""


def test_normalized_email_whitespace_only_returns_empty_string() -> None:
    assert _normalized_email("   ") == ""


def test_normalized_email_already_normalized_is_unchanged() -> None:
    assert _normalized_email("user@example.com") == "user@example.com"


# ---------------------------------------------------------------------------
# _seed_matches_owner
# ---------------------------------------------------------------------------


def test_seed_matches_owner_returns_true_when_emails_match() -> None:
    bundle = {"scan": {"normalized_seed": "alice@example.com"}}
    assert _seed_matches_owner(bundle, "alice@example.com") is True


def test_seed_matches_owner_is_case_insensitive() -> None:
    bundle = {"scan": {"normalized_seed": "ALICE@EXAMPLE.COM"}}
    assert _seed_matches_owner(bundle, "alice@example.com") is True


def test_seed_matches_owner_returns_false_when_emails_differ() -> None:
    bundle = {"scan": {"normalized_seed": "bob@example.com"}}
    assert _seed_matches_owner(bundle, "alice@example.com") is False


def test_seed_matches_owner_returns_false_when_scan_key_missing() -> None:
    bundle = {}
    assert _seed_matches_owner(bundle, "alice@example.com") is False


def test_seed_matches_owner_returns_false_when_seed_is_none() -> None:
    bundle = {"scan": {"normalized_seed": None}}
    assert _seed_matches_owner(bundle, "alice@example.com") is False


def test_seed_matches_owner_both_empty_emails_match() -> None:
    bundle = {"scan": {"normalized_seed": ""}}
    assert _seed_matches_owner(bundle, "") is True


def test_seed_matches_owner_ignores_whitespace_in_seed() -> None:
    bundle = {"scan": {"normalized_seed": "  alice@example.com  "}}
    assert _seed_matches_owner(bundle, "alice@example.com") is True


# ---------------------------------------------------------------------------
# _scan_status
# ---------------------------------------------------------------------------


def test_scan_status_completed_returns_completed() -> None:
    assert _scan_status("completed", None) == "completed"


def test_scan_status_resolved_maps_to_completed() -> None:
    assert _scan_status("resolved", None) == "completed"


def test_scan_status_failed_returns_failed() -> None:
    assert _scan_status("failed", None) == "failed"


def test_scan_status_error_maps_to_failed() -> None:
    assert _scan_status("error", None) == "failed"


def test_scan_status_cancelled_returns_cancelled() -> None:
    assert _scan_status("cancelled", None) == "cancelled"


def test_scan_status_stopped_maps_to_cancelled() -> None:
    assert _scan_status("stopped", None) == "cancelled"


def test_scan_status_queued_returns_queued() -> None:
    assert _scan_status("queued", None) == "queued"


def test_scan_status_discovering_passthrough() -> None:
    assert _scan_status("discovering", None) == "discovering"


def test_scan_status_identifying_passthrough() -> None:
    assert _scan_status("identifying", None) == "identifying"


def test_scan_status_engaging_passthrough() -> None:
    assert _scan_status("engaging", None) == "engaging"


def test_scan_status_stabilizing_passthrough() -> None:
    assert _scan_status("stabilizing", None) == "stabilizing"


def test_scan_status_none_with_discover_stage() -> None:
    assert _scan_status(None, "discover_phase") == "discovering"


def test_scan_status_none_with_osint_stage() -> None:
    assert _scan_status(None, "osint_scan") == "discovering"


def test_scan_status_none_with_identity_stage() -> None:
    assert _scan_status(None, "identity_resolution") == "identifying"


def test_scan_status_none_with_graph_stage() -> None:
    assert _scan_status(None, "graph_build") == "identifying"


def test_scan_status_none_with_engage_stage() -> None:
    assert _scan_status(None, "engage_broker") == "engaging"


def test_scan_status_none_with_legal_stage() -> None:
    assert _scan_status(None, "legal_notice") == "engaging"


def test_scan_status_none_with_publish_stage() -> None:
    assert _scan_status(None, "publish_result") == "engaging"


def test_scan_status_unknown_status_and_no_stage_defaults_to_discovering() -> None:
    assert _scan_status("unknown_value", None) == "discovering"


def test_scan_status_both_none_defaults_to_discovering() -> None:
    assert _scan_status(None, None) == "discovering"


def test_scan_status_is_case_insensitive_for_internal_status() -> None:
    assert _scan_status("COMPLETED", None) == "completed"


def test_scan_status_strips_whitespace_from_inputs() -> None:
    assert _scan_status("  failed  ", None) == "failed"


# ---------------------------------------------------------------------------
# _engagement_status
# ---------------------------------------------------------------------------


def test_engagement_status_resolved_string() -> None:
    assert _engagement_status("resolved") == "resolved"


def test_engagement_status_success_maps_to_resolved() -> None:
    assert _engagement_status("success") == "resolved"


def test_engagement_status_illegal_string() -> None:
    assert _engagement_status("illegal") == "illegal"


def test_engagement_status_illegal_pushback_maps_to_illegal() -> None:
    assert _engagement_status("illegal_pushback") == "illegal"


def test_engagement_status_legal_violation_maps_to_illegal() -> None:
    assert _engagement_status("legal_violation") == "illegal"


def test_engagement_status_stalling_string() -> None:
    assert _engagement_status("stalling") == "stalling"


def test_engagement_status_irrelevant_maps_to_stalling() -> None:
    assert _engagement_status("irrelevant") == "stalling"


def test_engagement_status_unknown_maps_to_in_progress() -> None:
    assert _engagement_status("pending") == "in-progress"


def test_engagement_status_none_maps_to_in_progress() -> None:
    assert _engagement_status(None) == "in-progress"


def test_engagement_status_empty_string_maps_to_in_progress() -> None:
    assert _engagement_status("") == "in-progress"


def test_engagement_status_is_case_insensitive() -> None:
    assert _engagement_status("RESOLVED") == "resolved"


# ---------------------------------------------------------------------------
# _activity_color
# ---------------------------------------------------------------------------


def test_activity_color_system_type() -> None:
    assert _activity_color("System") == "#a0a0a0"


def test_activity_color_scan_type() -> None:
    assert _activity_color("Scan") == "#4f7d5c"


def test_activity_color_match_type() -> None:
    assert _activity_color("Match") == "#4f7d5c"


def test_activity_color_legal_type() -> None:
    assert _activity_color("Legal") == "#b94a48"


def test_activity_color_comm_type() -> None:
    assert _activity_color("Comm") == "#d17a22"


def test_activity_color_unknown_type_returns_default_color() -> None:
    assert _activity_color("Unknown") == "#4a6fa5"


def test_activity_color_empty_string_returns_default_color() -> None:
    assert _activity_color("") == "#4a6fa5"


def test_activity_color_return_value_is_valid_hex_string() -> None:
    color = _activity_color("System")
    assert color.startswith("#")
    assert len(color) == 7


# ---------------------------------------------------------------------------
# _agent_mode
# ---------------------------------------------------------------------------


def test_agent_mode_sleuth_in_name() -> None:
    assert _agent_mode("SleuthAgent") == "SLEUTH"


def test_agent_mode_sleuth_lowercase() -> None:
    assert _agent_mode("sleuth_worker") == "SLEUTH"


def test_agent_mode_legal_in_name() -> None:
    assert _agent_mode("LegalProcessor") == "LEGAL"


def test_agent_mode_legal_lowercase() -> None:
    assert _agent_mode("legal_notices") == "LEGAL"


def test_agent_mode_comm_in_name() -> None:
    assert _agent_mode("CommDispatcher") == "COMMS"


def test_agent_mode_comm_lowercase() -> None:
    assert _agent_mode("comms_relay") == "COMMS"


def test_agent_mode_unknown_name_returns_deletion() -> None:
    assert _agent_mode("RemovalBot") == "DELETION"


def test_agent_mode_empty_string_returns_deletion() -> None:
    assert _agent_mode("") == "DELETION"


def test_agent_mode_mixed_case_sleuth() -> None:
    assert _agent_mode("SLEUTH_PRIMARY") == "SLEUTH"


def test_agent_mode_comm_partial_match() -> None:
    assert _agent_mode("communication_agent") == "COMMS"


# ---------------------------------------------------------------------------
# _parse_cursor
# ---------------------------------------------------------------------------


def test_parse_cursor_none_returns_zero() -> None:
    assert _parse_cursor(None) == 0


def test_parse_cursor_empty_string_returns_zero() -> None:
    assert _parse_cursor("") == 0


def test_parse_cursor_valid_positive_integer_string() -> None:
    assert _parse_cursor("10") == 10


def test_parse_cursor_zero_string_returns_zero() -> None:
    assert _parse_cursor("0") == 0


def test_parse_cursor_negative_value_clamped_to_zero() -> None:
    assert _parse_cursor("-5") == 0


def test_parse_cursor_large_value_returned_as_is() -> None:
    assert _parse_cursor("9999") == 9999


# ---------------------------------------------------------------------------
# _paginate
# ---------------------------------------------------------------------------


def test_paginate_first_page_no_cursor() -> None:
    items = list(range(10))
    page, info = _paginate(items, None, 3)
    assert page == [0, 1, 2]
    assert info.hasMore is True
    assert info.nextCursor == "3"


def test_paginate_returns_pageinfo_instance() -> None:
    items = list(range(5))
    _, info = _paginate(items, None, 5)
    assert isinstance(info, PageInfo)


def test_paginate_last_page_has_more_false() -> None:
    items = list(range(5))
    page, info = _paginate(items, "3", 5)
    assert page == [3, 4]
    assert info.hasMore is False
    assert info.nextCursor is None


def test_paginate_exact_limit_at_end_has_more_false() -> None:
    items = list(range(4))
    page, info = _paginate(items, None, 4)
    assert page == [0, 1, 2, 3]
    assert info.hasMore is False
    assert info.nextCursor is None


def test_paginate_cursor_beyond_list_returns_empty_page() -> None:
    items = list(range(3))
    page, info = _paginate(items, "10", 5)
    assert page == []
    assert info.hasMore is False
    assert info.nextCursor is None


def test_paginate_empty_list_returns_empty_page_no_more() -> None:
    page, info = _paginate([], None, 5)
    assert page == []
    assert info.hasMore is False
    assert info.nextCursor is None


def test_paginate_middle_page_with_cursor() -> None:
    items = list(range(20))
    page, info = _paginate(items, "5", 5)
    assert page == [5, 6, 7, 8, 9]
    assert info.hasMore is True
    assert info.nextCursor == "10"


def test_paginate_next_cursor_is_string() -> None:
    items = list(range(10))
    _, info = _paginate(items, None, 3)
    assert isinstance(info.nextCursor, str)


# ---------------------------------------------------------------------------
# _trend_from_value
# ---------------------------------------------------------------------------


def test_trend_from_value_zero_returns_eight_zeros() -> None:
    assert _trend_from_value(0) == [0] * 8


def test_trend_from_value_always_returns_list_of_length_eight() -> None:
    for v in [0, 1, 8, 16, 100, 1000]:
        result = _trend_from_value(v)
        assert len(result) == 8, f"Expected length 8 for value={v}, got {len(result)}"


def test_trend_from_value_last_element_equals_input() -> None:
    for v in [1, 8, 16, 50, 100]:
        result = _trend_from_value(v)
        assert result[-1] == v, f"Expected last element {v}, got {result[-1]}"


def test_trend_from_value_eight_last_element_is_eight() -> None:
    result = _trend_from_value(8)
    assert result[-1] == 8


def test_trend_from_value_values_are_non_negative() -> None:
    for v in [0, 1, 5, 100]:
        result = _trend_from_value(v)
        assert all(x >= 0 for x in result), f"Negative value in trend for input={v}: {result}"


def test_trend_from_value_positive_input_not_all_zeros() -> None:
    result = _trend_from_value(16)
    assert any(x > 0 for x in result)


def test_trend_from_value_large_value_last_element_correct() -> None:
    result = _trend_from_value(1000)
    assert result[-1] == 1000
    assert len(result) == 8


# ---------------------------------------------------------------------------
# _parse_datetime
# ---------------------------------------------------------------------------


def test_parse_datetime_valid_iso_utc_string() -> None:
    result = _parse_datetime("2024-01-15T10:30:00+00:00")
    assert result == datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)


def test_parse_datetime_z_suffix_normalized_to_utc() -> None:
    result = _parse_datetime("2024-06-01T12:00:00Z")
    assert result.year == 2024
    assert result.month == 6
    assert result.day == 1
    assert result.hour == 12


def test_parse_datetime_none_returns_current_utc_time() -> None:
    before = datetime.now(timezone.utc)
    result = _parse_datetime(None)
    after = datetime.now(timezone.utc)
    assert before <= result <= after


def test_parse_datetime_empty_string_returns_current_utc_time() -> None:
    before = datetime.now(timezone.utc)
    result = _parse_datetime("")
    after = datetime.now(timezone.utc)
    assert before <= result <= after


def test_parse_datetime_invalid_string_returns_current_utc_time() -> None:
    before = datetime.now(timezone.utc)
    result = _parse_datetime("not-a-date")
    after = datetime.now(timezone.utc)
    assert before <= result <= after


def test_parse_datetime_returns_datetime_instance() -> None:
    result = _parse_datetime("2024-03-20T09:00:00Z")
    assert isinstance(result, datetime)


def test_parse_datetime_with_offset_timezone() -> None:
    result = _parse_datetime("2024-01-01T00:00:00+05:30")
    assert isinstance(result, datetime)
    assert result.utcoffset() is not None


# ---------------------------------------------------------------------------
# _is_gmail_thread_id
# ---------------------------------------------------------------------------


def test_is_gmail_thread_id_valid_long_hex_like_id() -> None:
    assert _is_gmail_thread_id("18c3e1f2a4b5d6e7") is True


def test_is_gmail_thread_id_none_returns_false() -> None:
    assert _is_gmail_thread_id(None) is False


def test_is_gmail_thread_id_empty_string_returns_false() -> None:
    assert _is_gmail_thread_id("") is False


def test_is_gmail_thread_id_thread_prefix_returns_false() -> None:
    assert _is_gmail_thread_id("thread_abc123") is False


def test_is_gmail_thread_id_underscore_in_value_returns_false() -> None:
    assert _is_gmail_thread_id("abc_def12345") is False


def test_is_gmail_thread_id_too_short_returns_false() -> None:
    assert _is_gmail_thread_id("short") is False


def test_is_gmail_thread_id_exactly_ten_chars_returns_true() -> None:
    assert _is_gmail_thread_id("1234567890") is True


def test_is_gmail_thread_id_nine_chars_returns_false() -> None:
    assert _is_gmail_thread_id("123456789") is False


def test_is_gmail_thread_id_whitespace_only_returns_false() -> None:
    assert _is_gmail_thread_id("   ") is False


# ---------------------------------------------------------------------------
# _escalation_status
# ---------------------------------------------------------------------------


def test_escalation_status_illegal_request_returns_illegal() -> None:
    assert _escalation_status("illegal_request") == "illegal"


def test_escalation_status_non_compliance_returns_illegal() -> None:
    assert _escalation_status("non_compliance") == "illegal"


def test_escalation_status_excessive_delay_returns_stalling() -> None:
    assert _escalation_status("excessive_delay") == "stalling"


def test_escalation_status_partial_compliance_returns_stalling() -> None:
    assert _escalation_status("partial_compliance") == "stalling"


def test_escalation_status_unknown_code_returns_stalling() -> None:
    assert _escalation_status("unknown_reason") == "stalling"


def test_escalation_status_empty_string_returns_stalling() -> None:
    assert _escalation_status("") == "stalling"


# ---------------------------------------------------------------------------
# _escalation_reason_text
# ---------------------------------------------------------------------------


def test_escalation_reason_text_illegal_request() -> None:
    text = _escalation_reason_text("illegal_request")
    assert "unlawful" in text.lower() or "excessive" in text.lower()


def test_escalation_reason_text_excessive_delay() -> None:
    text = _escalation_reason_text("excessive_delay")
    assert "responded" in text.lower() or "compliance" in text.lower()


def test_escalation_reason_text_partial_compliance() -> None:
    text = _escalation_reason_text("partial_compliance")
    assert "partial" in text.lower()


def test_escalation_reason_text_unknown_code_returns_fallback_string() -> None:
    text = _escalation_reason_text("unknown_code")
    assert isinstance(text, str)
    assert len(text) > 0


def test_escalation_reason_text_returns_string_for_all_known_codes() -> None:
    for code in ["illegal_request", "excessive_delay", "partial_compliance"]:
        result = _escalation_reason_text(code)
        assert isinstance(result, str)
        assert len(result) > 0


# ---------------------------------------------------------------------------
# _threat_type_from_target
# ---------------------------------------------------------------------------


def test_threat_type_from_target_email_data_type() -> None:
    target = {"dataTypes": ["email_address", "name"]}
    assert _threat_type_from_target(target, 0) == "email"


def test_threat_type_from_target_phone_data_type() -> None:
    target = {"dataTypes": ["phone_number"]}
    assert _threat_type_from_target(target, 0) == "phone"


def test_threat_type_from_target_location_data_type() -> None:
    target = {"dataTypes": ["home_location"]}
    assert _threat_type_from_target(target, 0) == "location"


def test_threat_type_from_target_address_data_type() -> None:
    target = {"dataTypes": ["street_address"]}
    assert _threat_type_from_target(target, 0) == "location"


def test_threat_type_from_target_no_data_types_uses_index_modulo() -> None:
    target = {"dataTypes": []}
    assert _threat_type_from_target(target, 0) == "email"
    assert _threat_type_from_target(target, 1) == "phone"
    assert _threat_type_from_target(target, 2) == "location"


def test_threat_type_from_target_missing_data_types_key_uses_index() -> None:
    target = {}
    assert _threat_type_from_target(target, 0) == "email"
    assert _threat_type_from_target(target, 3) == "email"


def test_threat_type_from_target_email_takes_priority_over_phone() -> None:
    target = {"dataTypes": ["email", "phone_number"]}
    assert _threat_type_from_target(target, 0) == "email"


def test_threat_type_from_target_index_wraps_with_modulo_three() -> None:
    target = {"dataTypes": []}
    assert _threat_type_from_target(target, 3) == "email"
    assert _threat_type_from_target(target, 4) == "phone"
    assert _threat_type_from_target(target, 5) == "location"


# ---------------------------------------------------------------------------
# _radar_status_from_engagement
# ---------------------------------------------------------------------------


def test_radar_status_from_engagement_resolved_returns_identified() -> None:
    assert _radar_status_from_engagement("resolved") == "Identified"


def test_radar_status_from_engagement_success_maps_to_identified() -> None:
    assert _radar_status_from_engagement("success") == "Identified"


def test_radar_status_from_engagement_illegal_returns_deletion_in_progress() -> None:
    assert _radar_status_from_engagement("illegal") == "Deletion in progress"


def test_radar_status_from_engagement_illegal_pushback_returns_deletion_in_progress() -> None:
    assert _radar_status_from_engagement("illegal_pushback") == "Deletion in progress"


def test_radar_status_from_engagement_in_progress_returns_scanning() -> None:
    assert _radar_status_from_engagement("in-progress") == "Scanning"


def test_radar_status_from_engagement_stalling_returns_scanning() -> None:
    assert _radar_status_from_engagement("stalling") == "Scanning"


def test_radar_status_from_engagement_unknown_status_returns_scanning() -> None:
    assert _radar_status_from_engagement("pending") == "Scanning"


def test_radar_status_from_engagement_empty_string_returns_scanning() -> None:
    assert _radar_status_from_engagement("") == "Scanning"


# ---------------------------------------------------------------------------
# _api_error
# ---------------------------------------------------------------------------


def test_api_error_returns_json_response() -> None:
    response = _api_error(400, "BAD_REQUEST", "Something went wrong")
    assert isinstance(response, JSONResponse)


def test_api_error_status_code_set_correctly() -> None:
    response = _api_error(404, "NOT_FOUND", "Resource missing")
    assert response.status_code == 404


def test_api_error_body_contains_code_and_message() -> None:
    response = _api_error(422, "VALIDATION_ERROR", "Invalid input")
    body = json.loads(response.body)
    assert body["code"] == "VALIDATION_ERROR"
    assert body["message"] == "Invalid input"


def test_api_error_no_details_excludes_details_key() -> None:
    response = _api_error(500, "INTERNAL_ERROR", "Unexpected failure")
    body = json.loads(response.body)
    assert "details" not in body


def test_api_error_with_details_includes_details_in_body() -> None:
    details = [{"field": "email", "issue": "required"}]
    response = _api_error(400, "VALIDATION_ERROR", "Missing fields", details=details)
    body = json.loads(response.body)
    assert body["details"] == details


def test_api_error_500_status_code() -> None:
    response = _api_error(500, "SERVER_ERROR", "Internal failure")
    assert response.status_code == 500


def test_api_error_401_status_code() -> None:
    response = _api_error(401, "UNAUTHORIZED", "Not authenticated")
    assert response.status_code == 401


def test_api_error_body_is_valid_json() -> None:
    response = _api_error(403, "FORBIDDEN", "Access denied")
    body = json.loads(response.body)
    assert isinstance(body, dict)