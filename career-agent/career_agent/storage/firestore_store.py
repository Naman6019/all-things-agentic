"""Firestore-backed state: the job corpus, per-user dedupe, and application tracking.

Collections:

  jobs/{job_id}
      The posting itself, including its full description. SHARED -- no user
      dimension, because a posting's text is identical for every candidate.
      Fetching is the shared half of this system and evaluation is the per-user
      half, so re-fetching and re-storing the same posting per user would be
      pure waste (and pointless extra load on the ATS boards).

  jobs_seen/{user_id}__{job_id}
      Per-user dedupe marker, written once a verdict exists for that user.

  applications/{user_id}__{job_id}
      Per-user verdict, plus tailored materials once drafted, plus a small
      denormalized copy of the display fields so the review UI needs one query
      rather than a second read per row.

  runs/{run_id}
      What one run fetched, filtered, evaluated and spent.

Document ids are prefixed with the user rather than merely carrying a user_id
field: the prefix is what actually prevents two users colliding on the same
posting. The `__` separator is deliberate -- job ids already contain `:`
(`greenhouse:anthropic:5115935008`), so a `:` separator would be ambiguous.
Nothing parses the id back apart; `user_id` and `job_id` are stored as fields.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from .. import config
from ..models import JobEvaluation, JobListing, TailoredMaterials

_client: firestore.Client | None = None

_READ_CHUNK = 300


def get_client() -> firestore.Client:
    global _client
    if _client is None:
        _client = firestore.Client(project=config.FIRESTORE_PROJECT or None)
    return _client


def _scoped(job_id: str, user_id: str | None = None) -> str:
    """Document id for a per-user record of one job."""
    return f"{user_id or config.USER_ID}__{job_id}"


def _owner_fields(job_id: str, user_id: str | None = None) -> dict:
    """The identity fields every per-user document carries."""
    return {"user_id": user_id or config.USER_ID, "job_id": job_id}


def _with_job_id(snapshot) -> dict:
    """Document contents, with job_id resolved.

    Falls back to the raw document id for records written before ids were
    user-scoped, so old rows still render instead of showing a blank job.
    """
    data = snapshot.to_dict() or {}
    return dict(data, job_id=data.get("job_id") or snapshot.id)


def find_unseen(jobs: list[JobListing], evaluator: str = "") -> list[JobListing]:
    """Returns the jobs still worth evaluating for the current user. Read-only.

    A job counts as seen when this user has a marker for it AND either it
    matched, or it was skipped by the same evaluator that is about to run. A job
    SKIPPED by a different model or against a different candidate profile is
    offered up again, because a skip is a judgment call and the thing that made
    it has changed. Matched jobs are never resurfaced -- their verdict and
    drafts already exist.

    Without this, trialling a cheaper evaluator is a one-way door: a wrong skip
    is invisible and permanent, since nothing ever surfaces the job again to
    reveal the mistake. Set REEVALUATE_SKIPS_ON_CHANGE=false for the old
    behaviour of one verdict per job, forever.

    Read-only on purpose: marking happens in mark_job_seen once a verdict
    exists, never at fetch time. Batched get_all rather than one round trip per
    job; a single Greenhouse board can return 500+ postings.
    """
    db = get_client()
    doc_ids = [_scoped(job.job_id) for job in jobs]
    refs = [db.collection("jobs_seen").document(doc_id) for doc_id in doc_ids]
    claimed: set[str] = set()
    for start in range(0, len(refs), _READ_CHUNK):
        for snapshot in db.get_all(refs[start : start + _READ_CHUNK]):
            if not snapshot.exists:
                continue
            marker = snapshot.to_dict() or {}
            if not config.REEVALUATE_SKIPS_ON_CHANGE:
                claimed.add(snapshot.id)
                continue
            # Markers written before this field existed have no `matched` key.
            # Treat them as claimed rather than replaying the entire backlog.
            if marker.get("matched", True):
                claimed.add(snapshot.id)
            elif marker.get("evaluator", "") == evaluator:
                claimed.add(snapshot.id)
    return [job for job, doc_id in zip(jobs, doc_ids) if doc_id not in claimed]


def mark_job_seen(job_id: str, matched: bool = True, evaluator: str = "") -> None:
    """Records one job's verdict in jobs_seen for the current user.

    Called only after that job's evaluation has been written -- never at fetch
    time. Marking at fetch time meant any mid-run failure silently burned every
    job still in flight: they were seen, so no later run would retry them, and
    unevaluated, so they never reached a digest. That is not hypothetical. A run
    hit a Vertex 429 after 14 of 25 jobs and orphaned the remaining 11.

    `matched` and `evaluator` are what let find_unseen revisit a skip when the
    model or profile changes.

    The trade-off is that two runs overlapping in time can both pick up the
    same job. Scheduled runs are hours apart, and a duplicate evaluation is a
    far cheaper failure than a job silently lost forever.
    """
    db = get_client()
    db.collection("jobs_seen").document(_scoped(job_id)).set(
        {
            **_owner_fields(job_id),
            "seen_at": datetime.now(timezone.utc).isoformat(),
            "matched": matched,
            "evaluator": evaluator,
        },
        merge=True,
    )


def enqueue_quick_add(job: JobListing) -> None:
    """Queues a user-supplied posting for that user's next run.

    Queued rather than evaluated inline so it goes through exactly the same
    evaluation path as everything else -- one place where verdicts are formed,
    not two that can drift apart.
    """
    db = get_client()
    db.collection("quick_add_queue").document(_scoped(job.job_id)).set(
        {**asdict(job), **_owner_fields(job.job_id)}
    )


def drain_quick_adds() -> list[JobListing]:
    """Returns the current user's queued quick-adds and clears them.

    Deleted on read: a quick-add is a one-shot request. If its run dies before
    the verdict is stored the job is lost from the queue, which is the same
    trade-off as any at-most-once delivery -- and re-pasting is trivial,
    whereas a queue that never drains would re-evaluate forever.
    """
    db = get_client()
    docs = (
        db.collection("quick_add_queue")
        .where(filter=FieldFilter("user_id", "==", config.USER_ID))
        .stream()
    )
    jobs = []
    for doc in docs:
        data = doc.to_dict() or {}
        # user_id is an identity field JobListing does not accept; job_id is a
        # real field on it and must stay.
        data.pop("user_id", None)
        try:
            jobs.append(JobListing(**data))
        except TypeError:
            continue  # schema drift on an old queued doc; drop it rather than crash the run
        finally:
            doc.reference.delete()
    return jobs


def save_job_listing(job: JobListing) -> None:
    """Writes the posting to the shared corpus, and its display fields to this user.

    The description lives only in `jobs/` -- it is the same text for every user
    and the largest field by far, so copying it per user would multiply storage
    for nothing. The small display fields ARE denormalized onto the application,
    so rendering the review UI stays a single query.

    Note the corpus currently holds only postings that were actually evaluated,
    not everything fetched. Storing all ~2,500 per run would be ~2,500 writes a
    run against a 20k/day free tier, for postings the pre-filter already
    discarded. Full-corpus capture belongs with the shared-fetch scheduler.
    """
    db = get_client()

    # asdict(job) already carries fetched_at from when this listing was built,
    # so last_fetched_at is the refresh timestamp. Deliberately no
    # "first_seen_at": merge=True overwrites whatever fields you pass, so it
    # would be rewritten on every refetch rather than preserved.
    db.collection("jobs").document(job.job_id).set(
        {**asdict(job), "last_fetched_at": datetime.now(timezone.utc).isoformat()},
        merge=True,
    )

    db.collection("applications").document(_scoped(job.job_id)).set(
        {
            **_owner_fields(job.job_id),
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "remote": job.remote,
            "url": job.url,
            "source": job.source,
        },
        merge=True,
    )


def get_corpus_job(job_id: str) -> dict:
    """One posting from the shared corpus, description included."""
    return (get_client().collection("jobs").document(job_id).get().to_dict()) or {}


def save_evaluation(run_id: str, evaluation: JobEvaluation) -> None:
    db = get_client()
    db.collection("applications").document(_scoped(evaluation.job_id)).set(
        {
            **_owner_fields(evaluation.job_id),
            "run_id": run_id,
            "match": evaluation.match,
            "unmet_requirements": evaluation.unmet_requirements,
            "missing_information": evaluation.missing_information,
            "reasoning": evaluation.reasoning,
            "evaluated_at": evaluation.evaluated_at,
            "status": "matched" if evaluation.match else "skipped",
        },
        merge=True,
    )


def save_materials(materials: TailoredMaterials) -> None:
    db = get_client()
    db.collection("applications").document(_scoped(materials.job_id)).set(
        {
            **_owner_fields(materials.job_id),
            "tailored_resume_summary": materials.tailored_resume_summary,
            "tailored_resume": materials.tailored_resume,
            "cover_letter": materials.cover_letter,
            "contact_email": materials.contact_email,
            "contact_source": materials.contact_source,
            "contact_confidence": materials.contact_confidence,
            "materials_created_at": materials.created_at,
            "status": "drafted",
        },
        merge=True,
    )


def get_profile() -> dict | None:
    """The current user's stored profile, or None if they have never saved one."""
    snapshot = get_client().collection("profiles").document(config.USER_ID).get()
    if not snapshot.exists:
        return None
    doc = snapshot.to_dict() or {}
    doc.pop("user_id", None)
    doc.pop("updated_at", None)
    return doc or None


