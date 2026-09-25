import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'screenshots', 'screenshots_meeting_lifecycle_agent');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sampleData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/meeting_lifecycle_sample_data.json'), 'utf8'));

// Common Google Cloud Geometric Logo SVG
const GOOGLE_CLOUD_LOGO_SVG = `
<svg viewBox="0 0 192 155" fill="none" style="width:36px; height:29px;">
  <path d="M152.6 63.8c-1.8 0-3.6.2-5.3.5C141.4 39.4 120.4 22 95.5 22c-23.7 0-43.9 15.8-50.5 37.8-2.6-.9-5.4-1.4-8.3-1.4C16.4 58.4 0 74.8 0 95.1s16.4 36.7 36.7 36.7h115.9c21.7 0 39.4-17.6 39.4-39.4 0-21.7-17.7-38.6-39.4-38.6z" fill="#4285F4"/>
  <path d="M95.5 22c-15.6 0-29.6 7-39 18l19.5 19.5c4.7-5.5 11.7-9.1 19.5-9.1 14.3 0 25.9 11.6 25.9 25.9 0 2.4-.3 4.8-1 7l27.1 27.1c1.5-4.4 2.3-9.1 2.3-14 0-38.3-24.9-69.4-54.3-69.4z" fill="#EA4335"/>
  <path d="M152.6 131.8H36.7c-9.1 0-17.4-3.4-23.8-9l20.4-20.4c1.1.7 2.2 1.2 3.4 1.4h115.9c6.4 0 11.6-5.2 11.6-11.6 0-3.2-1.3-6.1-3.4-8.2l20.4-20.4c7.3 7.3 11.8 17.4 11.8 28.6 0 21.8-18.1 39.6-40.4 39.6z" fill="#34A853"/>
  <path d="M36.7 58.4c2.9 0 5.7.5 8.3 1.4C51.6 37.8 71.8 22 95.5 22c15.6 0 29.6 7 39 18L115 59.5c-4.7-5.5-11.7-9.1-19.5-9.1-14.3 0-25.9 11.6-25.9 25.9 0 2.4.3 4.8 1 7l-27.1 27.1c-1.5-4.4-2.3-9.1-2.3-14 0-20.3 16.4-38 35.5-38z" fill="#FBBC04"/>
</svg>`;

