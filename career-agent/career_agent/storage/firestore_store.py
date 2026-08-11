"""Firestore-backed state: job dedupe and application tracking.

Collections:
  jobs_seen/{job_id}     -- dedupe marker, written once per job the pipeline has fetched
  applications/{job_id}  -- listing info + evaluation verdict + (if matched) tailored materials
  (applications docs carry a run_id field so a run's digest can query its own batch)
"""
from __future__ import annotations

from datetime import datetime, timezone

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from .. import config
from ..models import JobEvaluation, JobListing, TailoredMaterials

_client: firestore.Client | None = None

_READ_CHUNK = 300
_WRITE_CHUNK = 400  # Firestore caps a batch at 500 writes


def get_client() -> firestore.Client:
    global _client
    if _client is None:
        _client = firestore.Client(project=config.FIRESTORE_PROJECT or None)
    return _client


def find_unseen(jobs: list[JobListing]) -> list[JobListing]:
    """Returns the jobs not already recorded in jobs_seen. Read-only.

    Deliberately split from mark_seen: the caller caps how many jobs a run
    actually takes on (config.MAX_JOBS_PER_RUN), and only the jobs that make
    that cut may be marked seen. Marking here instead would burn every job
    over the cap -- seen forever, never evaluated.

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


def mark_seen(jobs: list[JobListing]) -> None:
    """Records jobs in jobs_seen so later runs skip them.

    Still marked at fetch time rather than after record_job_evaluation
    succeeds, so a crash mid-run drops the in-flight jobs for good. Acceptable
    for the hackathon MVP; the production fix is to move this call to after
    the evaluation write.
    """
    db = get_client()
    for start in range(0, len(jobs), _WRITE_CHUNK):
        batch = db.batch()
        for job in jobs[start : start + _WRITE_CHUNK]:
            batch.set(
                db.collection("jobs_seen").document(job.job_id),
                {
                    "seen_at": datetime.now(timezone.utc).isoformat(),
                    "title": job.title,
                    "company": job.company,
                },
            )
        batch.commit()


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


def get_run_applications(run_id: str) -> list[dict]:
    db = get_client()
    docs = db.collection("applications").where(filter=FieldFilter("run_id", "==", run_id)).stream()
    return [dict(d.to_dict() or {}, job_id=d.id) for d in docs]
