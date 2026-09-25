"""Unit tests for backend/domain/recurrence.py.

Pure — no server, no database, safe to run anytime.
"""

from datetime import date

from domain.recurrence import (
    compute_next_occurrence_dates,
    filter_dates_within_end_date,
    get_next_weekday_dates,
    is_valid_weekday_name,
    validate_twice_week_days,
)


# ── validate_twice_week_days ────────────────────────────────────────────────

def test_twice_week_valid_pair_has_no_error():
    assert validate_twice_week_days(["Monday", "Thursday"]) is None


def test_twice_week_wrong_count_is_an_error():
    assert validate_twice_week_days(["Monday"]) is not None
    assert validate_twice_week_days(["Monday", "Tuesday", "Wednesday"]) is not None


def test_twice_week_missing_days_is_an_error():
    assert validate_twice_week_days(None) is not None
    assert validate_twice_week_days([]) is not None


def test_twice_week_invalid_day_name_is_an_error():
    # Regression: routes/orders.py's PATCH recurrence endpoint used to skip
    # this validation entirely, letting bad day names get saved and then
    # silently produce zero future orders instead of failing loudly.
    assert validate_twice_week_days(["Monday", "Someday"]) is not None
    assert validate_twice_week_days(["monday", "thursday"]) is not None  # case-sensitive


def test_is_valid_weekday_name():
    assert is_valid_weekday_name("Sunday") is True
    assert is_valid_weekday_name("sunday") is False
    assert is_valid_weekday_name("Someday") is False


# ── get_next_weekday_dates ──────────────────────────────────────────────────

def test_next_weekday_dates_finds_both_days_within_a_week():
    # 2026-01-05 is a Monday.
    monday = date(2026, 1, 5)
    dates = get_next_weekday_dates(monday, ["Monday", "Thursday"])
    assert dates == [date(2026, 1, 8), date(2026, 1, 12)]


def test_next_weekday_dates_is_strictly_after_from_date():
    # Asking from a Monday for "Monday" should return NEXT Monday, not today.
    monday = date(2026, 1, 5)
    dates = get_next_weekday_dates(monday, ["Monday"])
    assert dates == [date(2026, 1, 12)]


def test_next_weekday_dates_ignores_unrecognized_names():
    monday = date(2026, 1, 5)
    dates = get_next_weekday_dates(monday, ["Monday", "Someday"])
    assert dates == [date(2026, 1, 12)]


def test_next_weekday_dates_all_invalid_returns_empty():
    monday = date(2026, 1, 5)
    assert get_next_weekday_dates(monday, ["Someday", "Otherday"]) == []


# ── compute_next_occurrence_dates ───────────────────────────────────────────

def test_weekly_adds_seven_days():
    start = date(2026, 1, 5)
    assert compute_next_occurrence_dates(start, "weekly") == [date(2026, 1, 12)]


def test_biweekly_adds_fourteen_days():
    start = date(2026, 1, 5)
    assert compute_next_occurrence_dates(start, "biweekly") == [date(2026, 1, 19)]


def test_twice_week_delegates_to_weekday_dates():
    start = date(2026, 1, 5)  # Monday
    result = compute_next_occurrence_dates(start, "twice_week", ["Monday", "Thursday"])
    assert result == [date(2026, 1, 8), date(2026, 1, 12)]


def test_twice_week_invalid_days_returns_none_not_empty_list():
    start = date(2026, 1, 5)
    assert compute_next_occurrence_dates(start, "twice_week", ["Monday"]) is None


def test_once_returns_none():
    assert compute_next_occurrence_dates(date(2026, 1, 5), "once") is None


def test_unknown_recurrence_type_returns_none():
    assert compute_next_occurrence_dates(date(2026, 1, 5), "monthly") is None


def test_recurrence_type_is_case_and_whitespace_insensitive():
    start = date(2026, 1, 5)
    assert compute_next_occurrence_dates(start, "  WEEKLY  ") == [date(2026, 1, 12)]


# ── filter_dates_within_end_date ────────────────────────────────────────────

def test_filter_keeps_dates_on_or_before_end_date():
    dates = [date(2026, 1, 8), date(2026, 1, 12), date(2026, 1, 15)]
    result = filter_dates_within_end_date(dates, date(2026, 1, 12))
    assert result == [date(2026, 1, 8), date(2026, 1, 12)]


def test_filter_with_no_end_date_keeps_everything():
    dates = [date(2026, 1, 8), date(2026, 1, 12)]
    assert filter_dates_within_end_date(dates, None) == dates


def test_filter_all_dates_past_end_date_returns_empty():
    dates = [date(2026, 2, 1), date(2026, 2, 8)]
    assert filter_dates_within_end_date(dates, date(2026, 1, 1)) == []
