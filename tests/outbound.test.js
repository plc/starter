/**
 * Unit tests for outbound email iCal generation
 *
 * Tests the pure iCal generation functions without Postmark interaction.
 * Run with: node --test tests/outbound.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { generateInviteIcs, generateReplyIcs } = require('../src/lib/outbound');

/**
 * Unfold iCal line continuations (RFC 5545: CRLF + space = continuation).
 * This makes it safe to use .includes() on the full string.
 */
function unfold(ics) {
  return ics.replace(/\r?\n[ \t]/g, '');
}

describe('generateInviteIcs', () => {
  const calendar = {
    id: 'cal_test123',
    name: 'Test Calendar',
    email: 'cal-test123@invite.caldave.ai',
  };

  it('generates valid METHOD:REQUEST iCal', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Team Standup',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T10:30:00.000Z',
      attendees: ['alice@example.com', 'bob@example.com'],
      ical_sequence: 0,
      created_at: '2025-03-14T12:00:00.000Z',
    };

    const { icsString, icalUid } = generateInviteIcs(event, calendar);

    assert.ok(icsString.includes('METHOD:REQUEST'), 'should set METHOD:REQUEST');
    assert.ok(icsString.includes('BEGIN:VCALENDAR'), 'should have VCALENDAR');
    assert.ok(icsString.includes('BEGIN:VEVENT'), 'should have VEVENT');
    assert.ok(icsString.includes('END:VEVENT'), 'should close VEVENT');
    assert.ok(icsString.includes('END:VCALENDAR'), 'should close VCALENDAR');
  });

  it('sets ORGANIZER to calendar email', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Meeting',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T11:00:00.000Z',
      attendees: ['alice@example.com'],
      ical_sequence: 0,
    };

    const { icsString } = generateInviteIcs(event, calendar);
    const unfolded = unfold(icsString);

    assert.ok(
      unfolded.includes('ORGANIZER') && unfolded.includes('cal-test123@invite.caldave.ai'),
      'should have ORGANIZER with calendar email'
    );
  });

  it('includes all attendees', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Meeting',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T11:00:00.000Z',
      attendees: ['alice@example.com', 'bob@example.com', 'carol@example.com'],
      ical_sequence: 0,
    };

    const { icsString } = generateInviteIcs(event, calendar);
    const unfolded = unfold(icsString);

    assert.ok(unfolded.includes('alice@example.com'), 'should include alice');
    assert.ok(unfolded.includes('bob@example.com'), 'should include bob');
    assert.ok(unfolded.includes('carol@example.com'), 'should include carol');
  });

  it('uses event ical_uid when present', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'existing-uid@external.com',
      title: 'Meeting',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T11:00:00.000Z',
      attendees: ['alice@example.com'],
      ical_sequence: 0,
    };

    const { icsString, icalUid } = generateInviteIcs(event, calendar);

    assert.strictEqual(icalUid, 'existing-uid@external.com');
    assert.ok(icsString.includes('existing-uid@external.com'), 'should use existing ical_uid');
  });

  it('generates ical_uid from event id when not present', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Meeting',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T11:00:00.000Z',
      attendees: ['alice@example.com'],
      ical_sequence: 0,
    };

    const { icalUid } = generateInviteIcs(event, calendar);

    assert.strictEqual(icalUid, 'evt_abc123@caldave.ai');
  });

  it('includes SEQUENCE number', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Meeting',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T11:00:00.000Z',
      attendees: ['alice@example.com'],
      ical_sequence: 3,
    };

    const { icsString } = generateInviteIcs(event, calendar);

    assert.ok(icsString.includes('SEQUENCE:3'), 'should include SEQUENCE:3');
  });

  it('handles all-day events', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Company Holiday',
      start_time: '2025-03-15T00:00:00.000Z',
      end_time: '2025-03-16T00:00:00.000Z',
      all_day: true,
      attendees: ['alice@example.com'],
      ical_sequence: 0,
    };

    const { icsString } = generateInviteIcs(event, calendar);

    assert.ok(icsString.includes('BEGIN:VEVENT'), 'should have VEVENT');
    // ical-generator uses VALUE=DATE for all-day events
    assert.ok(icsString.includes('Company Holiday'), 'should include title');
  });

  it('handles JSON string attendees', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Meeting',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T11:00:00.000Z',
      attendees: '["alice@example.com","bob@example.com"]',
      ical_sequence: 0,
    };

    const { icsString } = generateInviteIcs(event, calendar);
    const unfolded = unfold(icsString);

    assert.ok(unfolded.includes('alice@example.com'), 'should parse and include alice');
    assert.ok(unfolded.includes('bob@example.com'), 'should parse and include bob');
  });

  it('includes description and location', () => {
    const event = {
      id: 'evt_abc123',
      title: 'Offsite',
      start_time: '2025-03-15T10:00:00.000Z',
      end_time: '2025-03-15T17:00:00.000Z',
      description: 'Annual team offsite meeting',
      location: 'Conference Room B',
      attendees: ['alice@example.com'],
      ical_sequence: 0,
    };

    const { icsString } = generateInviteIcs(event, calendar);

    assert.ok(icsString.includes('Annual team offsite meeting'), 'should include description');
    assert.ok(icsString.includes('Conference Room B'), 'should include location');
  });
});

