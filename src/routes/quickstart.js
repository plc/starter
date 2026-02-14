/**
 * Interactive quick start route
 *
 * GET /quickstart — guided walkthrough: create agent → create calendar → create event
 */

const { Router } = require('express');

const router = Router();

const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.ai';
const EMAIL_DOMAIN = process.env.CALDAVE_EMAIL_DOMAIN || 'invite.caldave.ai';

router.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CalDave — Quick Start</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem 1rem; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.25rem; }
    h1 a { color: #60a5fa; text-decoration: none; font-size: 1rem; margin-left: 1rem; }
    h1 a:hover { color: #93c5fd; }
    .subtitle { color: #94a3b8; margin-bottom: 2.5rem; }
    .step { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; opacity: 0.4; pointer-events: none; transition: opacity 0.3s; }
    .step.active { opacity: 1; pointer-events: auto; }
    .step.done { opacity: 0.6; }
    .step-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
    .step-num { width: 28px; height: 28px; border-radius: 50%; background: #334155; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 0.8125rem; font-weight: 600; flex-shrink: 0; }
    .step.active .step-num { background: #2563eb; color: #fff; }
    .step.done .step-num { background: #22c55e; color: #fff; }
    .step-title { font-size: 1rem; font-weight: 600; color: #fff; }
    .step-desc { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1rem; }
    pre { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 0.875rem; overflow-x: auto; margin-bottom: 1rem; position: relative; cursor: pointer; }
    pre:hover { border-color: #475569; }
    pre::after { content: 'Click to copy'; position: absolute; top: 0.5rem; right: 0.5rem; font-size: 0.65rem; color: #64748b; background: #1e293b; padding: 0.125rem 0.375rem; border-radius: 3px; }
    pre.copied::after { content: 'Copied!'; color: #22c55e; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; color: #e2e8f0; white-space: pre-wrap; word-break: break-all; }
    .fields { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; }
    label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.125rem; display: block; }
    input, select { width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 0.5rem 0.75rem; color: #e2e8f0; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; outline: none; transition: border-color 0.15s; }
    input:focus, select:focus { border-color: #2563eb; }
    input::placeholder { color: #475569; }
    .btn { display: inline-block; padding: 0.5rem 1.25rem; border-radius: 8px; border: none; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #3b82f6; }
    .btn-primary:disabled { background: #1e3a5f; color: #64748b; cursor: not-allowed; }
    .or-divider { text-align: center; color: #475569; font-size: 0.75rem; margin: 0.75rem 0; }
    .inline-code { background: #334155; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.8125rem; font-family: 'SF Mono', 'Fira Code', monospace; }
    .tabs { display: flex; gap: 0; margin-bottom: 0; }
    .tab { flex: 1; padding: 0.625rem 1rem; text-align: center; font-size: 0.8125rem; font-weight: 500; color: #64748b; background: #0f172a; border: 1px solid #334155; cursor: pointer; transition: all 0.15s; }
    .tab:first-child { border-radius: 8px 0 0 0; }
    .tab:last-child { border-radius: 0 8px 0 0; }
    .tab.active { color: #fff; background: #1e293b; border-bottom-color: #1e293b; }
    .tab-content { display: none; background: #1e293b; border: 1px solid #334155; border-top: none; border-radius: 0 0 8px 8px; padding: 1.25rem; }
    .tab-content.active { display: block; }
    .tab-content p { color: #94a3b8; font-size: 0.875rem; margin-bottom: 0.75rem; }
    .tab-content .email-addr { display: block; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 0.625rem 0.75rem; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.875rem; color: #60a5fa; margin-bottom: 0.75rem; cursor: pointer; position: relative; }
    .tab-content .email-addr:hover { border-color: #475569; }
    .tab-content .email-addr::after { content: 'Click to copy'; position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 0.65rem; color: #64748b; }
    .tab-content .email-addr.copied::after { content: 'Copied!'; color: #22c55e; }
    .docs-link { color: #60a5fa; text-decoration: none; font-size: 0.875rem; }
    .docs-link:hover { color: #93c5fd; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Quick Start <a href="/">← Home</a></h1>
    <p class="subtitle">Set up your agent and calendar, then start adding events. Looking for field names and parameters? <a href="/docs" style="color:#60a5fa">Full API reference →</a></p>

    <div style="background:#1a1a2e; border-left:3px solid #fbbf24; padding:0.625rem 1rem; border-radius:0 8px 8px 0; margin-bottom:1.5rem; font-size:0.8125rem; color:#fbbf24;">
      <strong>AI agents:</strong> Use <code style="background:#334155; padding:0.125rem 0.375rem; border-radius:4px;">curl</code> or HTTP requests instead of browsing this page. Run <code style="background:#334155; padding:0.125rem 0.375rem; border-radius:4px;">curl -s "https://${DOMAIN}/man?guide"</code> for a machine-readable guide.
    </div>

    <!-- ===== STEP 1: Create Agent ===== -->
    <div class="step active" id="step1">
      <div class="step-header">
        <span class="step-num">1</span>
        <span class="step-title">Create an agent</span>
      </div>
      <p class="step-desc">Run this command in your terminal, then paste the results below.</p>
      <pre id="cmd1" onclick="copyCmd(this)"><code>curl -s -X POST "https://${DOMAIN}/agents"</code></pre>
      <div class="or-divider">paste your results</div>
      <div class="fields">
        <div>
          <label for="agent-id">Agent ID</label>
          <input type="text" id="agent-id" placeholder="agt_..." oninput="checkStep1()">
        </div>
        <div>
          <label for="api-key">API Key</label>
          <input type="text" id="api-key" placeholder="sk_live_..." oninput="checkStep1()">
        </div>
      </div>
      <button class="btn btn-primary" id="next1" disabled onclick="completeStep1()">Next</button>
    </div>

    <!-- ===== STEP 2: Create Calendar ===== -->
    <div class="step" id="step2">
      <div class="step-header">
        <span class="step-num">2</span>
        <span class="step-title">Create a calendar</span>
      </div>
      <p class="step-desc">Customise the name and timezone, then run the command below.</p>
      <div class="fields">
        <div>
          <label for="cal-name">Calendar name</label>
          <input type="text" id="cal-name" placeholder="Work Schedule" value="My Calendar" oninput="updateStep2Cmd()">
        </div>
        <div>
          <label for="cal-tz">Timezone</label>
          <select id="cal-tz" onchange="updateStep2Cmd()">
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/Denver">America/Denver</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Europe/London">Europe/London</option>
            <option value="Europe/Paris">Europe/Paris</option>
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="Asia/Shanghai">Asia/Shanghai</option>
            <option value="Australia/Sydney">Australia/Sydney</option>
          </select>
        </div>
      </div>
      <pre id="cmd2" onclick="copyCmd(this)"><code id="cmd2-code"></code></pre>
      <div class="or-divider">paste your calendar ID</div>
      <div class="fields">
        <div>
          <label for="cal-id">Calendar ID</label>
          <input type="text" id="cal-id" placeholder="cal_..." oninput="checkStep2()">
        </div>
      </div>
      <button class="btn btn-primary" id="next2" disabled onclick="completeStep2()">Next</button>
    </div>

    <!-- ===== STEP 3: Add Events ===== -->
    <div class="step" id="step3">
      <div class="step-header">
        <span class="step-num">3</span>
        <span class="step-title">Add events</span>
      </div>
      <p class="step-desc">You now have a calendar ready for events. Choose how to add them:</p>

      <div class="tabs">
        <div class="tab active" onclick="switchTab('api')">Via API</div>
        <div class="tab" onclick="switchTab('email')">Via email invite</div>
      </div>

      <div class="tab-content active" id="tab-api">
        <p>Use the API to create events programmatically.</p>
        <pre id="cmd3" onclick="copyCmd(this)"><code id="cmd3-code"></code></pre>
        <p><a href="/docs#post-events" class="docs-link">See full event docs →</a></p>
      </div>

      <div class="tab-content" id="tab-email">
        <p>Send calendar invites (.ics) to your calendar's email address. They'll appear as events automatically.</p>
        <div class="email-addr" id="cal-email" onclick="copyEmail(this)"></div>
        <p>Works with Google Calendar, Outlook, Apple Calendar, or any app that sends .ics invites.</p>
      </div>
    </div>

    <footer style="margin-top:3rem; padding-top:1.5rem; border-top:1px solid #334155; text-align:center; font-size:0.8125rem; color:#64748b;">
      <a href="/terms" style="color:#94a3b8; text-decoration:none;">Terms</a> &middot;
      <a href="/privacy" style="color:#94a3b8; text-decoration:none;">Privacy</a> &middot;
      Created by <a href="https://plc.vc/qbs" style="color:#94a3b8; text-decoration:none;">Peter Clark</a>
    </footer>
  </div>

  <script>
    var BASE = window.location.origin;

    function copyCmd(pre) {
      var text = pre.querySelector('code').textContent;
      navigator.clipboard.writeText(text);
      pre.classList.add('copied');
      setTimeout(function() { pre.classList.remove('copied'); }, 1500);
    }

    function copyEmail(el) {
      navigator.clipboard.writeText(el.textContent);
      el.classList.add('copied');
      setTimeout(function() { el.classList.remove('copied'); }, 1500);
    }

    function switchTab(which) {
      var tabs = document.querySelectorAll('.tab');
      var contents = document.querySelectorAll('.tab-content');
      for (var i = 0; i < tabs.length; i++) { tabs[i].classList.remove('active'); }
      for (var i = 0; i < contents.length; i++) { contents[i].classList.remove('active'); }
      if (which === 'api') {
        tabs[0].classList.add('active');
        document.getElementById('tab-api').classList.add('active');
      } else {
        tabs[1].classList.add('active');
        document.getElementById('tab-email').classList.add('active');
      }
    }

    // ---- Step 1 ----
    function checkStep1() {
      var id = document.getElementById('agent-id').value.trim();
      var key = document.getElementById('api-key').value.trim();
      document.getElementById('next1').disabled = !(id && key);
    }

    function completeStep1() {
      document.getElementById('step1').classList.remove('active');
      document.getElementById('step1').classList.add('done');
      document.getElementById('step2').classList.add('active');
      updateStep2Cmd();
      document.getElementById('step2').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ---- Step 2 ----
    var BS = String.fromCharCode(92);
    var NL = String.fromCharCode(10);
    var CONT = ' ' + BS + NL + '  ';

    function updateStep2Cmd() {
      var key = document.getElementById('api-key').value.trim() || 'YOUR_API_KEY';
      var name = document.getElementById('cal-name').value.trim() || 'My Calendar';
      var tz = document.getElementById('cal-tz').value;
      var body = JSON.stringify({ name: name, timezone: tz });
      var lines = [
        'curl -s -X POST "' + BASE + '/calendars"',
        '-H "Content-Type: application/json"',
        '-H "Authorization: Bearer ' + key + '"',
        "-d '" + body + "'"
      ];
      document.getElementById('cmd2-code').textContent = lines.join(CONT);
    }

    function checkStep2() {
      var id = document.getElementById('cal-id').value.trim();
      document.getElementById('next2').disabled = !id;
    }

    function completeStep2() {
      document.getElementById('step2').classList.remove('active');
      document.getElementById('step2').classList.add('done');
      document.getElementById('step3').classList.add('active');
      updateStep3();
      document.getElementById('step3').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ---- Step 3 ----
    function updateStep3() {
      var key = document.getElementById('api-key').value.trim() || 'YOUR_API_KEY';
      var calId = document.getElementById('cal-id').value.trim() || 'CAL_ID';

      // Build example curl for API tab
      var body = JSON.stringify({ title: 'My first event', start: '2025-03-01T10:00:00Z', end: '2025-03-01T11:00:00Z' });
      var lines = [
        'curl -s -X POST "' + BASE + '/calendars/' + calId + '/events"',
        '-H "Content-Type: application/json"',
        '-H "Authorization: Bearer ' + key + '"',
        "-d '" + body + "'"
      ];
      document.getElementById('cmd3-code').textContent = lines.join(CONT);

      // Build email address for email tab
      var emailId = calId.indexOf('cal_') === 0 ? calId.slice(4) : calId;
      document.getElementById('cal-email').textContent = 'cal-' + emailId + '@${EMAIL_DOMAIN}';
    }
  </script>
</body>
</html>`;

  res.send(html);
});

module.exports = router;
