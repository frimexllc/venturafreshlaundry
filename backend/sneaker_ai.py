"""
AI Sneaker Pricing — Groq vision-powered shoe assessment.

Flow: an operator (or the public quote flow) submits up to 3 photos of a
pair of shoes/sneakers. A Groq multimodal model classifies the item
(brand, model, materials, dirt level, cleaning complexity) and the
backend combines that with the business's own pricing rules to produce
a suggested price. The AI never charges anything on its own — it only
returns a recommendation that a human must accept, edit, or reject.
"""
import asyncio
import base64
import json
import logging
import os
from typing import List, Optional

from groq import Groq

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
VISION_MODEL = "qwen/qwen3.8-27b"
# The grouping step below is text-only (comparing JSON fingerprints, no
# images), but this Groq account's available models are limited to a
# handful (confirmed via models.list()) that doesn't include a small
# Llama text model, so it reuses the same vision model in text-only mode.
TEXT_MODEL = VISION_MODEL

# Hard API limit, not a design choice: Groq's vision models reject a request
# with more than 3 images ("Too many images provided. This model supports up
# to 3 images"), confirmed by testing directly against the API. This is why
# grouping (see below) can't just show the model all the photos at once and
# ask it to sort them — each vision call is capped at 3 images regardless of
# what we're asking about.
MAX_IMAGES_PER_ANALYSIS = 3
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # keep well under Groq's 20MB request cap for 3 images combined

MAX_PHOTOS_PER_GROUPING = 12

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


# ── Photo grouping (auto-detect pairs from an unsorted batch) ──────────────
#
# The operator can dump up to MAX_PHOTOS_PER_GROUPING unsorted photos and
# have the AI suggest which ones belong to the same physical pair, instead
# of manually building each pair group one photo at a time. Because a
# single vision call is capped at 3 images (see MAX_IMAGES_PER_ANALYSIS),
# this can't just show the model everything at once — it's a two-step
# process: fingerprint each photo individually (compact visual description,
# not the full pricing assessment), then a separate text-only call compares
# the fingerprints and proposes a grouping. This is a *suggestion* — the
# operator reviews and can move photos between groups before anything is
# priced, since fingerprint-based grouping is inherently imperfect (an
# "overall view" and a "sole close-up" of the SAME pair can look quite
# different from each other).

FINGERPRINT_PROMPT = """You are helping sort a pile of shoe photos so photos of the SAME physical \
pair of shoes can be grouped together, before a separate step prices each pair. Look at this ONE \
photo and describe it compactly so it can be compared against other photos.

Respond with ONLY a JSON object (no markdown, no extra text) with exactly these keys:
- "shoe_type": general category, e.g. "sneaker", "boot", "sandal", or "unknown" if no shoe is visible
- "colors": array of the 1-3 dominant colors, e.g. ["white", "orange"]
- "brand_visible": the brand name if a logo/tag is readable in this photo, else null
- "pattern_notes": short free-text on distinctive visual features (sole color/shape, laces, stripes, \
material texture, damage/stains) that would help tell this pair apart from a similar-looking pair
- "angle": one of "overall", "sole", "tag_or_label", "other" — what this photo is a view of"""


async def fingerprint_photo(image_bytes: bytes) -> dict:
    """Compact visual description of ONE photo, used only to compare photos
    against each other for grouping — not the full pricing assessment."""
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise RuntimeError("One of the photos is too large")

    client = Groq(api_key=GROQ_API_KEY)
    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": FINGERPRINT_PROMPT},
                    {"type": "image_url", "image_url": {"url": _image_to_data_url(image_bytes)}},
                ],
            }],
            temperature=0.2,
            max_tokens=250,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.error(f"Groq fingerprint call failed: {e}")
        raise RuntimeError("AI photo comparison request failed") from e

    raw_text = response.choices[0].message.content
    try:
        return json.loads(raw_text)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"Groq fingerprint returned unparsable JSON: {raw_text!r}")
        raise RuntimeError("AI returned an unreadable response") from e


