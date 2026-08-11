"""Firestore-backed state: job dedupe and application tracking.

Collections:
  jobs_seen/{job_id}     -- dedupe marker, written once per job the pipeline has fetched
  applications/{job_id}  -- listing info + evaluation verdict + (if matched) tailored materials
  (applications docs carry a run_id field so a run's digest can query its own batch)
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


def find_unseen(jobs: list[JobListing]) -> list[JobListing]:
    """Returns the jobs not already recorded in jobs_seen. Read-only.

    Read-only on purpose: a job is marked seen by mark_job_seen once it has an
    evaluation, never at fetch time. Writing here would burn every job over the
    per-run cap, and every job still in flight when a run fails.

    Reads in batched get_all calls rather than one round trip per job; a single
    Greenhouse board can return 500+ postings.
    """
    db = get_client()
    refs = [db.collection("jobs_seen").document(job.job_id) for job in jobs]
    seen_ids: set[str] = set()
    for start in range(0, len(refs), _READ_CHUNK):
        for snapshot in db.get_all(refs[start : start + _READ_CHUNK]):
            if snapshot.exists:
                seen_ids.add(snapshot.id)
    return [job for job in jobs if job.job_id not in seen_ids]


def mark_job_seen(job_id: str) -> None:
    """Records one job in jobs_seen, so later runs skip it.

    Called only after that job's evaluation has been written -- never at fetch
    time. Marking at fetch time meant any mid-run failure silently burned every
    job still in flight: they were seen, so no later run would retry them, and
    unevaluated, so they never reached a digest. That is not hypothetical. A run
    hit a Vertex 429 after 14 of 25 jobs and orphaned the remaining 11.

    The trade-off is that two runs overlapping in time can both pick up the
    same job. Scheduled runs are hours apart, and a duplicate evaluation is a
    far cheaper failure than a job silently lost forever.
    """
    db = get_client()
    db.collection("jobs_seen").document(job_id).set(
        {"seen_at": datetime.now(timezone.utc).isoformat()}, merge=True
    )


def enqueue_quick_add(job: JobListing) -> None:
    """Queues a user-supplied posting for the next run to evaluate.

    Queued rather than evaluated inline so it goes through exactly the same
    evaluation path as everything else -- one place where verdicts are formed,
    not two that can drift apart.
    """
    db = get_client()
    db.collection("quick_add_queue").document(job.job_id).set(asdict(job))


def drain_quick_adds() -> list[JobListing]:
    """Returns queued quick-adds and clears the queue.

    Deleted on read: a quick-add is a one-shot request. If its run dies before
    the verdict is stored the job is lost from the queue, which is the same
    trade-off as any at-most-once delivery -- and re-pasting is trivial,
    whereas a queue that never drains would re-evaluate forever.
    """
    db = get_client()
    jobs = []
    for doc in db.collection("quick_add_queue").stream():
        data = doc.to_dict() or {}
        try:
            jobs.append(JobListing(**data))
        except TypeError:
            continue  # schema drift on an old queued doc; drop it rather than crash the run
        finally:
            doc.reference.delete()
    return jobs


def save_job_listing(job: JobListing) -> None:
    db = get_client()
    db.collection("applications").document(job.job_id).set(
        {
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "remote": job.remote,
            "url": job.url,
            "source": job.source,
        },
        merge=True,
    )


def save_evaluation(run_id: str, evaluation: JobEvaluation) -> None:
    db = get_client()
    db.collection("applications").document(evaluation.job_id).set(
        {
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
    db.collection("applications").document(materials.job_id).set(
        {
            "tailored_resume_summary": materials.tailored_resume_summary,
            "cover_letter": materials.cover_letter,
            "contact_email": materials.contact_email,
            "contact_source": materials.contact_source,
            "materials_created_at": materials.created_at,
            "status": "drafted",
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
        dict(summary, run_id=run_id, recorded_at=datetime.now(timezone.utc).isoformat()),
        merge=True,
    )


def get_run_summary(run_id: str) -> dict:
    db = get_client()
    return (db.collection("runs").document(run_id).get().to_dict()) or {}


def get_applications_by_status(statuses: list[str]) -> list[dict]:
    """Applications in any of the given statuses, newest verdict first.

    Sorted in Python rather than with order_by: combining a where() with an
    order_by on a different field needs a composite index in Firestore, and
    this collection is small enough that the sort is free.
    """
    db = get_client()
    docs = db.collection("applications").where(filter=FieldFilter("status", "in", statuses)).stream()
    apps = [dict(d.to_dict() or {}, job_id=d.id) for d in docs]
    apps.sort(key=lambda a: a.get("materials_created_at") or a.get("evaluated_at") or "", reverse=True)
    return apps


def get_latest_run_summary() -> dict:
    db = get_client()
    runs = [d.to_dict() or {} for d in db.collection("runs").stream()]
    runs.sort(key=lambda r: r.get("recorded_at", ""), reverse=True)
    return runs[0] if runs else {}


def get_run_applications(run_id: str) -> list[dict]:
    db = get_client()
    docs = db.collection("applications").where(filter=FieldFilter("run_id", "==", run_id)).stream()
    return [dict(d.to_dict() or {}, job_id=d.id) for d in docs]
