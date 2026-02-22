import re
import unicodedata
from typing import Optional


def to_str(value: Optional[object]) -> str:
    return "" if value is None else str(value)


def normalize_spaces(value: Optional[object]) -> str:
    text = to_str(value).replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def strip_diacritics(value: Optional[object]) -> str:
    text = normalize_spaces(value)
    if not text:
        return ""
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )


def clean_text(value: Optional[object]) -> str:
    text = strip_diacritics(value).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_email(value: Optional[object]) -> str:
    text = clean_text(value)
    if not text:
        return ""
    match = re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", text)
    return match.group(0).lower() if match else ""


def normalize_phone(value: Optional[object]) -> str:
    digits = re.sub(r"\D", "", to_str(value))
    if not digits:
        return ""
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if digits.startswith("00"):
        return f"+{digits[2:]}"
    return f"+{digits}" if not digits.startswith("+") else digits


def normalize_name(value: Optional[object]) -> str:
    return normalize_spaces(value)


def normalize_address(value: Optional[object]) -> str:
    return normalize_spaces(value)


def normalize_yes_no(value: Optional[object]) -> str:
    text = clean_text(value)
    if text in {"yes", "y", "true", "1", "active", "member", "membership"}:
        return "yes"
    if text in {"no", "n", "false", "0", "inactive", "none"}:
        return "no"
    return text