GROUPING_PROMPT = """You will be given a JSON array of compact visual descriptions, one per photo, \
each tagged with its index. Some of these photos show DIFFERENT ANGLES OF THE SAME physical pair of \
shoes (e.g. an overall view, a sole close-up, and a brand tag close-up can look quite different from \
each other even though they're the same pair) — group those together. Photos of visibly different \
pairs (different colors, patterns, or brands) must NOT be grouped together.

Respond with ONLY a JSON object (no markdown, no extra text) with exactly this key:
- "groups": an array of arrays of photo indices, e.g. [[0, 2], [1], [3, 4, 5]] — every index from the \
input must appear in EXACTLY ONE group. A photo that doesn't clearly match any other becomes its own \
single-item group. Prefer grouping a photo tagged "overall" with any nearby "sole" or "tag_or_label" \
photo that shares its colors, over leaving photos ungrouped."""


async def suggest_photo_grouping(fingerprints: List[dict]) -> List[List[int]]:
    """Given one fingerprint per photo (already fetched via fingerprint_photo,
    in the same order as the original photos), asks the model to propose
    which photo indices belong to the same physical pair.

    Falls back to "every photo is its own pair" (the safest possible
    default — never merges photos that shouldn't be merged) if the model's
    response can't be parsed or doesn't account for every index exactly
    once, so a flaky grouping call degrades to "no grouping" instead of
    silently corrupting pricing.
    """
    n = len(fingerprints)
    safe_fallback = [[i] for i in range(n)]
    if n <= 1:
        return safe_fallback
    if not GROQ_API_KEY:
        return safe_fallback

    indexed = [{"index": i, **fp} for i, fp in enumerate(fingerprints)]
    client = Groq(api_key=GROQ_API_KEY)
    try:
        response = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{
                "role": "user",
                "content": GROUPING_PROMPT + "\n\n" + json.dumps(indexed),
            }],
            temperature=0.1,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        raw = json.loads(response.choices[0].message.content)
        groups = raw.get("groups")
        if not isinstance(groups, list):
            raise ValueError("no 'groups' list in response")

        seen = set()
        cleaned: List[List[int]] = []
        for group in groups:
            valid_group = [i for i in group if isinstance(i, int) and 0 <= i < n and i not in seen]
            if valid_group:
                seen.update(valid_group)
                cleaned.append(valid_group)
        # Any index the model dropped becomes its own group, so grouping
        # never loses a photo even if the model's output was incomplete.
        for i in range(n):
            if i not in seen:
                cleaned.append([i])
        return cleaned
    except Exception as e:
        logger.warning(f"Photo grouping failed, falling back to ungrouped: {e}")
        return safe_fallback


async def group_sneaker_photos(image_data_list: List[bytes]) -> List[List[int]]:
    """Fingerprints every photo (one Groq vision call each) then asks the
    model to propose a pair grouping. Returns a list of index-groups into
    `image_data_list`. Always returns a safe "ungrouped" result rather than
    raising when the AI step fails, so a partial AI failure never blocks
    the operator from grouping photos manually instead — only an oversized
    batch (more than MAX_PHOTOS_PER_GROUPING) raises.
    """
    if not image_data_list:
        return []
    if len(image_data_list) > MAX_PHOTOS_PER_GROUPING:
        raise RuntimeError(f"At most {MAX_PHOTOS_PER_GROUPING} photos are supported per grouping request")

    async def _safe_fingerprint(img: bytes, idx: int) -> dict:
        try:
            return await fingerprint_photo(img)
        except RuntimeError as e:
            logger.warning(f"Fingerprinting photo {idx} failed: {e}")
            return {"shoe_type": "unknown", "colors": [], "brand_visible": None, "pattern_notes": "", "angle": "other"}

    fingerprints = await asyncio.gather(*[
        _safe_fingerprint(img, i) for i, img in enumerate(image_data_list)
    ])
    return await suggest_photo_grouping(list(fingerprints))
