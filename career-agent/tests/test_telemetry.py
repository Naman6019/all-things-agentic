"""Tests for the Langfuse telemetry and observability layer."""
import pytest
from career_agent import telemetry


def test_noop_telemetry_when_disabled(monkeypatch):
    monkeypatch.setattr(telemetry.config, "ENABLE_LANGFUSE", False)
    telemetry._client = None

    client = telemetry.get_langfuse()
    assert isinstance(client, telemetry.NoOpLangfuse)

    trace = telemetry.create_pipeline_trace("test-run-123", user_id="test-user")
    assert isinstance(trace, telemetry.NoOpTrace)

    with telemetry.trace_span(trace, "test-span", input_data={"foo": "bar"}) as span:
        assert isinstance(span, telemetry.NoOpSpan)

    # Calling generation, score, flush should execute safely without exception
    telemetry.record_generation(
        trace=trace,
        name="test-gen",
        model="gemini-3.6-flash",
        input_messages="hello",
        output_text="world",
        usage=None,
    )
    telemetry.record_score(trace, "fit_score", 0.95)
    telemetry.flush()


def test_telemetry_usage_parsing():
    class DummyUsage:
        prompt_token_count = 100
        candidates_token_count = 50
        thoughts_token_count = 25
        total_token_count = 175

    recorded = []

    class MockTrace:
        def generation(self, **kwargs):
            recorded.append(kwargs)

    mock_trace = MockTrace()
    telemetry.record_generation(
        trace=mock_trace,
        name="Evaluator: Test Job",
        model="gemini-3.6-flash",
        input_messages="prompt",
        output_text="verdict",
        usage=DummyUsage(),
    )

    assert len(recorded) == 1
    assert recorded[0]["name"] == "Evaluator: Test Job"
    assert recorded[0]["usage"]["input"] == 100
    assert recorded[0]["usage"]["output"] == 75
    assert recorded[0]["usage"]["total"] == 175