function wrapSlideHtml(title, subtitle, stageBadge, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1600px;
    height: 1050px;
    background: #0b0f19;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .slide-header {
    height: 90px;
    padding: 0 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(15, 23, 42, 0.85);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(12px);
    z-index: 10;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .header-title-box h1 {
    font-size: 23px;
    font-weight: 700;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-title-box p {
    font-size: 13px;
    color: #94a3b8;
    margin-top: 3px;
  }
  .header-badges {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .stage-badge {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    background: rgba(66, 133, 244, 0.18);
    border: 1px solid rgba(66, 133, 244, 0.5);
    color: #8ab4f8;
  }
  .live-badge {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    background: rgba(52, 168, 83, 0.15);
    border: 1px solid rgba(52, 168, 83, 0.5);
    color: #81c995;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #34a853;
    box-shadow: 0 0 8px #34a853;
  }
  .slide-main {
    flex: 1;
    padding: 30px 40px;
    display: flex;
    gap: 28px;
    min-height: 0;
  }
  .col-card {
    flex: 1;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }
  .col-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .col-card-title {
    font-size: 16.5px;
    font-weight: 700;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .col-card-subtitle {
    font-size: 12px;
    color: #94a3b8;
    font-family: 'JetBrains Mono', monospace;
  }
  .slide-footer {
    height: 48px;
    padding: 0 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(11, 15, 25, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 12px;
    color: #64748b;
  }
</style>
</head>
<body>
  <header class="slide-header">
    <div class="header-left">
      ${GOOGLE_CLOUD_LOGO_SVG}
      <div class="header-title-box">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
    </div>
    <div class="header-badges">
      <div class="stage-badge">${stageBadge}</div>
      <div class="live-badge"><span class="live-dot"></span>GEMINI ENTERPRISE LIVE GROUND TRUTH</div>
    </div>
  </header>
  <main class="slide-main">
    ${contentHtml}
  </main>
  <footer class="slide-footer">
    <span>Google Cloud Gemini Enterprise • Meeting Lifecycle Agent</span>
    <span>Autonomous Workflow Parity Verification • Zero Hallucination Standard</span>
  </footer>
</body>
</html>`;
}

// SLIDE 1: Pre-Meeting Context & Briefing
function generateSlide1Html() {
  const b = sampleData.stage_1_pre_meeting_brief;
  const leftHtml = `
    <div class="col-card" style="flex: 0.9;">
      <div class="col-card-header">
        <div class="col-card-title">📅 Google Calendar Invite &amp; Event Metadata</div>
        <div class="col-card-subtitle">MEET-2026-AI-Q4</div>
      </div>
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:18px; margin-bottom:18px;">
        <div style="font-size:18px; font-weight:700; color:#ffffff; margin-bottom:8px;">${sampleData.title}</div>
        <div style="font-size:13px; color:#94a3b8; display:flex; gap:16px; margin-bottom:12px;">
          <span>🕒 2:00 PM – 3:00 PM (60 min)</span>
          <span>📍 Google Meet</span>
        </div>
        <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px; background:rgba(66,133,244,0.15); border:1px solid rgba(66,133,244,0.4); border-radius:6px; color:#8ab4f8; font-size:12.5px; font-family:monospace;">
          <span>📹</span>
          <span>${sampleData.meet_url}</span>
        </div>
      </div>

      <div style="font-size:13.5px; font-weight:700; color:#e2e8f0; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">Confirmed Attendees (4)</div>
      <div style="display:flex; flex-direction:column; gap:10px; flex:1; overflow-y:auto;">
        ${sampleData.attendees.map(a => `
          <div style="display:flex; align-items:flex-start; gap:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); padding:12px 14px; border-radius:8px;">
            <div style="width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg, #1a73e8, #4285f4); display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; font-size:13px; flex-shrink:0;">
              ${a.name.split(' ').map(n=>n[0]).join('')}
            </div>
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:13.5px; font-weight:700; color:#fff;">${a.name}</span>
                <span style="font-size:11.5px; color:#94a3b8; background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px;">${a.role}</span>
              </div>
              <div style="font-size:12px; color:#cbd5e1; margin-top:4px;"><strong>Focus:</strong> ${a.focus}</div>
              <div style="font-size:11px; color:#64748b; margin-top:2px;">Prior: ${a.prior_decisions}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const rightHtml = `
    <div class="col-card" style="flex: 1.1; background:rgba(15,23,42,0.85); border-color:rgba(66,133,244,0.3);">
      <div class="col-card-header">
        <div class="col-card-title">✨ Gemini Enterprise Executive Pre-Meeting Brief</div>
        <div class="col-card-subtitle" style="color:#81c995;">Generated: 30m Prior • Drive &amp; Email Grounded</div>
      </div>

      <!-- Executive Context -->
      <div style="background:rgba(66,133,244,0.08); border-left:4px solid #4285f4; padding:14px 16px; border-radius:0 8px 8px 0; margin-bottom:16px;">
        <div style="font-size:12px; font-weight:700; color:#8ab4f8; text-transform:uppercase; margin-bottom:4px;">Strategic Executive Objective</div>
        <div style="font-size:13.5px; color:#e2e8f0; line-height:1.5;">${b.executive_context}</div>
      </div>

      <!-- Strategic Talking Points -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12.5px; font-weight:700; color:#fbbf24; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <span>🎯</span> Key Decision Points &amp; Talking Points
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${b.strategic_talking_points.map(pt => `
            <div style="font-size:13px; color:#cbd5e1; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:10px 14px; border-radius:6px; display:flex; gap:10px;">
              <span style="color:#4285f4; font-weight:700;">•</span>
              <span>${pt}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Linked Ground-Truth Artifacts -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Curated Enterprise Artifacts</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${b.linked_documents.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span>${d.system === 'Google Drive' ? '📄' : '🎫'}</span>
                <span style="font-size:12.5px; font-weight:600; color:#fff;">${d.title}</span>
              </div>
              <span style="font-size:11px; color:#8ab4f8; background:rgba(66,133,244,0.1); padding:2px 8px; border-radius:4px;">${d.system}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Potential Blockers -->
      <div style="background:rgba(234,67,53,0.08); border:1px solid rgba(234,67,53,0.3); padding:12px 14px; border-radius:8px;">
        <div style="font-size:11.5px; font-weight:700; color:#f28b82; text-transform:uppercase; margin-bottom:4px;">⚠️ Proactive Blocker Radar</div>
        <div style="font-size:12.5px; color:#cbd5e1;">${b.potential_blockers[0]}</div>
      </div>
    </div>
  `;

  return wrapSlideHtml(
    'Stage 1: Pre-Meeting Context &amp; Executive Briefing',
    'Autonomous context aggregation from Calendar, Drive documents, and prior email threads 30 minutes before call',
    'STAGE 1 • PREPARE',
    leftHtml + rightHtml
  );
}

// SLIDE 2: Live Meeting Transcript & Real-Time Summarization
function generateSlide2Html() {
  const s = sampleData.stage_2_meeting_transcript_and_summary;
  const leftHtml = `
    <div class="col-card" style="flex: 0.95;">
      <div class="col-card-header">
        <div class="col-card-title">📹 Google Meet • Live Audio &amp; Transcript Stream</div>
        <div class="col-card-subtitle" style="color:#81c995;">REC: 00:58:42 • 100% Fidelity</div>
      </div>

      <!-- Simulated Meet Grid -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
        <div style="background:#1e293b; border-radius:8px; height:100px; display:flex; flex-direction:column; justify-content:flex-end; padding:8px; border:2px solid #34a853; position:relative;">
          <div style="position:absolute; top:8px; left:8px; background:rgba(0,0,0,0.6); padding:2px 6px; border-radius:4px; font-size:10px; color:#81c995;">🟢 Speaking</div>
          <span style="font-size:12px; font-weight:600; color:#fff;">Elena Rostova (VP Eng)</span>
        </div>
        <div style="background:#1e293b; border-radius:8px; height:100px; display:flex; flex-direction:column; justify-content:flex-end; padding:8px; border:1px solid rgba(255,255,255,0.1);">
          <span style="font-size:12px; font-weight:600; color:#fff;">Marcus Chen (Arch)</span>
        </div>
      </div>

      <!-- Real-time transcript feed -->
      <div style="font-size:12.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:8px;">Live Streamed Dialogue Excerpts</div>
      <div style="display:flex; flex-direction:column; gap:10px; flex:1; overflow-y:auto; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); padding:12px; border-radius:8px;">
        ${s.key_transcript_excerpts.map(t => `
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px 12px; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span style="font-size:12.5px; font-weight:700; color:#8ab4f8;">${t.speaker}</span>
              <span style="font-size:11px; font-family:monospace; color:#64748b;">${t.timestamp}</span>
            </div>
            <div style="font-size:12px; color:#cbd5e1; line-height:1.45; font-style:italic;">"${t.quote}"</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const rightHtml = `
    <div class="col-card" style="flex: 1.05; background:rgba(15,23,42,0.85); border-color:rgba(52,168,83,0.3);">
      <div class="col-card-header">
        <div class="col-card-title">🤖 Gemini Enterprise Meeting Intelligence</div>
        <div class="col-card-subtitle" style="color:#81c995;">Decisions &amp; Action Extraction</div>
      </div>

      <!-- 1-Paragraph Executive Summary -->
      <div style="background:rgba(52,168,83,0.08); border-left:4px solid #34a853; padding:12px 16px; border-radius:0 8px 8px 0; margin-bottom:16px;">
        <div style="font-size:11.5px; font-weight:700; color:#81c995; text-transform:uppercase; margin-bottom:4px;">Executive Summary (Auto-Synthesized)</div>
        <div style="font-size:12.5px; color:#e2e8f0; line-height:1.5;">${s.executive_summary}</div>
      </div>

      <!-- Hard Decisions Ratified -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12.5px; font-weight:700; color:#8ab4f8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <span>⚖️</span> Approved Decisions (3)
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${s.hard_decisions.map(d => `
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px 12px; border-radius:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12.5px; font-weight:700; color:#fff;">${d.summary}</span>
                <span style="font-size:11px; color:#81c995; background:rgba(52,168,83,0.15); padding:2px 8px; border-radius:4px;">${d.category}</span>
              </div>
              <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">Sign-off: <strong>${d.sign_off}</strong></div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Action Items Table -->
      <div style="flex:1;">
        <div style="font-size:12.5px; font-weight:700; color:#fbbf24; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <span>📋</span> Extracted Action Items &amp; Owners
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:12px; color:#cbd5e1;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1); text-align:left; color:#94a3b8; font-size:11px;">
              <th style="padding:6px 8px;">ID</th>
              <th style="padding:6px 8px;">Action Item</th>
              <th style="padding:6px 8px;">Owner</th>
              <th style="padding:6px 8px;">Due Date</th>
              <th style="padding:6px 8px;">Target</th>
            </tr>
          </thead>
          <tbody>
            ${s.action_items.map(a => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:7px 8px; font-family:monospace; color:#8ab4f8;">${a.item_id}</td>
                <td style="padding:7px 8px; font-weight:600; color:#fff;">${a.title}</td>
                <td style="padding:7px 8px; color:#e2e8f0;">${a.assignee}</td>
                <td style="padding:7px 8px; font-family:monospace; color:#f28b82;">${a.due_date}</td>
                <td style="padding:7px 8px;"><span style="background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-size:10.5px;">${a.target_system}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return wrapSlideHtml(
    'Stage 2: Live Meeting Transcript &amp; Decision Extraction',
    'Real-time meeting intelligence: Google Meet transcript stream compiled into executive summary, hard decisions, and action items',
    'STAGE 2 • SUMMARIZE',
    leftHtml + rightHtml
  );
}

// SLIDE 3: Automated Follow-Up & Action Dispatch
function generateSlide3Html() {
  const f = sampleData.stage_3_automated_followup;
  const leftHtml = `
    <div class="col-card" style="flex: 1;">
      <div class="col-card-header">
        <div class="col-card-title">✉️ Gmail Autonomous Draft Engine</div>
        <div class="col-card-subtitle" style="color:#8ab4f8;">Personalized Recaps • Ready to Send</div>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; flex:1; overflow-y:auto;">
        ${f.gmail_drafts.map(d => `
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div style="font-size:12px; color:#94a3b8;">To: <span style="color:#8ab4f8; font-weight:600;">${d.recipient}</span></div>
              <span style="font-size:10.5px; background:rgba(66,133,244,0.15); color:#8ab4f8; padding:2px 8px; border-radius:4px;">Draft Staged</span>
            </div>
            <div style="font-size:13.5px; font-weight:700; color:#fff; margin-bottom:8px;">${d.subject}</div>
            <div style="font-size:12px; color:#cbd5e1; line-height:1.45; white-space:pre-line; background:rgba(0,0,0,0.25); padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.04);">
              ${d.body_preview}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const rightHtml = `
    <div class="col-card" style="flex: 1; background:rgba(15,23,42,0.85); border-color:rgba(251,191,36,0.3);">
      <div class="col-card-header">
        <div class="col-card-title">🎫 Atlassian Jira &amp; Calendar Synchronization</div>
        <div class="col-card-subtitle" style="color:#81c995;">Zero Manual Data Entry</div>
      </div>

      <!-- Staged Jira Tickets -->
      <div style="margin-bottom:18px;">
        <div style="font-size:12.5px; font-weight:700; color:#fbbf24; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span>🎯</span> Staged Jira Tickets (${f.jira_tickets_staged.length})
        </div>
        <div style="display:flex; flex-direction:column; gap:9px;">
          ${f.jira_tickets_staged.map(t => `
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:10px 14px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px;">
                  <span style="font-size:12px; font-family:monospace; font-weight:700; color:#4285f4; background:rgba(66,133,244,0.15); padding:2px 6px; border-radius:4px;">${t.key}</span>
                  <span style="font-size:12.5px; font-weight:600; color:#fff;">${t.summary}</span>
                </div>
                <div style="font-size:11.5px; color:#94a3b8;">Assignee: <strong style="color:#e2e8f0;">${t.assignee}</strong> • Due: <strong style="color:#f28b82;">${t.due_date}</strong></div>
              </div>
              <span style="font-size:11px; background:rgba(52,168,83,0.15); color:#81c995; border:1px solid rgba(52,168,83,0.4); padding:3px 8px; border-radius:4px; font-weight:600;">${t.status}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Automated Calendar Checkpoint -->
      <div style="background:rgba(66,133,244,0.08); border:1px solid rgba(66,133,244,0.3); padding:16px; border-radius:10px;">
        <div style="font-size:12px; font-weight:700; color:#8ab4f8; text-transform:uppercase; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
          <span>📅</span> Auto-Scheduled Milestone Checkpoint
        </div>
        <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:4px;">${f.calendar_milestone_event.summary}</div>
        <div style="font-size:12px; color:#cbd5e1; margin-bottom:8px;">Scheduled for <strong>Sept 30, 2026 @ 4:00 PM</strong> (30 minutes)</div>
        <div style="font-size:11px; color:#94a3b8;">Invited: ${f.calendar_milestone_event.attendees.join(', ')}</div>
      </div>
    </div>
  `;

  return wrapSlideHtml(
    'Stage 3: Autonomous Follow-Up &amp; Action Dispatch',
    'Zero manual data entry: Personalized attendee Gmail drafts, Jira issues staged, and calendar milestone checkpoints scheduled',
    'STAGE 3 • FOLLOW UP',
    leftHtml + rightHtml
  );
}

// SLIDE 4: Before & After Meeting Lifecycle Parity Matrix
function generateSlide4Html() {
  const r = sampleData.lifecycle_roi_metrics;
  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:24px; width:100%;">
      <!-- High-Level Metric Tiles -->
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:18px;">
        <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(66,133,244,0.3); border-radius:12px; padding:20px; text-align:center;">
          <div style="font-size:36px; font-weight:800; color:#4285f4; margin-bottom:4px;">${r.time_saved_percentage}%</div>
          <div style="font-size:13px; font-weight:700; color:#ffffff; text-transform:uppercase;">Time Saved Per Meeting</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:4px;">From 4.5 hrs down to 15 mins</div>
        </div>
        <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(52,168,83,0.3); border-radius:12px; padding:20px; text-align:center;">
          <div style="font-size:36px; font-weight:800; color:#34a853; margin-bottom:4px;">100%</div>
          <div style="font-size:13px; font-weight:700; color:#ffffff; text-transform:uppercase;">Action Follow-Through</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:4px;">Zero lost technical decisions</div>
        </div>
        <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(251,191,36,0.3); border-radius:12px; padding:20px; text-align:center;">
          <div style="font-size:36px; font-weight:800; color:#fbbf24; margin-bottom:4px;">Instant</div>
          <div style="font-size:13px; font-weight:700; color:#ffffff; text-transform:uppercase;">Follow-Up Velocity</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:4px;">Drafts ready within 60 seconds</div>
        </div>
        <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(234,67,53,0.3); border-radius:12px; padding:20px; text-align:center;">
          <div style="font-size:36px; font-weight:800; color:#ea4335; margin-bottom:4px;">0</div>
          <div style="font-size:13px; font-weight:700; color:#ffffff; text-transform:uppercase;">Manual Data Entry</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:4px;">Auto-dispatched to Jira &amp; Gmail</div>
        </div>
      </div>

      <!-- Comparative Side-by-Side Matrix -->
      <div style="display:flex; gap:24px; flex:1;">
        <!-- Left: Manual Workflow -->
        <div class="col-card" style="flex:1; border-color:rgba(234,67,53,0.25);">
          <div class="col-card-header">
            <div class="col-card-title" style="color:#f28b82;">❌ Legacy Manual Meeting Lifecycle</div>
            <div class="col-card-subtitle" style="color:#ea4335;">High Friction • 4.5 Hours Lost</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:14px; font-size:13px;">
            <div style="background:rgba(234,67,53,0.06); padding:12px; border-radius:8px; border:1px solid rgba(234,67,53,0.2);">
              <div style="font-weight:700; color:#f28b82; margin-bottom:4px;">1. Pre-Meeting Drag (60–90 min)</div>
              <div style="color:#cbd5e1;">Organizer manually scours emails, Slack, and Drive folders to construct briefing notes and agenda. Key attendees arrive under-prepared.</div>
            </div>
            <div style="background:rgba(234,67,53,0.06); padding:12px; border-radius:8px; border:1px solid rgba(234,67,53,0.2);">
              <div style="font-weight:700; color:#f28b82; margin-bottom:4px;">2. In-Meeting Distraction (60 min)</div>
              <div style="color:#cbd5e1;">Participants split attention typing fragmented notes rather than actively contributing. Decisions are buried in rambling recordings.</div>
            </div>
            <div style="background:rgba(234,67,53,0.06); padding:12px; border-radius:8px; border:1px solid rgba(234,67,53,0.2);">
              <div style="font-weight:700; color:#f28b82; margin-bottom:4px;">3. Post-Meeting Delay (2–3 days)</div>
              <div style="color:#cbd5e1;">Follow-up emails take days to draft. 38% of action items are never filed into Jira. Commitments fall through the cracks.</div>
            </div>
          </div>
        </div>

        <!-- Right: Gemini Enterprise Agent -->
        <div class="col-card" style="flex:1; border-color:rgba(52,168,83,0.35); background:rgba(15,23,42,0.85);">
          <div class="col-card-header">
            <div class="col-card-title" style="color:#81c995;">✨ Gemini Enterprise Autonomous Agent</div>
            <div class="col-card-subtitle" style="color:#34a853;">Full Lifecycle • 15 Minutes Total</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:14px; font-size:13px;">
            <div style="background:rgba(52,168,83,0.06); padding:12px; border-radius:8px; border:1px solid rgba(52,168,83,0.25);">
              <div style="font-weight:700; color:#81c995; margin-bottom:4px;">1. Executive Briefing Delivered Automatically (0 min)</div>
              <div style="color:#cbd5e1;">Agent aggregates attendee profiles, linked Drive specifications, prior commitments, and blockers 30 min before start.</div>
            </div>
            <div style="background:rgba(52,168,83,0.06); padding:12px; border-radius:8px; border:1px solid rgba(52,168,83,0.25);">
              <div style="font-weight:700; color:#81c995; margin-bottom:4px;">2. Real-Time Intelligence &amp; Hard Decisions (Live)</div>
              <div style="color:#cbd5e1;">Speech-to-text transcript synthesized into an executive summary, ratified decisions, and prioritized action table in real time.</div>
            </div>
            <div style="background:rgba(52,168,83,0.06); padding:12px; border-radius:8px; border:1px solid rgba(52,168,83,0.25);">
              <div style="font-weight:700; color:#81c995; margin-bottom:4px;">3. Instant Cross-Platform Action Dispatch (60 sec)</div>
              <div style="color:#cbd5e1;">Personalized Gmail drafts staged for all attendees, Jira tickets filed with context links, and milestone reviews scheduled.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return wrapSlideHtml(
    'Meeting Lifecycle Business Value &amp; ROI Parity Matrix',
    'Quantitative comparison: 94.4% time reduction and 100% action item accountability across the entire meeting lifecycle',
    'EXECUTIVE ROI • BEFORE &amp; AFTER',
    contentHtml
  );
}

async function run() {
  console.log('🚀 Launching Google Chrome to generate Meeting Lifecycle Agent Slides...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--window-size=1600,1050']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1050, deviceScaleFactor: 2 });

    const slides = [
      { name: '01_pre_meeting_context_and_briefing.png', html: generateSlide1Html() },
      { name: '02_live_meeting_transcript_and_decisions.png', html: generateSlide2Html() },
      { name: '03_automated_followup_and_action_dispatch.png', html: generateSlide3Html() },
      { name: '04_meeting_lifecycle_parity_and_roi_matrix.png', html: generateSlide4Html() },
    ];

    for (const slide of slides) {
      console.log(`Generating slide: ${slide.name}...`);
      await page.setContent(slide.html, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 600));
      await page.screenshot({ path: path.join(OUT_DIR, slide.name), fullPage: false });
      console.log(`✅ Saved: ${slide.name}`);
    }

    console.log('\n🎉 ALL 4 MEETING LIFECYCLE AGENT SLIDES GENERATED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Failed to generate slides:', err);
  process.exit(1);
});
