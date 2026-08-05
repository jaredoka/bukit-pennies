# 0030: Public docs reframe + ADR split

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

The old Execution Playbook mixed agent-operating instructions (prime directives, workflow, env notes, verification gates, note-taking policy) with public architecture content. Professional OSS projects publish the result, not the process diary.

## Decision

Rename the document to Architecture and Decisions and reframe for a public
audience. The agent-operating material moves to CLAUDE.md; the decision log
becomes one ADR file per decision under docs/adr/ (this file is ADR-0030);
HANDOFF.md is untracked and kept private; code-comment citations of HANDOFF
are rewritten to be self-contained.

## Consequences

The public repo reads like a maintained project; the process that builds it lives only in the private working files.
