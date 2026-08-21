# TalentOS documentation

This directory is the canonical reference for code-backed behavior. It avoids
claiming that a configured service, URL, scheduler, or access policy is live
without an environment-specific verification.

| Document | Use it for |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | System boundaries, pipeline flows, data lifecycle, and guardrails. |
| [API reference](API_REFERENCE.md) | FastAPI endpoints, request contracts, authentication layers, and common errors. |
| [Operations guide](OPERATIONS.md) | Local setup, testing, configuration, deployment, scheduling, and incident checks. |

The main [README](../README.md) is the product overview. The
[contributor guide](../CONTRIBUTING.md) describes repository rules, and
[`career-agent/README.md`](../career-agent/README.md) provides an extended
guided tour of the service and UI.

## Documentation rules

- Update the relevant reference in the same change as any endpoint, source,
  configuration, auth, or pipeline-flow change.
- Keep **implemented**, **configured**, **locally verified**, and **deployed**
  claims distinct.
- Do not document automated submission, protected-site scraping, or bypassing
  platform controls: TalentOS prepares work for human review and action.
- FastAPI also exposes the generated interactive schema at `/docs` and the
  OpenAPI document at `/openapi.json` when the backend is running.