describe('generateReplyIcs', () => {
  const calendar = {
    id: 'cal_test123',
    name: 'Test Calendar',
    email: 'cal-test123@invite.caldave.ai',
  };

  it('generates valid METHOD:REPLY iCal', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'uid-from-invite@external.com',
      title: 'Meeting with Boss',
      start_time: '2025-03-15T14:00:00.000Z',
      end_time: '2025-03-15T15:00:00.000Z',
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'accepted');

    assert.ok(icsString.includes('METHOD:REPLY'), 'should set METHOD:REPLY');
    assert.ok(icsString.includes('BEGIN:VCALENDAR'), 'should have VCALENDAR');
    assert.ok(icsString.includes('BEGIN:VEVENT'), 'should have VEVENT');
  });

  it('sets ORGANIZER to organiser_email', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'uid-from-invite@external.com',
      title: 'Meeting with Boss',
      start_time: '2025-03-15T14:00:00.000Z',
      end_time: '2025-03-15T15:00:00.000Z',
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'accepted');
    const unfolded = unfold(icsString);

    assert.ok(
      unfolded.includes('ORGANIZER') && unfolded.includes('boss@example.com'),
      'should have ORGANIZER with organiser email'
    );
  });

  it('sets ATTENDEE to calendar email', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'uid-from-invite@external.com',
      title: 'Meeting',
      start_time: '2025-03-15T14:00:00.000Z',
      end_time: '2025-03-15T15:00:00.000Z',
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'accepted');
    const unfolded = unfold(icsString);

    assert.ok(
      unfolded.includes('cal-test123@invite.caldave.ai'),
      'should have ATTENDEE with calendar email'
    );
  });

  it('sets PARTSTAT=ACCEPTED for accepted', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'uid@external.com',
      title: 'Meeting',
      start_time: '2025-03-15T14:00:00.000Z',
      end_time: '2025-03-15T15:00:00.000Z',
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'accepted');
    const unfolded = unfold(icsString);

    assert.ok(unfolded.includes('PARTSTAT=ACCEPTED'), 'should include PARTSTAT=ACCEPTED');
  });

  it('sets PARTSTAT=DECLINED for declined', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'uid@external.com',
      title: 'Meeting',
      start_time: '2025-03-15T14:00:00.000Z',
      end_time: '2025-03-15T15:00:00.000Z',
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'declined');
    const unfolded = unfold(icsString);

    assert.ok(unfolded.includes('PARTSTAT=DECLINED'), 'should include PARTSTAT=DECLINED');
  });

  it('sets PARTSTAT=TENTATIVE for tentative', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'uid@external.com',
      title: 'Meeting',
      start_time: '2025-03-15T14:00:00.000Z',
      end_time: '2025-03-15T15:00:00.000Z',
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'tentative');
    const unfolded = unfold(icsString);

    assert.ok(unfolded.includes('PARTSTAT=TENTATIVE'), 'should include PARTSTAT=TENTATIVE');
  });

  it('uses original ical_uid', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'original-uid-12345@google.com',
      title: 'Meeting',
      start_time: '2025-03-15T14:00:00.000Z',
      end_time: '2025-03-15T15:00:00.000Z',
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'accepted');
    const unfolded = unfold(icsString);

    assert.ok(unfolded.includes('original-uid-12345@google.com'), 'should use original ical_uid');
  });

  it('handles all-day events', () => {
    const event = {
      id: 'evt_abc123',
      ical_uid: 'uid@external.com',
      title: 'Company Picnic',
      start_time: '2025-03-15T00:00:00.000Z',
      end_time: '2025-03-16T00:00:00.000Z',
      all_day: true,
      organiser_email: 'boss@example.com',
    };

    const icsString = generateReplyIcs(event, calendar, 'accepted');

    assert.ok(icsString.includes('METHOD:REPLY'), 'should set METHOD:REPLY');
    assert.ok(icsString.includes('Company Picnic'), 'should include title');
    assert.ok(icsString.includes('PARTSTAT=ACCEPTED'), 'should include PARTSTAT');
  });
});
