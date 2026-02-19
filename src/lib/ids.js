/**
 * ID generation utilities
 *
 * All IDs use nanoid with an alphanumeric alphabet and a type prefix:
 *   agt_  — agent
 *   cal_  — calendar
 *   evt_  — event
 *   feed_ — iCal feed token
 *
 * API keys use a longer nanoid with sk_live_ prefix.
 */

const { nanoid, customAlphabet } = require('nanoid');

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shortId = customAlphabet(alphabet, 12);
const longId = customAlphabet(alphabet, 32);

const agentId = () => `agt_${shortId()}`;
const calendarId = () => `cal_${shortId()}`;
const eventId = () => `evt_${shortId()}`;
const feedToken = () => `feed_${longId()}`;
const inboundToken = () => `inb_${longId()}`;
const apiKey = () => `sk_live_${longId()}`;
const humanId = () => `hum_${shortId()}`;
const humanAgentId = () => `ha_${shortId()}`;
const sessionToken = () => `sess_${longId()}`;
const humanApiKey = () => `hk_live_${longId()}`;

module.exports = { agentId, calendarId, eventId, feedToken, inboundToken, apiKey, humanId, humanAgentId, sessionToken, humanApiKey };
