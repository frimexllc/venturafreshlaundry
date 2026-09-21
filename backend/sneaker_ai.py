"""
AI Sneaker Pricing — Groq vision-powered shoe assessment.

Flow: an operator (or the public quote flow) submits up to 3 photos of a
pair of shoes/sneakers. A Groq multimodal model classifies the item
(brand, model, materials, dirt level, cleaning complexity) and the
backend combines that with the business's own pricing rules to produce
a suggested price. The AI never charges anything on its own — it only
returns a recommendation that a human must accept, edit, or reject.
"""
import base64
import json
import logging
import os
from typing import List, Optional

from groq import Groq

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
VISION_MODEL = "qwen/qwen3.8-27b"

MAX_IMAGES_PER_ANALYSIS = 3
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # keep well under Groq's 20MB request cap for 3 images combined

# ── Pricing rules ────────────────────────────────────────────────────────
# Base price depends on how many pairs are already in this order (or quote):
# 1st pair, 2nd pair, then a flat rate from the 3rd pair on.
SNEAKER_BASE_PRICE_TIERS = [12.00, 10.00, 8.00]  # index 0 = 1st pair, 1 = 2nd, 2+ = 3rd and beyond

# Extra charge the AI can suggest on top of the base price, based on how
# soiled/complex the cleaning job looks. Shown to the operator as a
# separate line so it's clear the number isn't hidden inside a flat fee.
SNEAKER_COMPLEXITY_EXTRA_CHARGE = {
    "low": 0.00,
    "medium": 5.00,
    "high": 10.00,
}

VALID_DIRT_LEVELS = {"light", "moderate", "heavy", "extreme"}
VALID_COMPLEXITY = {"low", "medium", "high"}


def get_sneaker_base_price(pair_index: int) -> float:
    """pair_index is 1-based: 1 = first pair in this order/quote, 2 = second, 3+ = flat rate."""
    idx = max(1, pair_index) - 1
    if idx < len(SNEAKER_BASE_PRICE_TIERS):
        return SNEAKER_BASE_PRICE_TIERS[idx]
    return SNEAKER_BASE_PRICE_TIERS[-1]


def get_sneaker_extra_charge(cleaning_complexity: str) -> float:
    return SNEAKER_COMPLEXITY_EXTRA_CHARGE.get((cleaning_complexity or "").lower(), 0.00)


ANALYSIS_PROMPT = """You are an expert at assessing footwear for a professional shoe-cleaning \
service. Look carefully at the photo(s) provided (they may show different angles of the SAME \
pair: overall view, sole/damage close-up, brand tag close-up).

Respond with ONLY a JSON object (no markdown, no extra text) with exactly these keys:
- "type": general footwear category, e.g. "sneaker", "running shoe", "boot", "dress shoe"
- "brand": the brand name if you can identify it with reasonable confidence, else null
- "model": the specific model name if identifiable, else null
- "materials": array of strings, e.g. ["leather", "mesh", "rubber"]
- "dirt_level": one of "light", "moderate", "heavy", "extreme"
- "condition_notes": short free-text description of stains, mud, scuffs, yellowing, wear, etc.
- "cleaning_complexity": one of "low", "medium", "high" — how difficult/risky this cleaning job is
- "estimated_value_range": a short string like "$140-190", or "unknown" if you can't tell
- "recommended_service": a short label, e.g. "Standard Sneaker Cleaning", "Deep Sneaker Cleaning", \
"Delicate Material Cleaning"
- "confidence": a float from 0 to 1 for your overall confidence in this assessment

If the photos do not clearly show a shoe, set "type" to "unknown" and "confidence" to 0.
Be honest about uncertainty rather than guessing a brand/model you cannot actually identify."""


def _image_to_data_url(image_bytes: bytes, content_type: str = "image/jpeg") -> str:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{content_type};base64,{b64}"


def _normalize_ai_result(raw: dict) -> dict:
    """Clamp/validate the model's JSON so a malformed field never breaks pricing."""
    dirt_level = str(raw.get("dirt_level") or "").lower()
    if dirt_level not in VALID_DIRT_LEVELS:
        dirt_level = "moderate"

    complexity = str(raw.get("cleaning_complexity") or "").lower()
    if complexity not in VALID_COMPLEXITY:
        complexity = "medium"

    try:
        confidence = float(raw.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    materials = raw.get("materials")
    if not isinstance(materials, list):
        materials = [str(materials)] if materials else []

    return {
        "type": raw.get("type") or "unknown",
        "brand": raw.get("brand"),
        "model": raw.get("model"),
        "materials": [str(m) for m in materials],
        "dirt_level": dirt_level,
        "condition_notes": raw.get("condition_notes") or "",
        "cleaning_complexity": complexity,
        "estimated_value_range": raw.get("estimated_value_range") or "unknown",
        "recommended_service": raw.get("recommended_service") or "Standard Sneaker Cleaning",
        "confidence": confidence,
    }


async def analyze_sneaker_photos(image_data_list: List[bytes], notes: Optional[str] = None) -> dict:
    """
    Send up to MAX_IMAGES_PER_ANALYSIS photos to the Groq vision model and
    return a normalized assessment dict. Raises RuntimeError on any failure
    (missing key, API error, unparsable response) so the caller can turn
    that into a clean HTTP error instead of silently guessing.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")
    if not image_data_list:
        raise RuntimeError("At least one photo is required")
    if len(image_data_list) > MAX_IMAGES_PER_ANALYSIS:
        raise RuntimeError(f"At most {MAX_IMAGES_PER_ANALYSIS} photos are supported per analysis")

    content = [{"type": "text", "text": ANALYSIS_PROMPT + (f"\n\nOperator notes: {notes}" if notes else "")}]
    for img_bytes in image_data_list:
        if len(img_bytes) > MAX_IMAGE_BYTES:
            raise RuntimeError("One of the photos is too large")
        content.append({"type": "image_url", "image_url": {"url": _image_to_data_url(img_bytes)}})

    client = Groq(api_key=GROQ_API_KEY)
    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{"role": "user", "content": content}],
            temperature=0.3,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.error(f"Groq vision call failed: {e}")
        raise RuntimeError("AI analysis request failed") from e

    raw_text = response.choices[0].message.content
    try:
        raw = json.loads(raw_text)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Groq vision returned unparsable JSON: {raw_text!r}")
        raise RuntimeError("AI returned an unreadable response") from e

    result = _normalize_ai_result(raw)

    usage = getattr(response, "usage", None)
    logger.info(
        f"Sneaker AI analysis: brand={result['brand']} dirt={result['dirt_level']} "
        f"complexity={result['cleaning_complexity']} confidence={result['confidence']} "
        f"tokens={getattr(usage, 'total_tokens', 'n/a')}"
    )
    return result


def build_pricing(pair_index: int, ai_result: dict) -> dict:
    base_price = get_sneaker_base_price(pair_index)
    extra_charge = get_sneaker_extra_charge(ai_result.get("cleaning_complexity"))
    return {
        "pair_index": pair_index,
        "base_price": base_price,
        "extra_charge": extra_charge,
        "suggested_total": round(base_price + extra_charge, 2),
    }