def save_profile(data: dict) -> None:
    """Writes the profile the agent reads.

    Firestore rather than the JSON file because the file is the read-only
    Secret Manager mount in production -- the service cannot write to it, so a
    profile editor has nowhere to save without this.
    """
    get_client().collection("profiles").document(config.USER_ID).set(
        {**data, "user_id": config.USER_ID, "updated_at": datetime.now(timezone.utc).isoformat()}
    )


def save_profile_source(name: str, payload: dict) -> None:
    """Caches enrichment data (e.g. GitHub) for the current user."""
    get_client().collection("profile_sources").document(_scoped(name)).set(
        {**_owner_fields(name), "source": name, "payload": payload,
         "cached_at": datetime.now(timezone.utc).isoformat()}
    )


def get_profile_source(name: str, max_age_hours: int) -> dict | None:
    """Returns cached enrichment if it is fresh enough, else None.

    Staleness is checked here rather than by a scheduled refresh so the data
    can never be older than the caller is willing to accept, and so a first run
    on a new machine populates it without extra wiring.
    """
    snapshot = get_client().collection("profile_sources").document(_scoped(name)).get()
    if not snapshot.exists:
        return None
    doc = snapshot.to_dict() or {}
    cached_at = doc.get("cached_at")
    if not cached_at:
        return None
    try:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(cached_at)
    except ValueError:
        return None
    return doc.get("payload") if age.total_seconds() < max_age_hours * 3600 else None


