"""Cost accounting. Wrong numbers here are worse than none -- they get believed."""
from __future__ import annotations

import pytest

from career_agent import config


class TestPricing:
    def test_known_model_uses_its_own_price(self):
        assert config.price_for("gemini-2.5-flash-lite") == (0.10, 0.40)

    def test_unknown_model_falls_back(self):
        """An unpriced model must still produce a number, and runs report which
        models were unpriced so the total is never silently understated."""
        assert config.price_for("gemini-99-imaginary") == (1.50, 7.50)

    def test_cost_is_per_million_tokens(self):
        # 1M input at $1.50 + 1M output at $7.50
        assert config.cost_usd("gemini-3.6-flash", 1_000_000, 1_000_000) == pytest.approx(9.00)

    def test_zero_usage_costs_nothing(self):
        assert config.cost_usd("gemini-3.6-flash", 0, 0) == 0

    def test_input_and_output_are_priced_differently(self):
        """Output is 5x input on flash; swapping them would understate a
        thinking-heavy run badly."""
        in_heavy = config.cost_usd("gemini-3.6-flash", 100_000, 0)
        out_heavy = config.cost_usd("gemini-3.6-flash", 0, 100_000)
        assert out_heavy > in_heavy


class TestEvaluatorFingerprint:
    def test_changes_with_the_model(self, monkeypatch):
        """The fingerprint is what lets a skip be revisited when the thing that
        made the judgment changes."""
        before = config.evaluator_fingerprint()
        monkeypatch.setattr(config, "EVALUATOR_MODEL", "some-other-model")
        assert config.evaluator_fingerprint() != before

    def test_stable_when_nothing_changes(self):
        assert config.evaluator_fingerprint() == config.evaluator_fingerprint()
