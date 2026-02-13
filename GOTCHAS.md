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

<!-- Add new post-mortems above this line -->
