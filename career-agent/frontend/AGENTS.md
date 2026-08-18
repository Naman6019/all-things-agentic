<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# TalentOS // Careers — Frontend Developer & Agent Guide

## Codebase Exploration & Knowledge Graph (Graphify)
- **Codebase Search**: Use **Graphify** (`graphify`) to explore components, state hooks, API routes, and backend proxy flows.
- **Graph Updates**: Run `graphify update .` from the repo root to refresh the graph without LLM tokens after modifying components or route handlers.
- **Key Commands**:
  - Search: `graphify query "<feature or component>"`
  - Blast Radius: `graphify affected "<component_name>"`
  - Explain: `graphify explain "<component_name>"`
