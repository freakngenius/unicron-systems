---
name: schedule-discovery-call
description: Scaffolded — book a Zoom / Google Meet discovery call with a lead and write the calendar event + customer note. Returns 202 until the calendar integration ships.
domain: sales
type: manual
status: scaffolded
inputs:
  - name: customer_id
    type: uuid
    required: true
    description: Target customer
  - name: attendee_emails
    type: string[]
    required: true
    description: Emails to invite
  - name: preferred_window
    type: string
    required: false
    description: ISO datetime range; if omitted, picks the next open 45-min weekday slot in the operator's calendar.
outputs:
  - type: api_response_when_implemented
    location: '{ event_id, meeting_url, scheduled_for, attendees }'
  - type: customer_note_when_implemented
    location: nervous_system.customers.notes (append)
refusal_gate: no
budget_usd_per_run: 0.08
---

# schedule-discovery-call (SCAFFOLDED)

Planned: book a discovery call, generate a meeting URL, write the calendar event, and leave a customer-note trail. Pairs with the calls/transcript pipeline so the post-call transcript lands on the right customer record.

**Status**: scaffolded. Returns HTTP 202.

## Planned implementation

1. Resolve the operator's calendar via Google Calendar MCP (`mcp__claude_ai_Google_Calendar__suggest_time` if no `preferred_window` provided).
2. Create the event (`mcp__claude_ai_Google_Calendar__create_event`) with attendees, generate a Zoom/Meet link.
3. Append a customer note: `Discovery call scheduled for {ISO} with {emails}. Event id: {event_id}.`
4. Update `nervous_system.customers.stage = 'qualified'` if currently `'lead'` (preserve existing stage otherwise).
5. Ledger signal `source_type='manual'`, `source_id='customers/{id}'`, summarizing the booking.

## Refusal gate

None at this skill layer. Calendar writes are reversible.

## Notes

- Tracked in `SCAFFOLDED_SLUGS`.
- Depends on Google Calendar MCP being authenticated for the operator's calendar. Until then, returns 202.
- Pairs with `transcript` skill (wiki/skills/transcript.md) for the post-call write-up.