def get_application(job_id: str) -> dict:
    """One application for the current user."""
    snapshot = get_client().collection("applications").document(_scoped(job_id)).get()
    return _with_job_id(snapshot) if snapshot.exists else {}


def set_application_status(job_id: str, status: str) -> None:
    """Records that the candidate acted on a job.

    The pipeline's own statuses stop at `drafted`, which is where the agent's
    work ends. This is the human half of the loop: without it there is no way
    to tell a job drafted last week from one already applied to, and no basis
    for any follow-up view later.
    """
    get_client().collection("applications").document(_scoped(job_id)).set(
        {
            **_owner_fields(job_id),
            "status": status,
            "status_changed_at": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )


def save_run_summary(run_id: str, summary: dict) -> None:
    """Records what a run fetched, filtered, and took on.

    The pre-filter drops jobs without a per-job model-written reason, so these
    aggregate counts are the only record that they existed. Without them a
    digest reporting "3 evaluated" looks like the sources only had 3 jobs.
    """
    db = get_client()
    db.collection("runs").document(run_id).set(
        dict(
            summary,
            run_id=run_id,
            user_id=config.USER_ID,
            recorded_at=datetime.now(timezone.utc).isoformat(),
        ),
        merge=True,
    )


def get_run_summary(run_id: str) -> dict:
    db = get_client()
    return (db.collection("runs").document(run_id).get().to_dict()) or {}


def get_applications_by_status(statuses: list[str]) -> list[dict]:
    """The current user's applications in any of the given statuses, newest first.

    Filters on user in the query and on status in Python. Combining an `in`
    filter with an equality on another field is exactly the shape that trips
    Firestore's composite-index requirement, and the per-user collection is
    small enough that filtering the rest here costs nothing. Sorting is in
    Python for the same reason.
    """
    db = get_client()
    docs = (
        db.collection("applications")
        .where(filter=FieldFilter("user_id", "==", config.USER_ID))
        .stream()
    )
    wanted = set(statuses)
    apps = [a for a in (_with_job_id(d) for d in docs) if a.get("status") in wanted]
    apps.sort(key=lambda a: a.get("materials_created_at") or a.get("evaluated_at") or "", reverse=True)
    return apps


def get_latest_run_summary() -> dict:
    db = get_client()
    runs = [
        d.to_dict() or {}
        for d in db.collection("runs")
        .where(filter=FieldFilter("user_id", "==", config.USER_ID))
        .stream()
    ]
    runs.sort(key=lambda r: r.get("recorded_at", ""), reverse=True)
    return runs[0] if runs else {}


def get_run_applications(run_id: str) -> list[dict]:
    """Applications touched by one run. Run ids are unique, so this needs no user filter."""
    db = get_client()
    docs = db.collection("applications").where(filter=FieldFilter("run_id", "==", run_id)).stream()
    return [_with_job_id(d) for d in docs]
