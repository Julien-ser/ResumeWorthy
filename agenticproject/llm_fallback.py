"""OpenRouter free-tier model fallback.

Ported from the stock-dashboard app.py pattern (dashboard/app.py:540-547):
popular/default free models eat the heaviest 429 rate-limit traffic on
OpenRouter, so less-used models survive better than the "obvious" choices.
OpenRouter's `models[]` fallback array does NOT reliably fall through on
429s for free-tier models (known upstream quirk), so this retries with a
fresh client per model instead of relying on OpenRouter's own fallback.

Free model IDs churn -- 5 of the dashboard's original 7 had already been
retired/renamed by OpenRouter when this list was verified live against
https://openrouter.ai/api/v1/models on 2026-07-24 (filter id.endswith(':free')).
Re-verify against that endpoint before trusting this list months from now.
"""

import os
from typing import List

from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Verified live 2026-07-24. nemotron-3-super-120b-a12b kept first per the
# dashboard's empirical finding (2026-07-02) that it survives congestion
# better than more popular defaults; the rest are the remaining live
# :free slugs, general-chat-capable ones preferred over
# task-specialized (content-safety, VL, code-only) variants.
FREE_MODELS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "google/gemma-4-26b-a4b-it:free",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "inclusionai/ling-3.0-flash:free",
]

# NVIDIA's nemotron-3 family are hybrid reasoning models that dump
# chain-of-thought into `content` and get truncated unless told to
# exclude it from the response.
REASONING_MODELS = {
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "nvidia/nemotron-nano-9b-v2:free",
}


class AllModelsExhaustedError(RuntimeError):
    def __init__(self, errors: dict):
        self.errors = errors
        detail = "; ".join(f"{model}: {err}" for model, err in errors.items())
        super().__init__(f"All free OpenRouter models failed: {detail}")


def _build_llm(model: str, max_tokens: int, temperature: float, json_mode: bool) -> ChatOpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    model_kwargs: dict = {}
    if model in REASONING_MODELS:
        model_kwargs["reasoning"] = {"effort": "low", "exclude": True}
    if json_mode:
        model_kwargs["response_format"] = {"type": "json_object"}

    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
        model_kwargs=model_kwargs,
    )


async def ainvoke_with_fallback(
    messages: List[BaseMessage],
    max_tokens: int = 2000,
    temperature: float = 0.2,
    json_mode: bool = False,
) -> str:
    """Try each free OpenRouter model in order; fall through on any failure.

    Reasoning-model outputs need enough max_tokens headroom for the actual
    answer to arrive after the (excluded) reasoning trace, so callers doing
    short single-block generations should still pass a few hundred tokens
    of max_tokens, not the bare minimum for the visible text alone.
    """
    errors: dict = {}
    for model in FREE_MODELS:
        try:
            llm = _build_llm(model, max_tokens, temperature, json_mode)
            response = await llm.ainvoke(messages)
            content = response.content if hasattr(response, "content") else str(response)
            if not content or not content.strip():
                errors[model] = "empty response"
                continue
            return content
        except Exception as exc:
            errors[model] = str(exc)[:200]
            continue
    raise AllModelsExhaustedError(errors)
