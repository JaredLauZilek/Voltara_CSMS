# ADR-0003: BLE-first, phone as the telemetry bridge

**Status:** accepted · 2026-10-05

## Context

The HiCi unit has Bluetooth and Wi‑Fi but no OCPP, and no documented cloud API Voltara controls. The business needs the app working against the charger now and fleet visibility for staff.

## Decision

The phone talks to the charger over BLE (primary channel) and forwards readings and session boundaries to Supabase through RPCs while connected. Data model keys everything on `chargers.serial`, so a future Wi‑Fi path (charger → gateway) writes the same tables.

## Consequences

History exists only while someone has the app open near the charger. Acceptable for home charging; revisit when a Wi‑Fi/OCPP path or a Voltara firmware is available.
