from pydantic import ValidationError
import pytest

from career_agent.models import JobEvaluation
from career_agent.schemas import JobVerdict


def test_verdict_uses_real_match_strength_labels():
    verdict = JobVerdict(
        match=True,
        match_strength="medium",
        reasoning="Eligible, but evidence is incomplete.",
    )

    assert verdict.match_strength == "medium"


def test_verdict_rejects_invented_match_strength_label():
    with pytest.raises(ValidationError):
        JobVerdict(match=True, match_strength="excellent", reasoning="Invalid label.")


def test_historical_evaluation_defaults_to_unscored():
    evaluation = JobEvaluation(
        job_id="job-1",
        match=True,
        unmet_requirements=[],
        reasoning="Stored before strength labels existed.",
    )

    assert evaluation.match_strength == "unscored"
