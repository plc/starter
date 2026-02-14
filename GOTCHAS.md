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

<!-- Add new post-mortems above this line -->
