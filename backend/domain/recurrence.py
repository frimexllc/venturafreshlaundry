"""Pure order-recurrence business logic.

No database or HTTP framework imports. Covers computing the next
occurrence date(s) for a recurring order (weekly / biweekly / twice_week)
and validating the weekday names used for twice_week recurrence — logic
that used to be duplicated, with a hardcoded copy of the valid-weekday set
in routes/public_forms.py, and no validation at all in the
recurrence-update endpoint in routes/orders.py. That gap let a customer or
operator save unrecognized day names for a twice_week order, which would
then silently produce zero future orders instead of failing loudly.
"""

from datetime import date, timedelta
from typing import List, Optional

WEEKDAY_MAP = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2,
    "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6,
}

VALID_RECURRENCE_TYPES = {"once", "weekly", "biweekly", "twice_week"}

RECURRENCE_LABELS = {
    "once": "One time",
    "weekly": "Every week",
    "biweekly": "Every 2 weeks",
    "twice_week": "Twice a week",
}


def is_valid_weekday_name(name: str) -> bool:
    return name in WEEKDAY_MAP


def validate_twice_week_days(recurrence_days: Optional[List[str]]) -> Optional[str]:
    """Returns an error message if `recurrence_days` isn't a valid pair of
    weekday names for twice_week recurrence, or None if it's valid."""
    if not recurrence_days or len(recurrence_days) != 2:
        return "For twice_week recurrence, exactly two days must be provided"
    if not all(is_valid_weekday_name(day) for day in recurrence_days):
        return "Invalid day names. Use full weekday names in English"
    return None


def get_next_weekday_dates(from_date: date, weekday_names: List[str]) -> List[date]:
    """The next date for each of the given weekday names, strictly after
    from_date, searching up to three weeks ahead. Unrecognized weekday
    names are ignored, so an empty/all-invalid `weekday_names` list
    returns an empty result instead of raising."""
    target_nums = sorted({WEEKDAY_MAP[d] for d in weekday_names if d in WEEKDAY_MAP})
    results: List[date] = []
    if not target_nums:
        return results
    check = from_date + timedelta(days=1)
    for _ in range(21):
        if check.weekday() in target_nums and check not in results:
            results.append(check)
        if len(results) == len(target_nums):
            break
        check += timedelta(days=1)
    return results


def compute_next_occurrence_dates(
    pickup_date: date,
    recurrence: str,
    recurrence_days: Optional[List[str]] = None,
) -> Optional[List[date]]:
    """Candidate next-pickup dates for a recurrence type, before any
    recurrence_end_date filtering.

    Returns None for "once", an unrecognized recurrence type, or
    "twice_week" without exactly two valid days — the caller should treat
    None as a configuration problem worth logging, distinct from an empty
    list (which just means there's nothing left to schedule, e.g. because
    the recurrence end date has already passed).
    """
    recurrence = (recurrence or "once").strip().lower()
    if recurrence == "weekly":
        return [pickup_date + timedelta(days=7)]
    if recurrence == "biweekly":
        return [pickup_date + timedelta(days=14)]
    if recurrence == "twice_week":
        if validate_twice_week_days(recurrence_days) is not None:
            return None
        return get_next_weekday_dates(pickup_date, recurrence_days)
    return None


def filter_dates_within_end_date(dates: List[date], recurrence_end_date: Optional[date]) -> List[date]:
    """Keeps only dates on or before recurrence_end_date. No filtering
    happens if recurrence_end_date is None."""
    if recurrence_end_date is None:
        return list(dates)
    return [d for d in dates if d <= recurrence_end_date]
