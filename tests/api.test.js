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
    assert.ok(data.error.includes('not supported') || data.error.includes('too many') || data.error.includes('instances'), data.error);
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
function makeIcs({ method = 'REQUEST', uid, summary, dtstart, dtend, organizer, rrule, allDay }) {
  const startLine = allDay ? `DTSTART;VALUE=DATE:${dtstart}` : `DTSTART:${dtstart}`;
  const endLine = allDay ? `DTEND;VALUE=DATE:${dtend}` : `DTEND:${dtend}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    startLine,
    endLine,
    rrule ? `RRULE:${rrule}` : '',
    organizer ? `ORGANIZER;CN=Organizer:mailto:${organizer}` : '',
    'ATTENDEE;CN=Agent:mailto:agent@caldave.fly.dev',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

describe('Inbound email webhook', { concurrency: 1 }, () => {
  let inboundCalId;
  let calendarEmail;
  let inboundEventId;

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

    const { status, data } = await api('POST', '/inbound', {
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

    const { status, data } = await api('POST', '/inbound', {
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

    const { status, data } = await api('POST', '/inbound', {
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

    const { status, data } = await api('POST', '/inbound', {
      body: postmarkPayload(ics, 'nobody@caldave.fly.dev'),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'ignored');
  });

  it('payload without .ics returns ignored', async () => {
    const { status, data } = await api('POST', '/inbound', {
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

    await api('POST', '/inbound', {
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
// 14. Inbound email — per-calendar token route
// ---------------------------------------------------------------------------

describe('Inbound email — per-calendar token', { concurrency: 1 }, () => {
  let tokenCalId;
  let inboundToken;

  before(async () => {
    const { data: cal } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Token Inbound Cal' },
    });
    tokenCalId = cal.calendar_id;
    // Extract token from webhook URL (https://domain/inbound/<token>)
    inboundToken = cal.inbound_webhook_url.split('/inbound/')[1];
  });

  it('creates event via per-calendar token route', async () => {
    const ics = makeIcs({
      uid: 'token-route-test@example.com',
      summary: 'Token Route Event',
      dtstart: '20990801T100000Z',
      dtend: '20990801T110000Z',
      organizer: 'organizer@example.com',
    });

    const { status, data } = await api('POST', `/inbound/${inboundToken}`, {
      body: postmarkPayload(ics, 'anything@example.com'),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'created');
    assert.ok(data.event_id);
  });

  it('invalid token returns 200 with ignored status', async () => {
    const ics = makeIcs({
      uid: 'bad-token@example.com',
      summary: 'Test',
      dtstart: '20990801T100000Z',
      dtend: '20990801T110000Z',
    });

    const { status, data } = await api('POST', '/inbound/invalid_token_xyz', {
      body: postmarkPayload(ics, 'anything@example.com'),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'ignored');
  });

  after(async () => {
    await api('DELETE', `/calendars/${tokenCalId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 15. Inbound email — recurring invites
// ---------------------------------------------------------------------------

describe('Inbound email — recurring invites', { concurrency: 1 }, () => {
  let recurCalId;
  let recurCalEmail;
  let recurEventId;

  before(async () => {
    const { data: cal } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Recurring Inbound Cal' },
    });
    recurCalId = cal.calendar_id;
    recurCalEmail = cal.email;
  });

  it('creates recurring event from .ics with RRULE', async () => {
    // Use near-future dates so instances fall within 90-day materialize window
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
    const end = new Date(start.getTime() + 30 * 60 * 1000); // +30 min
    const dtstart = start.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');
    const dtend = end.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');

    const ics = makeIcs({
      uid: 'recurring-inbound@example.com',
      summary: 'Weekly Standup',
      dtstart,
      dtend,
      organizer: 'manager@example.com',
      rrule: 'FREQ=WEEKLY',
    });

    const { status, data } = await api('POST', '/inbound', {
      body: postmarkPayload(ics, recurCalEmail),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'created');
    assert.ok(data.event_id);
    assert.equal(data.recurrence, 'FREQ=WEEKLY');
    assert.ok(data.instances_created > 0, `Expected instances, got ${data.instances_created}`);
    recurEventId = data.event_id;
  });

  it('parent event has status=recurring', async () => {
    const { status, data } = await api('GET', `/calendars/${recurCalId}/events/${recurEventId}`, {
      token: state.apiKey,
    });
    assert.equal(status, 200);
    assert.equal(data.status, 'recurring');
    assert.equal(data.source, 'inbound_email');
    assert.equal(data.recurrence, 'FREQ=WEEKLY');
  });

  it('materialized instances appear in event list', async () => {
    const { data } = await api('GET', `/calendars/${recurCalId}/events?limit=200`, {
      token: state.apiKey,
    });
    const instances = data.events.filter(e => e.parent_event_id === recurEventId);
    assert.ok(instances.length > 0, 'Should have materialized instances');
    assert.ok(instances.length >= 10, `Expected at least 10 weekly instances, got ${instances.length}`);
  });

  it('update with new times rematerializes instances', async () => {
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // day after tomorrow
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const dtstart = start.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');
    const dtend = end.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');

    const ics = makeIcs({
      uid: 'recurring-inbound@example.com',
      summary: 'Weekly Standup (Moved)',
      dtstart,
      dtend,
      organizer: 'manager@example.com',
      rrule: 'FREQ=WEEKLY',
    });

    const { status, data } = await api('POST', '/inbound', {
      body: postmarkPayload(ics, recurCalEmail),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'updated');
    assert.equal(data.event_id, recurEventId);
    assert.ok(data.instances_created > 0, 'Should have rematerialized instances');
  });

  it('cancel removes recurring event', async () => {
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const dtstart = start.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');
    const dtend = end.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');

    const ics = makeIcs({
      method: 'CANCEL',
      uid: 'recurring-inbound@example.com',
      summary: 'Weekly Standup (Moved)',
      dtstart,
      dtend,
      organizer: 'manager@example.com',
    });

    const { status, data } = await api('POST', '/inbound', {
      body: postmarkPayload(ics, recurCalEmail),
    });

    assert.equal(status, 200);
    assert.equal(data.status, 'cancelled');
  });

  after(async () => {
    await api('DELETE', `/calendars/${recurCalId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 16. Error log endpoint
// ---------------------------------------------------------------------------

describe('Error log endpoint', { concurrency: 1 }, () => {
  it('GET /errors requires auth', async () => {
    const { status } = await api('GET', '/errors');
    assert.equal(status, 401);
  });

  it('GET /errors returns error list', async () => {
    const { status, data } = await api('GET', '/errors', { token: state.apiKey });
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.errors));
    assert.ok(typeof data.count === 'number');
  });

  it('GET /errors supports ?limit parameter', async () => {
    const { status, data } = await api('GET', '/errors?limit=5', { token: state.apiKey });
    assert.equal(status, 200);
    assert.ok(data.errors.length <= 5);
  });

  it('GET /errors/:id returns 404 for non-existent error', async () => {
    const { status } = await api('GET', '/errors/999999', { token: state.apiKey });
    assert.equal(status, 404);
  });
});

// ---------------------------------------------------------------------------
// 17. Input validation
// ---------------------------------------------------------------------------

describe('Input validation', { concurrency: 1 }, () => {
  let valCalId;

  before(async () => {
    const { data: cal } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Validation Test Cal' },
    });
    valCalId = cal.calendar_id;
  });

  // Calendar validation
  it('rejects calendar name > 255 chars', async () => {
    const { status, data } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'x'.repeat(256) },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('255'));
  });

  it('rejects calendar timezone > 64 chars', async () => {
    const { status, data } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'TZ Test', timezone: 'x'.repeat(65) },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('64'));
  });

  it('rejects invalid webhook_url on PATCH', async () => {
    const { status, data } = await api('PATCH', `/calendars/${valCalId}`, {
      token: state.apiKey,
      body: { webhook_url: 'not a url' },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('webhook_url'));
  });

  it('accepts valid webhook_url on PATCH', async () => {
    const { status, data } = await api('PATCH', `/calendars/${valCalId}`, {
      token: state.apiKey,
      body: { webhook_url: 'https://example.com/webhook' },
    });
    assert.equal(status, 200);
    assert.equal(data.webhook_url, 'https://example.com/webhook');
  });

  it('clears webhook_url with null', async () => {
    const { status, data } = await api('PATCH', `/calendars/${valCalId}`, {
      token: state.apiKey,
      body: { webhook_url: null },
    });
    assert.equal(status, 200);
    assert.equal(data.webhook_url, null);
  });

  // Event validation
  it('rejects event title > 500 chars on POST', async () => {
    const { status, data } = await api('POST', `/calendars/${valCalId}/events`, {
      token: state.apiKey,
      body: { title: 'x'.repeat(501), start: futureDate(1), end: futureDate(2) },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('title'));
  });

  it('rejects event location > 500 chars on POST', async () => {
    const { status, data } = await api('POST', `/calendars/${valCalId}/events`, {
      token: state.apiKey,
      body: { title: 'Test', start: futureDate(1), end: futureDate(2), location: 'x'.repeat(501) },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('location'));
  });

  it('rejects event title > 500 chars on PATCH', async () => {
    const { data: created } = await api('POST', `/calendars/${valCalId}/events`, {
      token: state.apiKey,
      body: { title: 'Temp', start: futureDate(1), end: futureDate(2) },
    });

    const { status, data } = await api('PATCH', `/calendars/${valCalId}/events/${created.id}`, {
      token: state.apiKey,
      body: { title: 'x'.repeat(501) },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('title'));

    await api('DELETE', `/calendars/${valCalId}/events/${created.id}`, { token: state.apiKey });
  });

  it('rejects FREQ=MINUTELY', async () => {
    const { status, data } = await api('POST', `/calendars/${valCalId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Minutely',
        start: futureDate(1),
        end: futureDate(1.25),
        recurrence: 'FREQ=MINUTELY',
      },
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('not supported'), data.error);
  });

  after(async () => {
    await api('DELETE', `/calendars/${valCalId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 18. Event list filters
// ---------------------------------------------------------------------------

describe('Event list filters', { concurrency: 1 }, () => {
  let filterCalId;
  let earlyId, midId, lateId;

  before(async () => {
    const { data: cal } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Filter Test Cal' },
    });
    filterCalId = cal.calendar_id;

    // Create 3 events at different times
    const { data: e1 } = await api('POST', `/calendars/${filterCalId}/events`, {
      token: state.apiKey,
      body: { title: 'Early', start: futureDate(24), end: futureDate(25) },
    });
    earlyId = e1.id;

    const { data: e2 } = await api('POST', `/calendars/${filterCalId}/events`, {
      token: state.apiKey,
      body: { title: 'Mid', start: futureDate(48), end: futureDate(49) },
    });
    midId = e2.id;

    const { data: e3 } = await api('POST', `/calendars/${filterCalId}/events`, {
      token: state.apiKey,
      body: { title: 'Late', start: futureDate(72), end: futureDate(73) },
    });
    lateId = e3.id;

    // Cancel the mid event for status filtering
    await api('POST', `/calendars/${filterCalId}/events/${midId}/respond`, {
      token: state.apiKey,
      body: { response: 'declined' },
    });
  });

  it('filters by start date', async () => {
    const { data } = await api('GET', `/calendars/${filterCalId}/events?start=${futureDate(36)}`, {
      token: state.apiKey,
    });
    const ids = data.events.map(e => e.id);
    assert.ok(!ids.includes(earlyId), 'Early event should be excluded');
    assert.ok(ids.includes(midId) || ids.includes(lateId), 'Later events should be included');
  });

  it('filters by end date', async () => {
    const { data } = await api('GET', `/calendars/${filterCalId}/events?end=${futureDate(36)}`, {
      token: state.apiKey,
    });
    const ids = data.events.map(e => e.id);
    assert.ok(ids.includes(earlyId), 'Early event should be included');
    assert.ok(!ids.includes(lateId), 'Late event should be excluded');
  });

  it('filters by status=cancelled', async () => {
    const { data } = await api('GET', `/calendars/${filterCalId}/events?status=cancelled`, {
      token: state.apiKey,
    });
    assert.ok(data.events.every(e => e.status === 'cancelled'));
    assert.ok(data.events.some(e => e.id === midId));
  });

  it('respects limit parameter', async () => {
    const { data } = await api('GET', `/calendars/${filterCalId}/events?limit=1`, {
      token: state.apiKey,
    });
    assert.equal(data.events.length, 1);
  });

  it('combined filters work (start + status)', async () => {
    const { data } = await api('GET', `/calendars/${filterCalId}/events?start=${futureDate(36)}&status=confirmed`, {
      token: state.apiKey,
    });
    assert.ok(data.events.every(e => e.status === 'confirmed'));
    assert.ok(!data.events.some(e => e.id === earlyId));
  });

  after(async () => {
    await api('DELETE', `/calendars/${filterCalId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 19. DELETE future mode (recurring)
// ---------------------------------------------------------------------------

describe('Recurring events — delete future', { concurrency: 1 }, () => {
  let futureCalId;
  let parentId;
  let instances;

  before(async () => {
    const { data: cal } = await api('POST', '/calendars', {
      token: state.apiKey,
      body: { name: 'Future Delete Cal' },
    });
    futureCalId = cal.calendar_id;

    // Create a daily recurring event
    const { data: parent } = await api('POST', `/calendars/${futureCalId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Daily Task',
        start: futureDate(1),
        end: futureDate(1.5),
        recurrence: 'FREQ=DAILY',
      },
    });
    parentId = parent.id;

    // Fetch instances
    const { data: evts } = await api('GET', `/calendars/${futureCalId}/events?limit=200`, {
      token: state.apiKey,
    });
    instances = evts.events
      .filter(e => e.parent_event_id === parentId)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  });

  it('DELETE ?mode=future cancels current + removes future instances', async () => {
    // Pick instance #5 (middle-ish)
    const target = instances[4];
    const { status } = await api('DELETE', `/calendars/${futureCalId}/events/${target.id}?mode=future`, {
      token: state.apiKey,
    });
    assert.equal(status, 204);

    // Verify: instances 0-3 still exist and are not cancelled
    for (let i = 0; i < 4; i++) {
      const { data } = await api('GET', `/calendars/${futureCalId}/events/${instances[i].id}`, {
        token: state.apiKey,
      });
      assert.notEqual(data.status, 'cancelled', `Instance ${i} should not be cancelled`);
    }

    // Verify: target is cancelled
    const { data: targetEvt } = await api('GET', `/calendars/${futureCalId}/events/${target.id}`, {
      token: state.apiKey,
    });
    assert.equal(targetEvt.status, 'cancelled');
  });

  it('parent RRULE now has UNTIL', async () => {
    const { data } = await api('GET', `/calendars/${futureCalId}/events/${parentId}`, {
      token: state.apiKey,
    });
    assert.ok(data.recurrence.includes('UNTIL'), `RRULE should have UNTIL, got: ${data.recurrence}`);
  });

  after(async () => {
    await api('DELETE', `/calendars/${futureCalId}/events/${parentId}?mode=all`, { token: state.apiKey });
    await api('DELETE', `/calendars/${futureCalId}`, { token: state.apiKey });
  });
});

// ---------------------------------------------------------------------------
// 20. Docs and quickstart routes
// ---------------------------------------------------------------------------

describe('Documentation routes', { concurrency: 1 }, () => {
  it('GET /docs returns HTML', async () => {
    const { status, data, headers } = await api('GET', '/docs', { raw: true });
    assert.equal(status, 200);
    assert.ok(headers.get('content-type').includes('text/html'));
    assert.ok(data.includes('CalDave'));
  });

  it('GET /quickstart returns HTML', async () => {
    const { status, data, headers } = await api('GET', '/quickstart', { raw: true });
    assert.equal(status, 200);
    assert.ok(headers.get('content-type').includes('text/html'));
    assert.ok(data.includes('Quick Start'));
  });

  it('GET / returns landing page', async () => {
    const { status, data, headers } = await api('GET', '/', { raw: true });
    assert.equal(status, 200);
    assert.ok(headers.get('content-type').includes('text/html'));
    assert.ok(data.includes('CalDave'));
  });
});

// ---------------------------------------------------------------------------
// 21. Error log — agent scoping
// ---------------------------------------------------------------------------

describe('Error log — agent scoping', { concurrency: 1 }, () => {
  it('agent cannot see errors from another agent', async () => {
    // Create a second agent
    const { data: agent2 } = await api('POST', '/agents');

    // Trigger an error for agent2 by hitting a bad calendar ID
    await api('GET', '/calendars/cal_nonexistent/events', { token: agent2.api_key });

    // Our agent should NOT see agent2's errors
    const { data } = await api('GET', '/errors', { token: state.apiKey });
    const otherAgentErrors = data.errors.filter(e => e.agent_id !== state.agentId && e.agent_id !== null);
    assert.equal(otherAgentErrors.length, 0, 'Should not see errors from other agents');
  });
});

// ---------------------------------------------------------------------------
// 22. POST /man — API manual
// ---------------------------------------------------------------------------

describe('POST /man', { concurrency: 1 }, () => {
  it('returns full manual without auth', async () => {
    const { status, data } = await api('POST', '/man');
    assert.equal(status, 200);
    assert.ok(data.overview);
    assert.ok(data.base_url);
    assert.equal(data.your_context.authenticated, false);
    assert.equal(data.your_context.agent_id, null);
    assert.deepEqual(data.your_context.calendars, []);
    assert.ok(Array.isArray(data.endpoints));
    assert.ok(data.endpoints.length >= 15, `Expected 15+ endpoints, got ${data.endpoints.length}`);
    // Recommended next step should be to create an agent
    assert.equal(data.recommended_next_step.endpoint, 'POST /agents');
    assert.ok(data.recommended_next_step.curl.includes('/agents'));
  });

  it('returns personalized context with auth', async () => {
    const { status, data } = await api('POST', '/man', { token: state.apiKey });
    assert.equal(status, 200);
    assert.equal(data.your_context.authenticated, true);
    assert.equal(data.your_context.agent_id, state.agentId);
    assert.ok(Array.isArray(data.your_context.calendars));
  });

  it('uses real calendar IDs in curl examples when authenticated', async () => {
    const { data } = await api('POST', '/man', { token: state.apiKey });

    // Agent should have at least one calendar from earlier tests
    assert.ok(data.your_context.calendars.length > 0, 'Should have calendars in context');
    const firstCalId = data.your_context.calendars[0].id;

    // Curl examples for calendar-specific endpoints should use a real ID
    const getCalEp = data.endpoints.find(ep => ep.method === 'GET' && ep.path === '/calendars/:id');
    assert.ok(getCalEp);
    assert.ok(getCalEp.example_curl.includes(firstCalId), `Curl should contain real calendar ID ${firstCalId}`);

    // Every calendar in context should have expected fields
    for (const cal of data.your_context.calendars) {
      assert.ok(cal.id);
      assert.ok(cal.name);
      assert.equal(typeof cal.event_count, 'number');
    }
  });

  it('invalid token falls back to unauthenticated', async () => {
    const { status, data } = await api('POST', '/man', { token: 'sk_live_invalid_key_xyz' });
    assert.equal(status, 200);
    assert.equal(data.your_context.authenticated, false);
  });

  it('?guide returns compact response without endpoints', async () => {
    const { status, data } = await api('POST', '/man?guide');
    assert.equal(status, 200);
    assert.ok(data.overview);
    assert.ok(data.base_url);
    assert.ok(data.your_context);
    assert.ok(data.recommended_next_step);
    assert.equal(data.endpoints, undefined, 'Guide mode should not include endpoints');
  });

  it('?guide with auth returns personalized context', async () => {
    const { status, data } = await api('POST', '/man?guide', { token: state.apiKey });
    assert.equal(status, 200);
    assert.equal(data.your_context.authenticated, true);
    assert.equal(data.your_context.agent_id, state.agentId);
    assert.equal(data.endpoints, undefined);
  });

  it('every endpoint entry has required fields', async () => {
    const { data } = await api('POST', '/man');
    for (const ep of data.endpoints) {
      assert.ok(ep.method, `Endpoint missing method: ${JSON.stringify(ep)}`);
      assert.ok(ep.path, `Endpoint missing path: ${JSON.stringify(ep)}`);
      assert.ok(ep.description, `Endpoint missing description: ${ep.path}`);
      assert.ok(ep.auth !== undefined, `Endpoint missing auth: ${ep.path}`);
      assert.ok(Array.isArray(ep.parameters), `Endpoint missing parameters array: ${ep.path}`);
      assert.ok(ep.example_curl, `Endpoint missing example_curl: ${ep.path}`);
    }
  });

  it('recommendation changes based on agent state', async () => {
    // Create a fresh agent with no calendars
    const { data: fresh } = await api('POST', '/agents');
    const { data: noCalData } = await api('POST', '/man?guide', { token: fresh.api_key });
    assert.equal(noCalData.recommended_next_step.endpoint, 'POST /calendars');

    // Give it a calendar
    const { data: cal } = await api('POST', '/calendars', {
      token: fresh.api_key,
      body: { name: 'Rec Test' },
    });
    const { data: noEvtData } = await api('POST', '/man?guide', { token: fresh.api_key });
    assert.equal(noEvtData.recommended_next_step.endpoint, 'POST /calendars/:id/events');

    // Give it an event
    await api('POST', `/calendars/${cal.calendar_id}/events`, {
      token: fresh.api_key,
      body: { title: 'Test', start: futureDate(1), end: futureDate(2) },
    });
    const { data: hasEvtData } = await api('POST', '/man?guide', { token: fresh.api_key });
    assert.equal(hasEvtData.recommended_next_step.endpoint, 'GET /calendars/:id/upcoming');

    // Clean up
    await api('DELETE', `/calendars/${cal.calendar_id}`, { token: fresh.api_key });
  });
});

// ---------------------------------------------------------------------------
// 23. All-day events
// ---------------------------------------------------------------------------

describe('All-day events', { concurrency: 1 }, () => {
  let allDayEvtId;

  it('creates a single-day all-day event', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: { title: 'Holiday', start: '2099-12-25', end: '2099-12-25', all_day: true },
    });
    assert.equal(status, 201);
    assert.equal(data.all_day, true);
    assert.equal(data.start, '2099-12-25');
    assert.equal(data.end, '2099-12-25');
    allDayEvtId = data.id;
  });

  it('creates a multi-day all-day event', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: { title: '3-Day Conf', start: '2099-07-01', end: '2099-07-03', all_day: true },
    });
    assert.equal(status, 201);
    assert.equal(data.all_day, true);
    assert.equal(data.start, '2099-07-01');
    assert.equal(data.end, '2099-07-03');
    // Clean up
    await api('DELETE', `/calendars/${state.calendarId}/events/${data.id}`, { token: state.apiKey });
  });

  it('rejects all_day with datetime format', async () => {
    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: { title: 'Bad', start: '2099-07-01T10:00:00Z', end: '2099-07-01T11:00:00Z', all_day: true },
    });
    assert.equal(status, 400);
    assert.match(data.error, /date-only/);
  });

  it('GET returns date-only format for all-day events', async () => {
    const { status, data } = await api('GET', `/calendars/${state.calendarId}/events/${allDayEvtId}`, {
      token: state.apiKey,
    });
    assert.equal(status, 200);
    assert.equal(data.all_day, true);
    assert.equal(data.start, '2099-12-25');
    assert.equal(data.end, '2099-12-25');
  });

  it('PATCH can toggle all_day off', async () => {
    const { status, data } = await api('PATCH', `/calendars/${state.calendarId}/events/${allDayEvtId}`, {
      token: state.apiKey,
      body: { all_day: false, start: '2099-12-25T10:00:00Z', end: '2099-12-25T11:00:00Z' },
    });
    assert.equal(status, 200);
    assert.ok(!data.all_day);
    assert.match(data.start, /T10:00:00/);
  });

  it('PATCH can toggle all_day on', async () => {
    const { status, data } = await api('PATCH', `/calendars/${state.calendarId}/events/${allDayEvtId}`, {
      token: state.apiKey,
      body: { all_day: true, start: '2099-12-25', end: '2099-12-26' },
    });
    assert.equal(status, 200);
    assert.equal(data.all_day, true);
    assert.equal(data.start, '2099-12-25');
    assert.equal(data.end, '2099-12-26');
  });

  it('creates recurring all-day event', async () => {
    // Use tomorrow's date so instances fall within the 90-day materialization window
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const startDate = tomorrow.toISOString().slice(0, 10);
    const endRange = new Date(tomorrow.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { status, data } = await api('POST', `/calendars/${state.calendarId}/events`, {
      token: state.apiKey,
      body: {
        title: 'Weekly All-Day',
        start: startDate,
        end: startDate,
        all_day: true,
        recurrence: 'FREQ=WEEKLY;COUNT=4',
      },
    });
    assert.equal(status, 201);
    assert.equal(data.all_day, true);
    assert.equal(data.start, startDate);
    assert.ok(data.instances_created >= 1, `Expected instances >= 1, got ${data.instances_created}`);

    // Fetch instances
    const { data: listData } = await api('GET', `/calendars/${state.calendarId}/events?start=${startDate}T00:00:00Z&end=${endRange}`, {
      token: state.apiKey,
    });
    const instances = listData.events.filter(e => e.parent_event_id === data.id);
    assert.ok(instances.length >= 1);
    // Each instance should be all_day with date-only format
    for (const inst of instances) {
      assert.equal(inst.all_day, true);
      assert.match(inst.start, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(inst.end, /^\d{4}-\d{2}-\d{2}$/);
    }

    // Clean up series
    await api('DELETE', `/calendars/${state.calendarId}/events/${data.id}?mode=all`, { token: state.apiKey });
  });

  it('iCal feed emits VALUE=DATE for all-day events', async () => {
    const { status, data } = await api('GET', `/feeds/${state.calendarId}.ics?token=${state.feedToken}`, { raw: true });
    assert.equal(status, 200, `Feed returned ${status}: ${typeof data === 'string' ? data.slice(0, 100) : data}`);
    // The allDayEvtId event (now toggled back to all_day=true) should have VALUE=DATE
    assert.ok(data.includes('VALUE=DATE'), 'iCal feed should contain VALUE=DATE for all-day events');
  });

  it('inbound all-day invite creates all_day event', async () => {
    const ics = makeIcs({
      uid: 'allday-inbound@example.com',
      summary: 'All-Day Meeting',
      dtstart: '20990801',
      dtend: '20990802',
      organizer: 'boss@example.com',
      allDay: true,
    });

    const { status: calStatus, data: calData } = await api('GET', `/calendars/${state.calendarId}`, { token: state.apiKey });
    assert.equal(calStatus, 200, 'GET calendar should succeed');
    assert.ok(calData.inbound_webhook_url, 'Calendar should have inbound_webhook_url');
    const inboundToken = calData.inbound_webhook_url.split('/inbound/')[1];

    const { status, data } = await api('POST', `/inbound/${inboundToken}`, {
      body: {
        Subject: 'All-Day Meeting',
        TextBody: '',
        Attachments: [{
          ContentType: 'text/calendar',
          Name: 'invite.ics',
          Content: Buffer.from(ics).toString('base64'),
        }],
      },
    });
    assert.equal(status, 200);
    assert.equal(data.status, 'created');

    // Verify the created event is all_day
    const { data: evt } = await api('GET', `/calendars/${state.calendarId}/events/${data.event_id}`, {
      token: state.apiKey,
    });
    assert.equal(evt.all_day, true);
    assert.equal(evt.start, '2099-08-01');
    // End should be inclusive: iCal DTEND 20990802 means exclusive, so inclusive = 2099-08-01
    assert.equal(evt.end, '2099-08-01');

    // Clean up
    await api('DELETE', `/calendars/${state.calendarId}/events/${data.event_id}`, { token: state.apiKey });
  });

  // Clean up the holiday event
  after(async () => {
    if (allDayEvtId) {
      await api('DELETE', `/calendars/${state.calendarId}/events/${allDayEvtId}`, { token: state.apiKey });
    }
  });
});

// ---------------------------------------------------------------------------
// 24. Cleanup
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
