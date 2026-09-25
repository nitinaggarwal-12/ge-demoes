import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'screenshots', 'screenshots_spark_desktop');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sampleData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/spark_desktop_sample_data.json'), 'utf8'));

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
    box-shadow: 0 0 10px #34a853;
  }
  .slide-body {
    flex: 1;
    padding: 32px 40px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    position: relative;
    overflow: hidden;
  }
  .slide-footer {
    height: 52px;
    padding: 0 40px;
    background: rgba(15, 23, 42, 0.7);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #64748b;
  }
  .glass-card {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  }
</style>
</head>
<body>
  <div class="slide-header">
    <div class="header-left">
      ${GOOGLE_CLOUD_LOGO_SVG}
      <div class="header-title-box">
        <h1><span>${title}</span></h1>
        <p>${subtitle}</p>
      </div>
    </div>
    <div class="header-badges">
      <span class="stage-badge">${stageBadge}</span>
      <span class="live-badge"><span class="live-dot"></span>SPARK DESKTOP ACTIVE</span>
    </div>
  </div>
  <div class="slide-body">
    ${contentHtml}
  </div>
  <div class="slide-footer">
    <span>Google Cloud • Gemini Enterprise Desktop Architecture (Project: ucs-agentspace-dogfood #670560280865)</span>
    <span>Authenticated Session: nitinagga@google.com • Gateway Loopback :56679</span>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// SLIDE 1: Spark Desktop Architecture & Gateway Bridge
// -------------------------------------------------------------
const slide1Content = `
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; height: 100%;">
  <div class="glass-card" style="padding: 28px; display: flex; flex-direction: column; gap: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px;">
      <h2 style="font-size: 19px; color: #60a5fa; font-weight: 700;">🖥️ Workstation Core Topology</h2>
      <span style="font-size: 12px; background: rgba(59, 130, 246, 0.2); padding: 4px 10px; border-radius: 6px; color: #93c5fd;">Electron v0.1.1624</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="font-weight: 700; color: #f8fafc; font-size: 15px; margin-bottom: 4px;">1. Electron Desktop Shell (PID 96650)</div>
        <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">Native macOS runtime hosting Chromium UI renderer, deep link URL protocol dispatcher (<code>gemini-enterprise://</code>), and Unix socket auth broker.</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="font-weight: 700; color: #34d399; font-size: 15px; margin-bottom: 4px;">2. Local Python Gateway (PID 96675 • Port 56679)</div>
        <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">FastAPI loopback server orchestrating session state, memory database (<code>memory.db</code>), Discovery Engine RPCs, and tool permission routing.</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="font-weight: 700; color: #fbbf24; font-size: 15px; margin-bottom: 4px;">3. Agent Backend Harness (PID 96674 • Port 56682)</div>
        <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">Local ADK (Agent Development Kit) engine managing multi-turn conversation traces, long unattended task runs, and background scheduler.</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="font-weight: 700; color: #c084fc; font-size: 15px; margin-bottom: 4px;">4. 7 Authorized 1P MCP Toolkits (244 Tools)</div>
        <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">Dedicated subprocesses for Gmail, Google Chat, Calendar, Drive, Docs, Sheets, and Slides communicating over JSON-RPC.</div>
      </div>
    </div>
  </div>

  <div class="glass-card" style="padding: 28px; display: flex; flex-direction: column; gap: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px;">
      <h2 style="font-size: 19px; color: #34d399; font-weight: 700;">☁️ Cloud Grounding & Identity Layer</h2>
      <span style="font-size: 12px; background: rgba(52, 168, 83, 0.2); padding: 4px 10px; border-radius: 6px; color: #81c995;">Discovery Engine API</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #f8fafc;">Allowlisted Project</span>
          <span style="color: #60a5fa; font-family: monospace;">ucs-agentspace-dogfood</span>
        </div>
        <div style="color: #94a3b8; font-size: 13px;">GCP Project Number: <code>670560280865</code> • Owning tenant of the primary dogfood search assistant.</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #f8fafc;">Widget Config ID (cid)</span>
          <span style="color: #34d399; font-family: monospace;">fdd1e98d-1f52-4407-98fd-80e27c61fbc9</span>
        </div>
        <div style="color: #94a3b8; font-size: 13px;">Binds the desktop shell to the global intranet corpus with enterprise web grounding.</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #f8fafc;">Engine Identifier</span>
          <span style="color: #fbbf24; font-family: monospace;">spark_dogfood_search_assistant_v1</span>
        </div>
        <div style="color: #94a3b8; font-size: 13px;">Active Discovery Engine Assistant resource supporting multi-modal Gemini 3.8 and 3.1 Pro models.</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #f8fafc;">Allowlist ESF Killswitch</span>
          <span style="color: #ef4444; font-weight: 700;">COWORK_ENFORCE_DESKTOP_ACCESS_GATE: 0</span>
        </div>
        <div style="color: #94a3b8; font-size: 13px;">Bypasses ESF translation drops, preventing artificial <code>ACCESS_DENIED</code> errors and locking status at <code>READY</code>.</div>
      </div>
    </div>
  </div>
</div>`;

// -------------------------------------------------------------
// SLIDE 2: Authentic Spark UI Walkthrough
// -------------------------------------------------------------
const slide2Content = `
<div style="display: grid; grid-template-columns: 320px 1fr; gap: 24px; height: 100%;">
  <!-- Left Navigation Bar Simulator -->
  <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; justify-content: space-between;">
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div style="display: flex; align-items: center; gap: 10px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <span style="font-size: 22px;">✨</span>
        <span style="font-weight: 700; font-size: 16px; color: #f8fafc;">Gemini Enterprise</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
          <span>✏️</span> New task
        </div>
        <div style="color: #cbd5e1; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span>📋</span> Tasks
        </div>
        <div style="color: #cbd5e1; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span>⏱️</span> Scheduled
        </div>
        <div style="color: #cbd5e1; padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span>🧩</span> Skills &amp; Apps
        </div>
      </div>
      <div style="margin-top: 10px;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Recents</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 13px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 8px 12px; border-radius: 6px;">morning-handoff</div>
          <div style="font-size: 13px; color: #94a3b8; padding: 8px 12px;">pre-meeting-brief</div>
          <div style="font-size: 13px; color: #94a3b8; padding: 8px 12px;">focus-block</div>
        </div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
      <div style="width: 34px; height: 34px; border-radius: 50%; background: #4285f4; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">NA</div>
      <div>
        <div style="font-weight: 700; font-size: 13px; color: #f8fafc;">Nitin Aggarwal</div>
        <div style="font-size: 11px; color: #94a3b8;">nitinagga@google.com</div>
      </div>
    </div>
  </div>

  <!-- Main Canvas -->
  <div class="glass-card" style="padding: 36px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px;">
    <h2 style="font-size: 38px; font-weight: 400; color: #f8fafc; letter-spacing: -0.5px;">Put Spark to work</h2>
    
    <!-- Big Prompt Box -->
    <div style="width: 100%; max-width: 820px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 20px; padding: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 20px;">
      <div style="color: #e2e8f0; font-size: 17px; min-height: 50px;">
        Run my <strong>morning-handoff</strong>: scan my 10 AM Advisory Committee meeting on Google Calendar, check overnight escalation emails from Sarah Jenkins, review protocol deviations in Drive, and draft an executive briefing deck in Slides.
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; gap: 12px; align-items: center;">
          <span style="background: rgba(255,255,255,0.08); padding: 6px 12px; border-radius: 8px; font-size: 13px; color: #cbd5e1; cursor: pointer;">➕ Add context</span>
          <span style="background: rgba(52, 168, 83, 0.15); border: 1px solid rgba(52, 168, 83, 0.4); color: #81c995; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600;">🛡️ Approve For Me ▾</span>
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <span style="background: rgba(66, 133, 244, 0.15); border: 1px solid rgba(66, 133, 244, 0.4); color: #8ab4f8; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;">Gemini 3.8 Flash (Auto) ▾</span>
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px;">↑</div>
        </div>
      </div>
    </div>

    <!-- Active Tasks Tray -->
    <div style="width: 100%; max-width: 820px; display: flex; flex-direction: column; gap: 12px;">
      <div style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase;">Active Desktop Tasks</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
        <div style="background: rgba(15, 23, 42, 0.6); border-left: 4px solid #3b82f6; border-radius: 8px; padding: 14px;">
          <div style="font-weight: 700; color: #f8fafc; font-size: 14px;">morning-handoff</div>
          <div style="color: #38bdf8; font-size: 12px; margin-top: 4px;">Completed • 3 actions queued</div>
        </div>
        <div style="background: rgba(15, 23, 42, 0.6); border-left: 4px solid #10b981; border-radius: 8px; padding: 14px;">
          <div style="font-weight: 700; color: #f8fafc; font-size: 14px;">pre-meeting-brief</div>
          <div style="color: #34d399; font-size: 12px; margin-top: 4px;">Scheduled for 9:45 AM</div>
        </div>
        <div style="background: rgba(15, 23, 42, 0.6); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px;">
          <div style="font-weight: 700; color: #f8fafc; font-size: 14px;">focus-block</div>
          <div style="color: #fbbf24; font-size: 12px; margin-top: 4px;">2h quiet block enqueued</div>
        </div>
      </div>
    </div>
  </div>
</div>`;

// -------------------------------------------------------------
// SLIDE 3: The 7 1P MCP Tool Fabric Grid
// -------------------------------------------------------------
const slide3Content = `
<div style="display: flex; flex-direction: column; gap: 20px; height: 100%;">
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
    <div class="glass-card" style="padding: 20px; border-top: 4px solid #ea4335;">
      <div style="font-size: 24px; margin-bottom: 8px;">📬</div>
      <div style="font-weight: 700; font-size: 16px; color: #f8fafc;">Gmail MCP</div>
      <div style="font-size: 12px; color: #34d399; font-weight: 600; margin: 4px 0;">38 Tools • AUTHORIZED</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">Automated thread search, semantic triage, draft compilation, and autonomous email dispatch.</div>
    </div>
    <div class="glass-card" style="padding: 20px; border-top: 4px solid #00ac47;">
      <div style="font-size: 24px; margin-bottom: 8px;">💬</div>
      <div style="font-weight: 700; font-size: 16px; color: #f8fafc;">Google Chat MCP</div>
      <div style="font-size: 12px; color: #34d399; font-weight: 600; margin: 4px 0;">55 Tools • AUTHORIZED</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">Threaded room communication, real-time alert dispatch, and interactive adaptive card generation.</div>
    </div>
    <div class="glass-card" style="padding: 20px; border-top: 4px solid #4285f4;">
      <div style="font-size: 24px; margin-bottom: 8px;">📅</div>
      <div style="font-weight: 700; font-size: 16px; color: #f8fafc;">Google Calendar MCP</div>
      <div style="font-size: 12px; color: #34d399; font-weight: 600; margin: 4px 0;">22 Tools • AUTHORIZED</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">Schedule scanning, attendee availability resolution, meeting room reservation, and focus-time booking.</div>
    </div>
    <div class="glass-card" style="padding: 20px; border-top: 4px solid #ffba00;">
      <div style="font-size: 24px; margin-bottom: 8px;">📁</div>
      <div style="font-weight: 700; font-size: 16px; color: #f8fafc;">Google Drive MCP</div>
      <div style="font-size: 12px; color: #34d399; font-weight: 600; margin: 4px 0;">23 Tools • AUTHORIZED</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">Cross-enterprise document discovery, revision retrieval, access permission grants, and asset queries.</div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; flex: 1;">
    <div class="glass-card" style="padding: 20px; border-top: 4px solid #2684fc;">
      <div style="font-size: 24px; margin-bottom: 8px;">📄</div>
      <div style="font-weight: 700; font-size: 16px; color: #f8fafc;">Google Docs MCP</div>
      <div style="font-size: 12px; color: #34d399; font-weight: 600; margin: 4px 0;">37 Tools • AUTHORIZED</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">Direct AST manipulation, structured dossier authoring, table formatting, and executive memo synthesis.</div>
    </div>
    <div class="glass-card" style="padding: 20px; border-top: 4px solid #0f9d58;">
      <div style="font-size: 24px; margin-bottom: 8px;">📊</div>
      <div style="font-weight: 700; font-size: 16px; color: #f8fafc;">Google Sheets MCP</div>
      <div style="font-size: 12px; color: #34d399; font-weight: 600; margin: 4px 0;">39 Tools • AUTHORIZED</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">Tabular ledger updates, financial variance recalculation, formula insertion, and audit trail validation.</div>
    </div>
    <div class="glass-card" style="padding: 20px; border-top: 4px solid #f4b400;">
      <div style="font-size: 24px; margin-bottom: 8px;">📑</div>
      <div style="font-weight: 700; font-size: 16px; color: #f8fafc;">Google Slides MCP</div>
      <div style="font-size: 12px; color: #34d399; font-weight: 600; margin: 4px 0;">30 Tools • AUTHORIZED</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">Autonomous multi-slide deck generation from master templates, chart embedding, and speaker notes creation.</div>
    </div>
  </div>
</div>`;

// -------------------------------------------------------------
// SLIDE 4: Executive Morning Handoff Execution Flow
// -------------------------------------------------------------
const slide4Content = `
<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; height: 100%;">
  <!-- Step 1 -->
  <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 13px; font-weight: 700; color: #38bdf8;">STAGE 1 • 07:30 AM</span>
      <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-size: 11px;">Calendar MCP</span>
    </div>
    <div style="font-weight: 700; font-size: 17px; color: #f8fafc;">Schedule Intelligence</div>
    <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
      Scans today's schedule and detects high-stakes meeting at 10:00 AM:
      <div style="font-weight: 700; color: #fbbf24; margin-top: 6px;">MK-3475 Global Steering Committee</div>
      <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">4 Executive Attendees • 1h Duration</div>
    </div>
    <div style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin-top: auto;">
      Autonomously sets the goal: assemble required briefing materials before executive arrives at office.
    </div>
  </div>

  <!-- Step 2 -->
  <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 13px; font-weight: 700; color: #ea4335;">STAGE 2 • 07:31 AM</span>
      <span style="background: rgba(234, 67, 53, 0.15); color: #ea4335; padding: 4px 8px; border-radius: 6px; font-size: 11px;">Gmail MCP</span>
    </div>
    <div style="font-weight: 700; font-size: 17px; color: #f8fafc;">Overnight Triage</div>
    <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
      Filters 62 unread messages down to 3 critical escalation threads:
      <div style="color: #f87171; font-weight: 600; margin-top: 6px;">1. Site 104 Cold-Chain Excursion (3:14 AM)</div>
      <div style="color: #94a3b8; font-size: 11px;">42 vials compromised; 14-day delay risk.</div>
      <div style="color: #cbd5e1; font-weight: 600; margin-top: 4px;">2. FDA Bio-distribution Request</div>
    </div>
    <div style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin-top: auto;">
      Extracts exact blocker details and prepares automated resolution pathways.
    </div>
  </div>

  <!-- Step 3 -->
  <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 13px; font-weight: 700; color: #34d399;">STAGE 3 • 07:32 AM</span>
      <span style="background: rgba(52, 168, 83, 0.15); color: #34d399; padding: 4px 8px; border-radius: 6px; font-size: 11px;">Drive &amp; Sheets</span>
    </div>
    <div style="font-weight: 700; font-size: 17px; color: #f8fafc;">Protocol Reconciler</div>
    <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
      Cross-references trial protocol with financial forecast spreadsheet:
      <div style="color: #81c995; font-weight: 600; margin-top: 6px;">Contingency Draw: $420,000</div>
      <div style="color: #94a3b8; font-size: 11px;">Expedited Amsterdam depot failover recovers 8 days (net 6-day delay vs 14).</div>
    </div>
    <div style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin-top: auto;">
      Updates forecast spreadsheet with new burn rate and reserve balance.
    </div>
  </div>

  <!-- Step 4 -->
  <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 13px; font-weight: 700; color: #fbbf24;">STAGE 4 • 07:34 AM</span>
      <span style="background: rgba(251, 188, 4, 0.15); color: #fbbf24; padding: 4px 8px; border-radius: 6px; font-size: 11px;">Slides &amp; Chat</span>
    </div>
    <div style="font-weight: 700; font-size: 17px; color: #f8fafc;">Action Synthesis</div>
    <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
      Assembles 3-slide executive briefing deck and dispatches Chat recap:
      <div style="color: #fde047; font-weight: 600; margin-top: 6px;">Slides Deck Ready in Drive</div>
      <div style="color: #94a3b8; font-size: 11px;">Draft email waiting for 1-click send.</div>
      <div style="color: #81c995; font-weight: 600; margin-top: 4px;">Chat Card posted to Leadership</div>
    </div>
    <div style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin-top: auto;">
      Zero human copy-paste required. 120 minutes of executive morning administrative toil eliminated.
    </div>
  </div>
</div>`;

// -------------------------------------------------------------
// SLIDE 5: Google Cloud Console Discovery Engine Proof
// -------------------------------------------------------------
const slide5Content = `
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; height: 100%;">
  <div class="glass-card" style="padding: 28px; display: flex; flex-direction: column; gap: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px;">
      <h2 style="font-size: 19px; color: #60a5fa; font-weight: 700;">🏛️ Discovery Engine Architecture</h2>
      <span style="font-size: 12px; background: rgba(59, 130, 246, 0.2); padding: 4px 10px; border-radius: 6px; color: #93c5fd;">Console Verified</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13px;">
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="font-weight: 700; color: #f8fafc; margin-bottom: 4px;">Cloud Console URI</div>
        <div style="color: #60a5fa; font-family: monospace; word-break: break-all;">https://console.cloud.google.com/gemini-enterprise/locations/global/engines/spark_dogfood_search_assistant_v1?project=ucs-agentspace-dogfood</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="font-weight: 700; color: #f8fafc; margin-bottom: 4px;">Tenant Scoping &amp; Security</div>
        <div style="color: #94a3b8; line-height: 1.5;">Discovery Engine enforces zero cross-tenant data leakage. Identity token is vended via local macOS Unix Domain Socket (<code>auth_token.sock</code>) with owner-only (<code>0600</code>) permissions.</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;">
        <div style="font-weight: 700; color: #f8fafc; margin-bottom: 4px;">Private Knowledge Graph Metadata</div>
        <div style="color: #34d399; font-weight: 600;">State: ACTIVE • Session Management: VERTEX_AI_MANAGED</div>
        <div style="color: #94a3b8; margin-top: 4px;">Enables semantic recall of past tasks, contacts, and document references.</div>
      </div>
    </div>
  </div>

  <div class="glass-card" style="padding: 28px; display: flex; flex-direction: column; gap: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px;">
      <h2 style="font-size: 19px; color: #34d399; font-weight: 700;">🔍 Allowlisted Verification Telemetry</h2>
      <span style="font-size: 12px; background: rgba(52, 168, 83, 0.2); padding: 4px 10px; border-radius: 6px; color: #81c995;">Status: 200 OK</span>
    </div>
    <div style="background: #020617; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 18px; font-family: monospace; font-size: 12px; color: #e2e8f0; line-height: 1.6; overflow-y: auto;">
      <span style="color: #64748b;">// Discovery Engine LookupWidgetConfig Response</span><br/>
      {<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"projectNumber"</span>: <span style="color: #fde047;">"670560280865"</span>,<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"projectId"</span>: <span style="color: #81c995;">"ucs-agentspace-dogfood"</span>,<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"widgetConfigId"</span>: <span style="color: #fde047;">"fdd1e98d-1f52-4407-98fd-80e27c61fbc9"</span>,<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"engineId"</span>: <span style="color: #81c995;">"spark_dogfood_search_assistant_v1"</span>,<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"userPrincipal"</span>: <span style="color: #81c995;">"nitinagga@google.com"</span>,<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"location"</span>: <span style="color: #81c995;">"global"</span>,<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"webGroundingType"</span>: <span style="color: #81c995;">"WEB_GROUNDING_TYPE_GOOGLE_SEARCH"</span>,<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"connectors"</span>: [<br/>
      &nbsp;&nbsp;&nbsp;&nbsp;{ <span style="color: #38bdf8;">"id"</span>: <span style="color: #81c995;">"gmail"</span>, <span style="color: #38bdf8;">"status"</span>: <span style="color: #34d399;">"AUTHORIZED"</span> },<br/>
      &nbsp;&nbsp;&nbsp;&nbsp;{ <span style="color: #38bdf8;">"id"</span>: <span style="color: #81c995;">"gchat"</span>, <span style="color: #38bdf8;">"status"</span>: <span style="color: #34d399;">"AUTHORIZED"</span> },<br/>
      &nbsp;&nbsp;&nbsp;&nbsp;{ <span style="color: #38bdf8;">"id"</span>: <span style="color: #81c995;">"gcalendar"</span>, <span style="color: #38bdf8;">"status"</span>: <span style="color: #34d399;">"AUTHORIZED"</span> },<br/>
      &nbsp;&nbsp;&nbsp;&nbsp;{ <span style="color: #38bdf8;">"id"</span>: <span style="color: #81c995;">"gdrive"</span>, <span style="color: #38bdf8;">"status"</span>: <span style="color: #34d399;">"AUTHORIZED"</span> },<br/>
      &nbsp;&nbsp;&nbsp;&nbsp;{ <span style="color: #38bdf8;">"id"</span>: <span style="color: #81c995;">"gdocs"</span>, <span style="color: #38bdf8;">"status"</span>: <span style="color: #34d399;">"AUTHORIZED"</span> },<br/>
      &nbsp;&nbsp;&nbsp;&nbsp;{ <span style="color: #38bdf8;">"id"</span>: <span style="color: #81c995;">"gsheets"</span>, <span style="color: #38bdf8;">"status"</span>: <span style="color: #34d399;">"AUTHORIZED"</span> },<br/>
      &nbsp;&nbsp;&nbsp;&nbsp;{ <span style="color: #38bdf8;">"id"</span>: <span style="color: #81c995;">"gslides"</span>, <span style="color: #38bdf8;">"status"</span>: <span style="color: #34d399;">"AUTHORIZED"</span> }<br/>
      &nbsp;&nbsp;],<br/>
      &nbsp;&nbsp;<span style="color: #38bdf8;">"gateway_phase"</span>: <span style="color: #34d399; font-weight:700;">"READY"</span><br/>
      }
    </div>
  </div>
</div>`;

const SLIDES = [
  {
    filename: '01_spark_desktop_architecture.png',
    title: 'SPARK Desktop System Architecture & Gateway Bridge',
    subtitle: 'Electron Shell, Local Python Gateway (:56679), Local ADK Harness (:56682), and 7 Authorized MCP Subprocesses',
    badge: 'Architecture',
    content: slide1Content
  },
  {
    filename: '02_spark_desktop_home_live.png',
    title: 'Authentic SPARK Desktop UI & Autonomous Task Bar',
    subtitle: '"Put Spark to work", Model Selector (Gemini 3.8 Flash / 3.1 Pro), @ Context Mentions, and HITL Controls',
    badge: 'Desktop UI',
    content: slide2Content
  },
  {
    filename: '03_spark_mcp_fabric_grid.png',
    title: 'The 7 1P MCP Desktop Connected Fabric (244 Tools)',
    subtitle: 'Deep Google Workspace Execution: Mail (38), Chat (55), Calendar (22), Drive (23), Docs (37), Sheets (39), Slides (30)',
    badge: 'Tool Matrix',
    content: slide3Content
  },
  {
    filename: '04_spark_morning_handoff_flow.png',
    title: 'Executive Morning Handoff: 4-Stage Autonomous Workflow',
    subtitle: 'From Overnight Escalation Triage to Boardroom-Ready Briefing Deck Before 9:00 AM',
    badge: 'Business Use Case',
    content: slide4Content
  },
  {
    filename: '05_spark_dogfood_allowlist_proof.png',
    title: 'Google Cloud Console & Discovery Engine Verification',
    subtitle: 'Project ucs-agentspace-dogfood (#670560280865), Widget Config fdd1e98d, and ESF Killswitch Bypass',
    badge: 'Telemetry Proof',
    content: slide5Content
  }
];

async function main() {
  console.log('Launching Google-signed Chrome for slide generation...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1600,1050'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050, deviceScaleFactor: 2 });

  for (let i = 0; i < SLIDES.length; i++) {
    const s = SLIDES[i];
    console.log(`[${i+1}/${SLIDES.length}] Rendering: ${s.filename}...`);
    const fullHtml = wrapSlideHtml(s.title, s.subtitle, s.badge, s.content);
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const outPath = path.join(OUT_DIR, s.filename);
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`  -> Saved: ${outPath}`);
  }

  await browser.close();
  console.log('Slide generation complete! All 5 authentic slides generated.');
}

main().catch(err => {
  console.error('Slide generation error:', err);
  process.exit(1);
});
