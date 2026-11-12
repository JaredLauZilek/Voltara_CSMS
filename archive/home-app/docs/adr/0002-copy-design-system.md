# ADR-0002: Copy `@voltara/ui` from CSMS rather than share a package

**Status:** accepted · 2026-10-05

## Context

Both apps must look identical. Options: publish `@voltara/ui` from the CSMS repo (private registry or git dependency), a git submodule, or a copy.

## Decision

Copy (as CSMS itself did from the accounting dashboard). The package is small, changes rarely, and a solo founder does not want a release pipeline between two repos.

## Consequences

Visual changes are made in both repos deliberately and noted in each root CLAUDE.md §2. If drift becomes a problem, publish from CSMS and replace this folder with a dependency.
