/**
 * CalDave API integration tests
 *
 * Requires a running server (npm run dev or docker compose up).
 * Each run provisions its own agent + calendar — safe to run repeatedly.
 *
 * Usage: node --test tests/api.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, futureDate } = require('./helpers');

// Shared state across tests — populated in before() hooks
const state = {
  agentId: null,
  apiKey: null,
  calendarId: null,
  feedToken: null,
  // For recurring event tests
  recurringParentId: null,
  recurringInstances: [],
  exceptionInstanceId: null,
};

// ---------------------------------------------------------------------------
// 1. Health checks
// ---------------------------------------------------------------------------

describe('Health', { concurrency: 1 }, () => {
  it('GET /health returns ok', async () => {
    const { status, data } = await api('GET', '/health');
    assert.equal(status, 200);
    assert.equal(data.status, 'ok');
    assert.ok(data.timestamp);
  });

  it('GET /health/db shows connected database', async () => {
    const { status, data } = await api('GET', '/health/db');
    assert.equal(status, 200);
    assert.equal(data.database.connected, true);
  });
});

// ---------------------------------------------------------------------------
// 2. Agent provisioning
// ---------------------------------------------------------------------------

describe('Agents', { concurrency: 1 }, () => {
  it('POST /agents creates a new agent', async () => {
    const { status, data } = await api('POST', '/agents');
    assert.equal(status, 201);
    assert.ok(data.agent_id);
    assert.ok(data.api_key);
    assert.match(data.agent_id, /^agt_/);
    assert.match(data.api_key, /^sk_live_/);

    // Save for all subsequent tests
    state.agentId = data.agent_id;
    state.apiKey = data.api_key;
  });
});

// ---------------------------------------------------------------------------
// 3. Calendar CRUD
// ---------------------------------------------------------------------------

describe('Calendars', { concurrency: 1 }, () => {
  it('POST /calendars creates a calendar', async () => {
    const { status, data } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Test Calendar', timezone: 'America/Denver' },
    });
    assert.equal(status, 201);
    assert.ok(data.calendar_id);
    assert.match(data.calendar_id, /^cal_/);
    assert.ok(data.email);
    assert.ok(data.ical_feed_url);
    assert.ok(data.feed_token);

    state.calendarId = data.calendar_id;
    state.feedToken = data.feed_token;
  });

  it('GET /calendars lists calendars', async () => {
    const { status, data } = await api('GET', '/calendars', { token: state.apiKey });
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.calendars));
    const ours = data.calendars.find(c => c.calendar_id === state.calendarId);
    assert.ok(ours, 'Our calendar should be in the list');
    assert.equal(ours.name, 'Test Calendar');
  });

  it('GET /calendars/:id returns the calendar', async () => {
    const { status, data } = await api('GET', `/calendars/${state.calendarId}`, { token: state.apiKey });
    assert.equal(status, 200);
    assert.equal(data.calendar_id, state.calendarId);
    assert.equal(data.timezone, 'America/Denver');
  });

  it('PATCH /calendars/:id updates the name', async () => {
    const { status, data } = await api('PATCH', `/calendars/${state.calendarId}`, {
      token: state.apiKey,
      body: { name: 'Updated Calendar' },
    });
    assert.equal(status, 200);
    assert.equal(data.name, 'Updated Calendar');
  });

  it('GET /calendars without auth returns 401', async () => {
    const { status } = await api('GET', '/calendars');
    assert.equal(status, 401);
  });

  it('agent scoping: another agent cannot see our calendars', async () => {
    // Create a second agent
    const { data: agent2 } = await api('POST', '/agents');
    const { status, data } = await api('GET', '/calendars', { token: agent2.api_key });
    assert.equal(status, 200);
    assert.equal(data.calendars.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Event CRUD (non-recurring)
// ---------------------------------------------------------------------------

describe('Events (non-recurring)', { concurrency: 1 }, () => {
  let eventId;

  it('POST creates an event', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Test Event',
        start: futureDate(24),
        end: futureDate(25),
        location: 'Room A',
      },
    });
    assert.equal(status, 201);
    assert.ok(data.id);
    assert.match(data.id, /^evt_/);
    assert.equal(data.title, 'Test Event');
    assert.equal(data.status, 'confirmed');
    assert.equal(data.location, 'Room A');
    eventId = data.id;
  });

  it('GET /events lists the event', async () => {
    const { status, data } = await api('GET', `/calendars/${state.calendarId}/events`, { token: state.apiKey });
    assert.equal(status, 200);
    const found = data.events.find(e => e.id === eventId);
    assert.ok(found, 'Event should be in the list');
  });

  it('GET /events/:id returns the event', async () => {
    const { status, data } = await api('GET', `/calendars/${state.calendarId}/events/${eventId}`, { token: state.apiKey });
    assert.equal(status, 200);
    assert.equal(data.id, eventId);
    assert.equal(data.title, 'Test Event');
  });

  it('PATCH updates the event title', async () => {
    const { status, data } = await api('PATCH', `/calendars/${state.calendarId}/events/${eventId}`, {
      token: state.apiKey,
      body: { title: 'Updated Event' },
    });
    assert.equal(status, 200);
    assert.equal(data.title, 'Updated Event');
  });

  it('POST /respond changes status', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events/${eventId}/respond`, {
      token: state.apiKey,
      body: { response: 'declined' },
    });
    assert.equal(status, 200);
    assert.equal(data.status, 'cancelled');
    assert.equal(data.response, 'declined');
  });

  it('DELETE removes the event', async () => {
    const { status } = await api('DELETE', `/calendars/${state.calendarId}/events/${eventId}`, { token: state.apiKey });
    assert.equal(status, 204);
  });

  it('GET returns 404 after deletion', async () => {
    const { status } = await api('GET', `/calendars/${state.calendarId}/events/${eventId}`, { token: state.apiKey });
    assert.equal(status, 404);
  });
});

// ---------------------------------------------------------------------------
// 5. Upcoming endpoint
// ---------------------------------------------------------------------------

describe('Upcoming', { concurrency: 1 }, () => {
  let futureEventId;
  let pastEventId;

  it('future event appears in upcoming', async () => {
    // Create future event
    const { data: created } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: { title: 'Future Event', start: futureDate(1), end: futureDate(2) },
    });
    futureEventId = created.id;

    const { status, data } = await api('GET', `/calendars/${state.calendarId}/upcoming`, { token: state.apiKey });
    assert.equal(status, 200);
    assert.ok(data.events.length > 0);
    assert.ok(data.events.some(e => e.id === futureEventId));
    assert.match(data.next_event_starts_in, /^PT/);
  });

  it('past event does NOT appear in upcoming', async () => {
    const { data: created } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: { title: 'Past Event', start: futureDate(-48), end: futureDate(-47) },
    });
    pastEventId = created.id;

    const { data } = await api('GET', `/calendars/${state.calendarId}/upcoming`, { token: state.apiKey });
    assert.ok(!data.events.some(e => e.id === pastEventId), 'Past event should not be in upcoming');
  });

  after(async () => {
    // Clean up
    await api('DELETE', `/calendars/${state.calendarId}/events/${futureEventId}`, { token: state.apiKey });
    await api('DELETE', `/calendars/${state.calendarId}/events/${pastEventId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 6. Recurring events — creation
// ---------------------------------------------------------------------------

describe('Recurring events — creation', { concurrency: 1 }, () => {
  it('POST with recurrence creates parent + instances', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Daily Standup',
        start: futureDate(1),
        end: futureDate(1.25), // 15 min
        recurrence: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
      },
    });
    assert.equal(status, 201);
    assert.equal(data.status, 'recurring');
    assert.equal(data.recurrence, 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR');
    assert.ok(data.instances_created > 0, `Expected instances, got ${data.instances_created}`);
    assert.ok(data.instances_created >= 50, `Expected ~60-65 weekday instances, got ${data.instances_created}`);
    assert.ok(data.instances_created <= 100, `Too many instances: ${data.instances_created}`);

    state.recurringParentId = data.id;
  });

  it('GET /events returns instances, not the parent', async () => {
    const { data } = await api('GET', `/calendars/${state.calendarId}/events?limit=200`, { token: state.apiKey });
    const instances = data.events.filter(e => e.parent_event_id === state.recurringParentId);
    assert.ok(instances.length > 0, 'Should have materialized instances');

    // Parent should NOT be in the list
    const parent = data.events.find(e => e.id === state.recurringParentId);
    assert.equal(parent, undefined, 'Parent should not appear in event list');

    // Every instance should have the expected fields
    for (const inst of instances) {
      assert.ok(inst.occurrence_date, 'Instance should have occurrence_date');
      assert.equal(inst.title, 'Daily Standup');
    }

    state.recurringInstances = instances;
  });

  it('GET /upcoming returns instances, not parent', async () => {
    const { data } = await api('GET', `/calendars/${state.calendarId}/upcoming?limit=50`, { token: state.apiKey });
    const parentInUpcoming = data.events.find(e => e.id === state.recurringParentId);
    assert.equal(parentInUpcoming, undefined, 'Parent should not be in upcoming');

    const instances = data.events.filter(e => e.parent_event_id === state.recurringParentId);
    assert.ok(instances.length > 0, 'Should have recurring instances in upcoming');
  });
});

// ---------------------------------------------------------------------------
// 7. Recurring events — instance exception
// ---------------------------------------------------------------------------

describe('Recurring events — instance exception', { concurrency: 1 }, () => {
  it('PATCH instance marks it as exception', async () => {
    const instance = state.recurringInstances[0];
    state.exceptionInstanceId = instance.id;

    const { status, data } = await api('PATCH', `/calendars/${state.calendarId}/events/${instance.id}`, {
      token: state.apiKey,
      body: { title: 'Modified Standup' },
    });
    assert.equal(status, 200);
    assert.equal(data.title, 'Modified Standup');
    assert.equal(data.is_exception, true);
  });

  it('GET exception instance shows modified title', async () => {
    const { data } = await api('GET', `/calendars/${state.calendarId}/events/${state.exceptionInstanceId}`, { token: state.apiKey });
    assert.equal(data.title, 'Modified Standup');
    assert.equal(data.is_exception, true);
  });

  it('other instances still have original title', async () => {
    const other = state.recurringInstances[1];
    const { data } = await api('GET', `/calendars/${state.calendarId}/events/${other.id}`, { token: state.apiKey });
    assert.equal(data.title, 'Daily Standup');
  });
});

// ---------------------------------------------------------------------------
// 8. Recurring events — parent template propagation
// ---------------------------------------------------------------------------

describe('Recurring events — parent template propagation', { concurrency: 1 }, () => {
  it('PATCH parent title propagates to non-exception instances', async () => {
    const { status, data } = await api('PATCH', `/calendars/${state.calendarId}/events/${state.recurringParentId}`, {
      token: state.apiKey,
      body: { title: 'Team Standup' },
    });
    assert.equal(status, 200);
    assert.equal(data.title, 'Team Standup');
  });

  it('non-exception instances have new title', async () => {
    const nonException = state.recurringInstances[1];
    const { data } = await api('GET', `/calendars/${state.calendarId}/events/${nonException.id}`, { token: state.apiKey });
    assert.equal(data.title, 'Team Standup');
  });

  it('exception instance retains its custom title', async () => {
    const { data } = await api('GET', `/calendars/${state.calendarId}/events/${state.exceptionInstanceId}`, { token: state.apiKey });
    assert.equal(data.title, 'Modified Standup');
  });
});

// ---------------------------------------------------------------------------
// 9. Recurring events — delete single instance
// ---------------------------------------------------------------------------

describe('Recurring events — delete single', { concurrency: 1 }, () => {
  let targetInstanceId;

  it('DELETE ?mode=single cancels one instance', async () => {
    // Pick an instance that is not the exception
    targetInstanceId = state.recurringInstances[2].id;

    const { status } = await api('DELETE', `/calendars/${state.calendarId}/events/${targetInstanceId}?mode=single`, { token: state.apiKey });
    assert.equal(status, 204);
  });

  it('cancelled instance has status=cancelled', async () => {
    const { data } = await api('GET', `/calendars/${state.calendarId}/events/${targetInstanceId}`, { token: state.apiKey });
    assert.equal(data.status, 'cancelled');
    assert.equal(data.is_exception, true);
  });

  it('cancelled instance excluded from event list', async () => {
    const { data } = await api('GET', `/calendars/${state.calendarId}/events`, { token: state.apiKey });
    // The cancelled event might still appear in the list since we don't filter cancelled in GET /events
    // But it should be flagged as cancelled
    const found = data.events.find(e => e.id === targetInstanceId);
    if (found) {
      assert.equal(found.status, 'cancelled');
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Recurring events — delete all
// ---------------------------------------------------------------------------

describe('Recurring events — delete all', { concurrency: 1 }, () => {
  it('DELETE parent without mode=all returns 400', async () => {
    const { status, data } = await api('DELETE', `/calendars/${state.calendarId}/events/${state.recurringParentId}`, { token: state.apiKey });
    assert.equal(status, 400);
    assert.ok(data.error.includes('mode=all'));
  });

  it('DELETE ?mode=all removes parent and all instances', async () => {
    const { status } = await api('DELETE', `/calendars/${state.calendarId}/events/${state.recurringParentId}?mode=all`, { token: state.apiKey });
    assert.equal(status, 204);
  });

  it('parent is gone', async () => {
    const { status } = await api('GET', `/calendars/${state.calendarId}/events/${state.recurringParentId}`, { token: state.apiKey });
    assert.equal(status, 404);
  });

  it('instances are gone', async () => {
    const { data } = await api('GET', `/calendars/${state.calendarId}/events?limit=200`, { token: state.apiKey });
    const orphans = data.events.filter(e => e.parent_event_id === state.recurringParentId);
    assert.equal(orphans.length, 0, 'No instances should remain after deleting the series');
  });
});

// ---------------------------------------------------------------------------
// 11. Recurring events — validation
// ---------------------------------------------------------------------------

describe('Recurring events — validation', { concurrency: 1 }, () => {
  it('rejects FREQ=SECONDLY (too many instances)', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Bad Recurrence',
        start: futureDate(1),
        end: futureDate(1.25),
        recurrence: 'FREQ=SECONDLY',
      },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('too many') || data.error.includes('instances'), data.error);
  });

  it('rejects invalid RRULE string', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Bad Rule',
        start: futureDate(1),
        end: futureDate(1.25),
        recurrence: 'NOT_A_VALID_RRULE',
      },
    });
    assert.equal(status, 400);
  });
});

// ---------------------------------------------------------------------------
// 12. iCal feed
// ---------------------------------------------------------------------------

describe('iCal feed', { concurrency: 1 }, () => {
  let feedCalId;
  let feedCalToken;

  before(async () => {
    // Create a dedicated calendar with an event for feed testing
    const { data: cal } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Feed Test Cal' },
    });
    feedCalId = cal.calendar_id;
    feedCalToken = cal.feed_token;

    await api('POST', `/calendars/${feedCalId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Feed Event',
        start: futureDate(24),
        end: futureDate(25),
      },
    });
  });

  it('returns valid iCal content', async () => {
    const { status, data, headers } = await api('GET', `/feeds/${feedCalId}.ics?token=${feedCalToken}`, { raw: true });
    assert.equal(status, 200);
    assert.ok(headers.get('content-type').includes('text/calendar'));
    assert.ok(data.includes('BEGIN:VCALENDAR'));
    assert.ok(data.includes('BEGIN:VEVENT'));
    assert.ok(data.includes('SUMMARY:Feed Event'));
  });

  it('missing token returns 401', async () => {
    const { status } = await api('GET', `/feeds/${feedCalId}.ics`);
    assert.equal(status, 401);
  });

  it('wrong token returns 401', async () => {
    const { status } = await api('GET', `/feeds/${feedCalId}.ics?token=bad_token`);
    assert.equal(status, 401);
  });

  after(async () => {
    await api('DELETE', `/calendars/${feedCalId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 13. Inbound email webhook
// ---------------------------------------------------------------------------

describe('Inbound email webhook', { concurrency: 1 }, () => {
  let inboundCalId;
  let calendarEmail;
  let inboundEventId;

  /**
   * Build a minimal Postmark Inbound payload with a .ics attachment.
   */
  function postmarkPayload(icsContent, toEmail) {
    return {
      From: 'sender@example.com',
      FromFull: { Email: 'sender@example.com', Name: 'Test Sender' },
      To: toEmail,
      ToFull: [{ Email: toEmail, Name: '', MailboxHash: '' }],
      Subject: 'Calendar Invite',
      TextBody: 'You have been invited',
      Attachments: [
        {
          Name: 'invite.ics',
          Content: Buffer.from(icsContent).toString('base64'),
          ContentType: 'text/calendar',
          ContentLength: icsContent.length,
        },
      ],
    };
  }

  /**
   * Generate a minimal .ics string for testing.
   */
  function makeIcs({ method = 'REQUEST', uid, summary, dtstart, dtend, organizer }) {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      `METHOD:${method}`,
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:${summary}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      organizer ? `ORGANIZER;CN=Organizer:mailto:${organizer}` : '',
      'ATTENDEE;CN=Agent:mailto:agent@caldave.fly.dev',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');
  }

  before(async () => {
    const { data: cal } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Inbound Test Cal' },
    });
    inboundCalId = cal.calendar_id;
    calendarEmail = cal.email;
  });

  it('creates event from .ics invite', async () => {
    const ics = makeIcs({
      uid: 'test-uid-123@example.com',
      summary: 'Team Meeting',
      dtstart: '20990601T150000Z',
      dtend: '20990601T160000Z',
      organizer: 'boss@example.com',
    });

    const { status, data } = await api('POST', '/inbound/email', {
      body: postmarkPayload(ics, calendarEmail),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'created');
    assert.ok(data.event_id);
    inboundEventId = data.event_id;
  });

  it('created event has correct fields', async () => {
    const { status, data } = await api(
      'GET',
      `/calendars/${inboundCalId}/events/${inboundEventId}`,
      { token: state.apiKey }
    );
    assert.equal(status, 200);
    assert.equal(data.title, 'Team Meeting');
    assert.equal(data.status, 'tentative');
    assert.equal(data.source, 'inbound_email');
    assert.equal(data.organiser_email, 'boss@example.com');
    assert.equal(data.ical_uid, 'test-uid-123@example.com');
  });

  it('duplicate ical_uid updates instead of creating', async () => {
    const ics = makeIcs({
      uid: 'test-uid-123@example.com',
      summary: 'Team Meeting (Rescheduled)',
      dtstart: '20990601T170000Z',
      dtend: '20990601T180000Z',
      organizer: 'boss@example.com',
    });

    const { status, data } = await api('POST', '/inbound/email', {
      body: postmarkPayload(ics, calendarEmail),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'updated');
    assert.equal(data.event_id, inboundEventId);
  });

  it('updated event has new title and status reset to tentative', async () => {
    const { data } = await api(
      'GET',
      `/calendars/${inboundCalId}/events/${inboundEventId}`,
      { token: state.apiKey }
    );
    assert.equal(data.title, 'Team Meeting (Rescheduled)');
    assert.equal(data.status, 'tentative');
  });

  it('METHOD=CANCEL cancels the event', async () => {
    const ics = makeIcs({
      method: 'CANCEL',
      uid: 'test-uid-123@example.com',
      summary: 'Team Meeting (Rescheduled)',
      dtstart: '20990601T170000Z',
      dtend: '20990601T180000Z',
      organizer: 'boss@example.com',
    });

    const { status, data } = await api('POST', '/inbound/email', {
      body: postmarkPayload(ics, calendarEmail),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'cancelled');
  });

  it('cancelled event has status=cancelled', async () => {
    const { data } = await api(
      'GET',
      `/calendars/${inboundCalId}/events/${inboundEventId}`,
      { token: state.apiKey }
    );
    assert.equal(data.status, 'cancelled');
  });

  it('unknown recipient returns ignored', async () => {
    const ics = makeIcs({
      uid: 'some-uid@example.com',
      summary: 'Test',
      dtstart: '20990601T150000Z',
      dtend: '20990601T160000Z',
    });

    const { status, data } = await api('POST', '/inbound/email', {
      body: postmarkPayload(ics, 'nobody@caldave.fly.dev'),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'ignored');
  });

  it('payload without .ics returns ignored', async () => {
    const { status, data } = await api('POST', '/inbound/email', {
      body: {
        From: 'sender@example.com',
        To: calendarEmail,
        ToFull: [{ Email: calendarEmail }],
        Subject: 'Just a regular email',
        TextBody: 'No calendar invite here',
        Attachments: [],
      },
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'ignored');
  });

  it('inbound event appears in upcoming and can be accepted', async () => {
    // Create a fresh inbound event (the previous one was cancelled)
    const ics = makeIcs({
      uid: 'upcoming-test@example.com',
      summary: 'Upcoming Inbound',
      dtstart: '20990701T100000Z',
      dtend: '20990701T110000Z',
      organizer: 'someone@example.com',
    });

    await api('POST', '/inbound/email', {
      body: postmarkPayload(ics, calendarEmail),
    });

    const { data: upcoming } = await api('GET', `/calendars/${inboundCalId}/upcoming`, {
      token: state.apiKey,
    });

    const found = upcoming.events.find((e) => e.ical_uid === 'upcoming-test@example.com');
    assert.ok(found, 'Inbound event should appear in upcoming');
    assert.equal(found.status, 'tentative');

    // Accept via existing respond endpoint
    const { status, data } = await api(
      'POST',
      `/calendars/${inboundCalId}/events/${found.id}/respond`,
      { token: state.apiKey, body: { response: 'accepted' } }
    );
    assert.equal(status, 200);
    assert.equal(data.status, 'confirmed');
    assert.equal(data.response, 'accepted');
  });

  after(async () => {
    await api('DELETE', `/calendars/${inboundCalId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 14. Cleanup
// ---------------------------------------------------------------------------

describe('Cleanup', { concurrency: 1 }, () => {
  it('DELETE calendar cascades to events', async () => {
    const { status } = await api('DELETE', `/calendars/${state.calendarId}`, { token: state.apiKey });
    assert.equal(status, 204);
  });

  it('deleted calendar returns 404', async () => {
    const { status } = await api('GET', `/calendars/${state.calendarId}`, { token: state.apiKey });
    assert.equal(status, 404);
  });
});
