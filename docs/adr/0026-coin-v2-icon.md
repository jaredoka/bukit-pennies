# 0026: Hand-drawn coin_v2 becomes the app icon set

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

coin_v1 predated the mascot removal; the icon set had to be generated consistently and match the new penny-only brand.

## Decision

coin_v2 replaces coin_v1 as the app icon. coin_platform_icons.py derives the complete icon set (icon, favicon, splash, Android adaptive foreground/monochrome/background) from art/raw/coin_v2.png; the Android adaptive background becomes solid white, the last hornbill-era colour. The coin is white-backed in every surface.

## Consequences

One hand-drawn source generates every platform icon; no brand-colour leftovers from the mascot era.
