"""Multi-provider free-tier LLM fallback.

Primary: OpenRouter's free models (ported from the stock-dashboard pattern,
dashboard/app.py:540-547) -- but OpenRouter's free tier shares ONE 50-req/day
cap across every :free model, account-wide (confirmed live 2026-07-24: a
429 on one model showed the same daily cap hit on every other model tried
right after). That's a real ceiling for a shared-key SaaS backend, not just
a dev-testing inconvenience -- verify capacity math before relying on this
tier alone in production.

Backup: Groq, added as a second tier tried only after every OpenRouter
model has failed. Groq's free tier is rate-limited per-model (RPM/RPD),
not pooled account-wide like OpenRouter's, and is served on Groq's LPU
hardware (materially faster than OpenRouter's community-hosted free
models) -- confirmed via console.groq.com/docs/rate-limits and
console.groq.com/docs/models, 2026-07-24. Skipped entirely (not an error)
if GROQ_API_KEY isn't set, so this stays a true backup, not a hard
dependency.

Both are OpenAI-compatible APIs, so both tiers reuse the same ChatOpenAI
client shape with just base_url/api_key/model swapped.
"""

import os
from typing import List, Optional

from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI

# ==================== OpenRouter (primary) ====================
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Verified live 2026-07-24 against https://openrouter.ai/api/v1/models
# (filter id.endswith(':free')). Free model IDs churn -- 5 of the
# dashboard's original 7 had already rotted when this was checked.
# nemotron-3-super-120b-a12b kept first per the dashboard's empirical
# finding (2026-07-02) that it survives congestion better than more
# popular defaults.
OPENROUTER_MODELS = [
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
OPENROUTER_REASONING_MODELS = {
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "nvidia/nemotron-nano-9b-v2:free",
}

# ==================== Groq (backup) ====================
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Verified live 2026-07-24 against console.groq.com/docs/models (production
# tier only -- preview/deprecated models excluded as unstable for a
# fallback chain). Ordered by quality first, then speed: 70B for the best
# tailoring quality, smaller/faster models as the tier degrades.
GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-20b",
]


class AllModelsExhaustedError(RuntimeError):
    def __init__(self, errors: dict):
        self.errors = errors
        detail = "; ".join(f"{model}: {err}" for model, err in errors.items())
        super().__init__(f"All free-tier LLM providers failed: {detail}")


def _build_llm(
    model: str, base_url: str, api_key: str, max_tokens: int,
    temperature: float, json_mode: bool, reasoning: bool,
) -> ChatOpenAI:
    model_kwargs: dict = {}
    if reasoning:
        model_kwargs["reasoning"] = {"effort": "low", "exclude": True}
    if json_mode:
        model_kwargs["response_format"] = {"type": "json_object"}

    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=temperature,
        max_tokens=max_tokens,
        model_kwargs=model_kwargs,
        # Confirmed live (2026-07-26): with neither set, LangChain's default
        # retry-with-backoff plus no request timeout means one congested
        # free-tier model can silently eat tens of seconds before this loop
        # ever reaches the next provider -- directly responsible for a
        # search going from 69s to 118s with zero code change between runs.
        # We already have our own multi-model fallback below; a single fast
        # failure per model beats LangChain retrying the same slow one.
        # Scaled off max_tokens (floor 15s, cap 60s, ~30 tokens/sec) rather
        # than a flat value -- the short agentic_search JSON calls (400-1500
        # tokens) need to fail fast, but the long-form resume/cover-letter
        # generations elsewhere (up to 2500 tokens) legitimately need more
        # wall-clock time on a slow free model and shouldn't get cut off
        # before they'd have succeeded.
        timeout=max(15, min(60, max_tokens // 30)),
        max_retries=0,
    )


def _provider_tiers():
    """Yields (provider_name, base_url, api_key, model, is_reasoning) for
    every model across every configured provider, in fallback order.
    Providers with no API key set are skipped silently -- that's how Groq
    stays an optional backup rather than a hard requirement."""
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        for model in OPENROUTER_MODELS:
            yield "openrouter", OPENROUTER_BASE_URL, openrouter_key, model, model in OPENROUTER_REASONING_MODELS

    groq_key = os.environ.get("GROQ_API_KEY")
    if groq_key:
        for model in GROQ_MODELS:
            yield "groq", GROQ_BASE_URL, groq_key, model, False


async def ainvoke_with_fallback(
    messages: List[BaseMessage],
    max_tokens: int = 2000,
    temperature: float = 0.2,
    json_mode: bool = False,
) -> str:
    """Try every model across every configured provider in order (OpenRouter
    free models first, then Groq as backup); fall through on any failure.

    Reasoning-model outputs need enough max_tokens headroom for the actual
    answer to arrive after the (excluded) reasoning trace, so callers doing
    short single-block generations should still pass a few hundred tokens
    of max_tokens, not the bare minimum for the visible text alone.
    """
    errors: dict = {}
    tried_any = False
    for provider, base_url, api_key, model, is_reasoning in _provider_tiers():
        tried_any = True
        key = f"{provider}:{model}"
        try:
            llm = _build_llm(model, base_url, api_key, max_tokens, temperature, json_mode, is_reasoning)
            response = await llm.ainvoke(messages)
            content = response.content if hasattr(response, "content") else str(response)
            if not content or not content.strip():
                errors[key] = "empty response"
                continue
            return content
        except Exception as exc:
            errors[key] = str(exc)[:200]
            continue

    if not tried_any:
        raise RuntimeError("No LLM provider configured -- set OPENROUTER_API_KEY (and optionally GROQ_API_KEY)")
    raise AllModelsExhaustedError(errors)
