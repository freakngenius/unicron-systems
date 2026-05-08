---
name: onboard-team-member
description: Onboard a new team member — Supabase auth, Notion access invite, Slack welcome, first action item
domain: operations
type: manual
inputs:
  - name: name
    type: string
    required: true
    description: Full name of the new team member
  - name: email
    type: string
    required: true
    description: Email address — must match Supabase auth allowlist
  - name: role
    type: string
    required: true
    description: "Role: founder | cofounder | advisor | contractor"
  - name: default_surface
    type: string
    required: true
    description: "Default Atrium surface: pathfinder | metacron | internal | sales | discovery"
outputs:
  - type: ledger_row
    location: nervous_system.ledger
  - type: notion_card
    location: internal kanban — onboarding column
  - type: slack_message
    location: "#orchestrator-feed"
refusal_gate: yes
budget_usd_per_run: 0.10
---

# onboard-team-member

Onboard a new team member end-to-end: Supabase auth invite, `nervous_system.team_members` row, Notion workspace access invite, Slack welcome message, and first action item. Requires refusal gate approval.

## Refusal Gate

This skill adds a new human to the system with real access credentials. Present the inputs to the operator for confirmation before executing.

Gate prompt:
> "You are onboarding a new team member: [name] ([email]) as [role]. Default surface: [default_surface]. This creates Supabase auth, nervous_system row, Notion access, and Slack message. Confirm? (approve / cancel)"

## Execution

1. Check `nervous_system.team_members` — if email already exists, abort with error.
2. Invite email to Supabase Auth via Admin API (generates magic link or sets up account).
3. Insert row into `nervous_system.team_members`:
   - `name`, `email`, `role`, `default_surface`, `active = true`
4. Send Notion workspace invite to email (via Notion API or manual note if API unavailable).
5. Post Slack welcome message to `#orchestrator-feed`:
   > "Welcome to Unicron, [name]! You've been added as [role]. Your default surface is [default_surface]."
6. Create an onboarding action item in `nervous_system.action_items`:
   - Title: "Complete onboarding — [name]"
   - Priority: medium
   - DRI: new team member's id
   - Due: 3 days from now
7. Insert a ledger row summarizing the onboarding event.
8. Create a Notion card in the internal kanban onboarding column.

## Notes

- Cost ceiling: $0.10/run.
- Role must be one of: `founder`, `cofounder`, `advisor`, `contractor`.
- Default surface must be one of: `pathfinder`, `metacron`, `internal`, `sales`, `discovery`.
- Abort cleanly if Supabase invite fails — do not proceed with downstream steps.
