# Working on this project

Conventions here are the ones the codebase actually follows. Where a rule
exists because something went wrong, the reason is stated — a convention
without a reason gets dropped the first time it is inconvenient.

## Getting set up

```bash
conda create -n agentic python=3.11 -y && conda activate agentic
pip install -r career-agent/requirements-dev.txt
cp career-agent/.env.example career-agent/.env       # then fill it in
cp career-agent/profile.example.json career-agent/profile.json
```

`conda create -n agentic` **without** `python=3.11` produces an env with no
interpreter, and `conda run -n agentic python` then silently falls through to
whatever Python is on PATH. That cost an hour once.

## Running things

```bash
cd career-agent
python -m pytest                                # 235 offline tests, ~6s
uvicorn main:app --reload                       # then POST /run, browse /
python benchmark_evaluators.py --models gemini-3.6-flash,gemini-2.5-flash-lite
```

## Rules that exist for a reason

**Tests must run with no cloud account.** Every test is offline — no Firestore,
no model calls, no network. A suite that needs a GCP project and credentials is
a suite nobody runs. Anything needing live services goes behind the `network`
marker and stays out of the default run.

**Never let a job disappear silently.** The pipeline drops ~91% of postings
before any model call. Every drop is counted by reason, persisted to the run
summary, and shown in the digest and UI. If you add a filter, add its counter
in the same commit. A digest saying "3 evaluated" must never be
indistinguishable from "the sources only had 3 jobs".

**Claim dedupe only after the verdict is stored.** `mark_job_seen` runs after
`save_evaluation`, never at fetch time. The reverse ordering silently burned 11
jobs when a run hit a 429 partway: marked seen so no later run retried them,
unevaluated so they never reached a digest.

**Measure before trusting a cheaper model.** `benchmark_evaluators.py` scores a
candidate model against a reference on real postings and prints every
disagreement. A model that is 5x cheaper and finds zero matches in twenty jobs
is not a saving. That is a measured result, not a hypothetical.

**Never fetch LinkedIn, Indeed, Glassdoor or Wellfound.** Automated retrieval
there risks the user's account, which is why they are not sources. Quick-add
refuses those URLs and asks for pasted text instead. This is the constraint the
architecture is built around — see the guardrails section of
[hackathon-project-plan.md](hackathon-project-plan.md).

**The agent drafts and finds; a human sends.** Nothing in this codebase submits
an application, sends outreach, or clicks apply. The review UI is read-only by
design.

**Keep secrets out of the image.** `.dockerignore` excludes `.env` and
`profile.json`; the profile reaches Cloud Run as a mounted Secret Manager
volume. Before adding a file to the repo, ask whether it would be safe on a
public GitHub page — it is one.

## Code style

- **Comments explain why, not what.** Prefer noting the failure a line prevents
  over restating the line.
- **Docstrings on anything with a non-obvious contract**, especially where
  ordering carries a guarantee.
- Type hints on function signatures; `from __future__ import annotations` at
  the top of every module.
- Keep the model's judgment and the program's control flow separate. The model
  evaluates one job and drafts one application. Fetching, looping, capping,
  dedupe and digesting are Python — see the header of
  `career-agent/career_agent/agent.py` for the cost and correctness reasons.

## Commits

Explain the *why*, and record measurements when a change is justified by one.
Several commits here carry the numbers that motivated them (token counts,
agreement rates, jobs lost) because those numbers are the argument, and they
are otherwise lost.

Commits are authored with the GitHub noreply address; the repo is public.

## Dependencies

Pinned exactly in `requirements.txt`. An unpinned range meant a clone next week
could pull a breaking `google-adk` and conclude the project does not run. Bump
deliberately, then re-run `pytest` and one live `POST /run`.
