# ADR-0001: pnpm workspaces + Turborepo

**Status:** accepted · 2026-07-26

## Context

Four deployables (admin SPA, OCPP gateway, edge functions, later the Expo driver app) share three things that must never drift: generated DB types, OCPP/domain types, and the UI kit.

## Decision

One monorepo using pnpm workspaces for linking and Turborepo for the task graph (`lint`/`typecheck`/`test`/`build`), with `.turbo` cached in CI.

## Alternatives rejected

- **Polyrepo** — shared types would be published packages or copies; both drift.
- **Nx** — heavier config surface than a solo founder needs.
- **Bare `pnpm -r`** — no caching, no task graph; painful once the Expo app joins.
