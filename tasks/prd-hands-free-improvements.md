# PRD: Inspection Workspace Hands-Free Improvements

## Overview
Improve the inspection workspace to minimize technician interaction with the screen. The goal is hands-free operation via smart glasses -- the technician should be able to complete an entire inspection without putting down their tools. This includes UI cleanup (review button visibility, progress bar removal, glasses indicator), a scrollable PDF viewer, and hands-free completion of pass/fail checks and measurements via voice.

## Quality Gates

These must pass for every user story:
- `npx next lint` -- Linting
- Verify in browser via dev-login route (`/aerovision/api/auth/dev-login`)

## User Stories

### US-001: Fix Review button contrast
### US-002: Add glasses connection indicator
### US-003: Remove progress bar
### US-004: Scrollable multi-page PDF viewer
### US-005: Voice-driven pass/fail checks
### US-006: Auto-accept high-confidence measurements

## Status: IN PROGRESS
