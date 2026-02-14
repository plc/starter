# Gotchas

This file documents confusing issues, mistakes, and lessons learned. When Claude Code gets stuck, has to undo work, or discovers unexpected behavior, write a post-mortem here.

## Post-Mortem Template

```markdown
### Title of the Issue

**Date**: YYYY-MM-DD

**Problem**: What went wrong

**Cause**: Why it happened

**Solution**: How it was fixed

**Prevention**: How to avoid it in the future
```

---

## Post-Mortems

### Recurring events and DST drift

**Date**: 2026-02-12

**Problem**: Recurring events repeat at the same UTC offset as the original event. If an agent creates "Daily standup at 9am Mountain Time" during MST (UTC-7), the event stays at 16:00 UTC year-round. When MDT (UTC-6) kicks in, the standup shows as 10am Mountain Time instead of 9am.

**Cause**: The `rrule` library generates recurrence dates in UTC. We don't re-interpret them through the calendar's timezone.

**Solution**: For v1, this is a documented limitation. The workaround is for agents to update the event times when DST changes occur. A future version will use the calendar's timezone to compute wall-clock-consistent recurrence.

**Prevention**: When implementing DST-aware recurrence, expand RRULEs in the calendar's local timezone, then convert each occurrence to UTC for storage.

### Postmark sender signature requirement

**Date**: 2026-02-14

**Problem**: Outbound calendar invite emails fail to send because Postmark rejects the From address.

**Cause**: Postmark requires all sender addresses to be verified via a Sender Signature or domain-level verification. Calendar email addresses (`cal-xxx@invite.caldave.ai`) are auto-generated and not individually registered as sender signatures.

**Solution**: Verify the entire `invite.caldave.ai` domain in the Postmark account settings (not individual email addresses). This allows any `*@invite.caldave.ai` address to send.

**Prevention**: When setting up a new Postmark account or changing the `CALDAVE_EMAIL_DOMAIN`, always verify the domain in Postmark first.

### ical-generator requires organizer.name

**Date**: 2026-02-14

**Problem**: `ical-generator` v10 throws `'organizer.name' is empty!` when creating a VEVENT with an organizer that has no name.

**Cause**: The library validates that `organizer.name` is a non-empty string. Setting just `{ email: 'foo@bar.com' }` fails.

**Solution**: Always provide both `name` and `email` when setting the organizer. For REPLY .ics (where we may not know the organiser's name), use the email address as the name.

**Prevention**: Always pass `{ name: ..., email: ... }` to `ical-generator`'s organizer option.

### Security probe: Feb 14, 2026

**Date**: 2026-02-14

**Problem**: Systematic security probe tested multiple attack vectors against the production API at ~20:45-20:49 UTC.

**Attack vectors tested and results**:

| # | Vector | Payload | Result | Severity |
|---|--------|---------|--------|----------|
| 1 | SQL injection | `Meeting"); DROP TABLE events;--` as event title | ✅ Blocked — parameterized queries treat it as literal string | None |
| 2 | XSS | `<img src=x onerror=alert(1)>Meeting` as event title | ⚠️ Stored as-is — safe because CalDave is API-only (no HTML rendering), but downstream consumers could be vulnerable | Low |
| 3 | Malformed JSON | Various broken JSON bodies | ⚠️ Express returned 500 instead of 400 — should validate before hitting DB | Low |
| 4 | Invalid timezone | `Mars/Olympus_Mons` | ⚠️ Postgres rejected (500) — should validate and return 400 | Low |
| 5 | Extreme date | `-001000-01-01T00:00:00Z` (year -1000) | ⚠️ Postgres rejected (500) — should validate range | Low |
| 6 | Negative OFFSET | Negative pagination offset | ⚠️ Postgres rejected (500) — should clamp to 0 | Low |
| 7 | Invalid emails | `not-an-email`, `<script>`, `foo@bar@baz` as attendees | ✅ Postmark rejected at send time | Low |
| 8 | Mass recipients | 99 fake email addresses as attendees | ✅ Postmark's 50-recipient limit blocked the send | Low |
| 9 | Duplicate attendees | Same email repeated 3x + uppercase variant | ⚠️ Went through — no deduplication on attendees array | Medium |
| 10 | Null byte injection | `\x00` in event fields | ✅ Postgres rejected invalid UTF-8 byte sequence | Low |
| 11 | Zalgo text | Combining characters in event title | ✅ Valid UTF-8, stored correctly — cosmetic issue only | None |
| 12 | Email spam | Created ~15 events with attendees, triggering real invite emails | ⚠️ No per-agent rate limit on outbound emails | Medium |
| 13 | Inbound email hijack | Sent calendar invites via email, modified title to "I HIJACKED YOUR EVENT TITLE" | ✅ Working as designed — they had API key access to their own calendar | None |

**Cause**: The tester had a valid API key and systematically probed input validation boundaries, email delivery, and injection resistance.

**Damage**: None. No data was lost, no code was executed, no unauthorized access occurred. The SQL injection and null byte attempts were fully blocked by parameterized queries and Postgres encoding validation. Some garbage events were created on their own calendar, and ~15 invite emails were sent (all to addresses the attacker specified).

**Hardening items identified** (in priority order):

1. **Attendee deduplication** — Deduplicate the attendees array (case-insensitive) before storing and sending invites
2. **Attendee limit** — Cap attendees per event (e.g., 50) to prevent mass email abuse
3. **Outbound email rate limit** — Rate limit invite sends per agent per hour to prevent email spam
4. **Validate pagination offset** — Clamp `offset` to >= 0 instead of letting Postgres reject it
5. **Validate timezone before INSERT** — Check against `Intl.supportedValuesOf('timeZone')` and return 400
6. **Validate date ranges** — Reject dates outside a reasonable range (e.g., year 1900-2200)
7. **Consider HTML sanitization** — Strip HTML tags from event titles/descriptions to prevent stored XSS for downstream consumers

**Prevention**: Add input validation at the application layer instead of relying on Postgres to reject bad data. Postgres rejections cause 500s that pollute error logs and look like bugs.

<!-- Add new post-mortems above this line -->
