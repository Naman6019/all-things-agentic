"""Compare candidate evaluator models on the same real postings.

Evaluation is ~89% of a run's cost, so it is the stage worth moving to a
cheaper model -- but only if the verdicts hold up. This measures that instead
of guessing, and it is why EVALUATOR_MODEL should never be changed on vibes.

    python benchmark_evaluators.py --jobs 20 \
        --models gemini-3.6-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite

The first model listed is the reference; the rest are scored against it.

Touches no Firestore state: it fetches and pre-filters through the real
pipeline path, then evaluates in memory. Nothing is marked seen, no
application docs are written, so it can be re-run freely.

Read the disagreements, not just the percentage. They are weighted unevenly:
a false MATCH costs one wasted drafting call and some digest clutter, while a
false SKIP hides a real job from you. A model that only disagrees by matching
more is far safer than one that skips more.
"""
from __future__ import annotations

import argparse
import asyncio
import time
import warnings

warnings.filterwarnings("ignore")

from career_agent import agent, config, matching, pipeline
from career_agent.models import JobListing
from career_agent.schemas import JobVerdict
from career_agent.tools import job_tools


async def _collect(limit: int) -> list[JobListing]:
    """Same fetch and pre-filter the pipeline uses, so the sample is realistic."""
    jobs, errors = await job_tools._fetch_all_sources()
    if errors:
        print(f"  (sources that failed: {', '.join(errors)})")
    relevant, filtered = matching.prefilter(jobs, config.load_candidate_profile())
    print(f"  {len(jobs)} fetched, {len(relevant)} relevant, filtered {filtered}")
    return relevant[:limit]


async def _evaluate_all(model: str, jobs: list[JobListing], profile_block: str):
    """Runs one model over every job, returning verdicts, cost and elapsed time."""
    evaluator = agent.LlmAgent(
        model=agent._model(model),
        name=f"bench_{model.replace('.', '_').replace('-', '_')}",
        description="Benchmark evaluator.",
        instruction=agent.EVALUATOR_INSTRUCTIONS,
        output_schema=JobVerdict,
    )
    usage: dict[str, dict[str, int]] = {}
    verdicts: list[JobVerdict | None] = []
    started = time.monotonic()

    for job in jobs:
        prompt = f"CANDIDATE PROFILE\n{profile_block}\n\nJOB POSTING\n{pipeline._job_block(job)}"
        try:
            verdicts.append(await pipeline._ask(evaluator, model, prompt, JobVerdict, usage))
        except Exception as e:  # noqa: BLE001 - a model that cannot answer is a result
            print(f"    ! {model} failed on {job.job_id}: {type(e).__name__}: {str(e)[:80]}")
            verdicts.append(None)

    total_cost, _, tokens = pipeline._summarize_cost(usage)
    return verdicts, total_cost, tokens, time.monotonic() - started


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jobs", type=int, default=20, help="postings to evaluate (default 20)")
    parser.add_argument(
        "--models",
        default="gemini-3.6-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite",
        help="comma-separated; the FIRST is the reference",
    )
    args = parser.parse_args()
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    reference, candidates = models[0], models[1:]

    print(f"Collecting up to {args.jobs} postings...")
    jobs = await _collect(args.jobs)
    if not jobs:
        print("No jobs survived the pre-filter; nothing to benchmark.")
        return
    print(f"Benchmarking {len(jobs)} postings across {len(models)} models.\n")

    profile_block = pipeline._profile_block()
    results = {}
    for model in models:
        print(f"Running {model}...")
        results[model] = await _evaluate_all(model, jobs, profile_block)

    ref_verdicts = results[reference][0]
    ref_cost = results[reference][1]

    print(f"\n{'model':28} {'agree':>7} {'matches':>8} {'cost':>9} {'vs ref':>8} {'time':>7}")
    print("-" * 72)
    for model in models:
        verdicts, cost, _tokens, elapsed = results[model]
        matches = sum(1 for v in verdicts if v and v.match)
        if model == reference:
            print(f"{model:28} {'(ref)':>7} {matches:>8} {cost:>9.4f} {'-':>8} {elapsed:>6.0f}s")
            continue
        comparable = [(r, c) for r, c in zip(ref_verdicts, verdicts) if r and c]
        agreed = sum(1 for r, c in comparable if r.match == c.match)
        pct = (agreed / len(comparable) * 100) if comparable else 0
        ratio = f"{ref_cost / cost:.1f}x" if cost else "n/a"
        print(f"{model:28} {pct:>6.0f}% {matches:>8} {cost:>9.4f} {ratio:>8} {elapsed:>6.0f}s")

    for model in candidates:
        verdicts = results[model][0]
        rows = [
            (job, r, c)
            for job, r, c in zip(jobs, ref_verdicts, verdicts)
            if r and c and r.match != c.match
        ]
        print(f"\n=== {model}: {len(rows)} disagreement(s) vs {reference} ===")
        for job, ref_v, cand_v in rows:
            # A candidate that SKIPS what the reference MATCHED is the dangerous
            # direction -- that job would be lost.
            direction = "SKIPS a reference MATCH" if ref_v.match else "MATCHES a reference SKIP"
            print(f"\n  [{direction}] {job.title} @ {job.company}")
            print(f"    {reference:26} match={ref_v.match}  {ref_v.reasoning[:150]}")
            print(f"    {model:26} match={cand_v.match}  {cand_v.reasoning[:150]}")
            if cand_v.unmet_requirements:
                print(f"    {'':26} unmet: {cand_v.unmet_requirements}")


if __name__ == "__main__":
    asyncio.run(main())
