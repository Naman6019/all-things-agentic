"""Langfuse telemetry and observability layer for Career Agent.

Provides production-grade tracing for agent runs, LLM generations, token usage,
costs, latencies, and evaluations.

If LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY are not configured, all telemetry
falls back gracefully to a zero-overhead No-Op handler so local dev, offline
testing, and CI runs proceed without error or network traffic.
"""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Any

from . import config

logger = logging.getLogger("career_agent.telemetry")

_client = None


class NoOpSpan:
    """Mock span that silently absorbs calls when Langfuse is disabled."""

    def __init__(self, *args, **kwargs):
        self.id = "noop-span"

    def end(self, *args, **kwargs):
        pass

    def update(self, *args, **kwargs):
        return self

    def event(self, *args, **kwargs):
        pass

    def span(self, *args, **kwargs):
        return self

    def generation(self, *args, **kwargs):
        return self

    def score(self, *args, **kwargs):
        pass


class NoOpTrace:
    """Mock trace that silently absorbs calls when Langfuse is disabled."""

    def __init__(self, *args, **kwargs):
        self.id = "noop-trace"

    def span(self, *args, **kwargs):
        return NoOpSpan()

    def generation(self, *args, **kwargs):
        return NoOpSpan()

    def score(self, *args, **kwargs):
        pass

    def update(self, *args, **kwargs):
        return self


class NoOpLangfuse:
    """Mock Langfuse client for offline/unconfigured environments."""

    def trace(self, *args, **kwargs):
        return NoOpTrace()

    def span(self, *args, **kwargs):
        return NoOpSpan()

    def generation(self, *args, **kwargs):
        return NoOpSpan()

    def score(self, *args, **kwargs):
        pass

    def flush(self):
        pass

    def shutdown(self):
        pass


def get_langfuse():
    """Initializes and returns the Langfuse client singleton or NoOp fallback."""
    global _client
    if _client is not None:
        return _client

    if not config.ENABLE_LANGFUSE:
        _client = NoOpLangfuse()
        return _client

    try:
        from langfuse import Langfuse

        _client = Langfuse(
            public_key=config.LANGFUSE_PUBLIC_KEY,
            secret_key=config.LANGFUSE_SECRET_KEY,
            host=config.LANGFUSE_HOST,
        )
        logger.info("Langfuse observability initialized successfully.")
    except Exception as exc:
        logger.warning(f"Failed to initialize Langfuse ({exc}); falling back to NoOp handler.")
        _client = NoOpLangfuse()

    return _client


def create_pipeline_trace(
    run_id: str,
    user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
):
    """Creates a root trace for one Job Pipeline run."""
    client = get_langfuse()
    user = user_id or config.USER_ID
    all_tags = ["career-agent", "taskmaster"] + (tags or [])
    try:
        return client.trace(
            id=f"run-{run_id}",
            name="Career Agent Run",
            user_id=user,
            metadata={
                "run_id": run_id,
                "evaluator_model": config.EVALUATOR_MODEL,
                "drafter_model": config.DRAFTER_MODEL,
                **(metadata or {}),
            },
            tags=all_tags,
        )
    except Exception as exc:
        logger.warning(f"Error creating trace: {exc}")
        return NoOpTrace()


@contextmanager
def trace_span(trace: Any, name: str, input_data: Any = None, metadata: dict[str, Any] | None = None):
    """Context manager for tracing an individual graph node / execution span."""
    span_obj = None
    start_time = time.time()
    try:
        if trace and hasattr(trace, "span"):
            span_obj = trace.span(
                name=name,
                input=input_data,
                metadata=metadata or {},
                start_time=start_time,
            )
    except Exception as exc:
        logger.debug(f"Span start error: {exc}")
        span_obj = NoOpSpan()

    try:
        yield span_obj
    finally:
        duration = time.time() - start_time
        try:
            if span_obj and hasattr(span_obj, "end"):
                span_obj.end(end_time=time.time())
        except Exception:
            pass


def record_generation(
    trace: Any,
    name: str,
    model: str,
    input_messages: Any,
    output_text: Any,
    usage: Any = None,
    metadata: dict[str, Any] | None = None,
):
    """Records an LLM generation event (Evaluator or Drafter)."""
    if not trace:
        return

    usage_dict = None
    if usage:
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        thinking_tokens = getattr(usage, "thoughts_token_count", 0) or 0
        total_tokens = getattr(usage, "total_token_count", 0) or (input_tokens + output_tokens + thinking_tokens)
        usage_dict = {
            "input": input_tokens,
            "output": output_tokens + thinking_tokens,
            "total": total_tokens,
        }

    try:
        if hasattr(trace, "generation"):
            trace.generation(
                name=name,
                model=model,
                input=input_messages,
                output=output_text,
                usage=usage_dict,
                metadata=metadata or {},
            )
    except Exception as exc:
        logger.debug(f"Generation record error: {exc}")


def record_score(trace: Any, name: str, value: float, comment: str | None = None):
    """Records a quantitative evaluation score on a trace."""
    if not trace:
        return
    try:
        if hasattr(trace, "score"):
            trace.score(name=name, value=value, comment=comment)
    except Exception as exc:
        logger.debug(f"Score record error: {exc}")


def flush():
    """Flushes buffered events to Langfuse."""
    try:
        client = get_langfuse()
        if hasattr(client, "flush"):
            client.flush()
    except Exception:
        pass
