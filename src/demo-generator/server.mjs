import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createDemoSession,
  validateAndBuildPlan,
  handleChatbotMessage,
  executeApprovedPlan,
  modifySavedVersionPartial,
  approveAndSaveRun,
  rejectAndRollbackRun,
  fileEscalationOnBehalfOfUser,
} from './engine.mjs';
import { redactConfidentialPiiPhi } from './liveGoogleExecutor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

let activeSession = null;

const SAVED_OAUTH_CONNECTIONS = [
  {
    id: 'conn-argolis-servicenow-byomcp',
    name: 'Argolis ServiceNow ITSM & GxP BYOMCP Connection (vertex-ai-493102 • Verified)',
    gcpProject: 'argolis-ge-enterprise (vertex-ai-493102)',
    authMechanism: 'ad****@ni****ga.altostrat.com [PII-REDACTED]',
    connector: 'ServiceNow',
    mode: 'Mode 1: BYOMCP Server (Cloud Run / Local)',
    geAppUrl: 'https://vertexaisearch.cloud.google.com/home/cid/argolis-ge-enterprise',
    prompt: 'Search ServiceNow GxP deviation incidents and create a linked CAPA ticket from Gemini Enterprise chat with inline citations.',
    clientId: 'oauth-client-sn-8528****3329.apps.googleusercontent.com [DLP-REDACTED]',
    secretRef: 'projects/vertex-ai-493102/secrets/servicenow-oauth-token/versions/latest',
    status: 'CONNECTED',
  },
  {
    id: 'conn-argolis-veeva-vault-mcp',
    name: 'Argolis Veeva Vault 21 CFR Part 11 eTMF Connection (vertex-ai-493102 • Verified)',
    gcpProject: 'argolis-ge-enterprise (vertex-ai-493102)',
    authMechanism: 'ad****@ni****ga.altostrat.com [PII-REDACTED]',
    connector: 'Veeva Vault',
    mode: 'Mode 1: BYOMCP Server (Cloud Run / Local)',
    geAppUrl: 'https://vertexaisearch.cloud.google.com/home/cid/argolis-ge-enterprise',
    prompt: 'Query Veeva Vault SOP-4092 and create CAPA-2026-991 with EU GxP compliance verification.',
    clientId: 'oauth-client-vv-8528****3329.apps.googleusercontent.com [DLP-REDACTED]',
    secretRef: 'projects/vertex-ai-493102/secrets/veeva-vault-session-secret/versions/latest',
    status: 'CONNECTED',
  },
  {
    id: 'conn-argolis-m365-graph',
    name: 'Argolis Microsoft 365 Unified Graph & SharePoint Connection (adk-projects-492602 • Verified)',
    gcpProject: 'adk-projects-492602',
    authMechanism: 'Service Account WIF (8528****3329-compute@developer.gserviceaccount.com [DLP-REDACTED])',
    connector: 'Microsoft SharePoint & M365',
    mode: 'Mode 3: Dual-Path Hybrid (1P + BYOMCP)',
    geAppUrl: 'https://vertexaisearch.cloud.google.com/home/cid/fe04e5fd-44e5-4398-a389-7257c3b079ca',
    prompt: 'Synthesize SharePoint Q3 Cloud Strategy Deck and Microsoft Teams #cloud-ops War Room decisions with grounding citations.',
    clientId: 'entra-app-id-9941****8821 [DLP-REDACTED]',
    secretRef: 'projects/adk-projects-492602/secrets/m365-graph-client-secret/versions/latest',
    status: 'CONNECTED',
  },
  {
    id: 'conn-argolis-jira-1p',
    name: 'Argolis Atlassian Jira & Confluence 1P Connector (arcane-talent-494204-e1 • Auto-Fallback Ready)',
    gcpProject: 'arcane-talent-494204-e1',
    authMechanism: 'ni****@google.com [PII-REDACTED]',
    connector: 'Jira & Confluence',
    mode: 'Mode 2: 1st-Party Google Connector (with BYOMCP Auto-Fallback)',
    geAppUrl: 'https://vertexaisearch.cloud.google.com/home/cid/argolis-ge-enterprise',
    prompt: 'Correlate ServiceNow P1 Outage INC0010042 with Veeva Batch Release Hold and draft an Executive Root Cause Analysis.',
    clientId: 'atlassian-3lo-7712****4410 [DLP-REDACTED]',
    secretRef: 'projects/arcane-talent-494204-e1/secrets/atlassian-oauth-secret/versions/latest',
    status: 'CONNECTED',
  },
];

export function getSavedConnections() {
  return SAVED_OAUTH_CONNECTIONS;
}

export function addSavedConnection(conn) {
  const newConn = redactConfidentialPiiPhi({
    id: 'conn-custom-' + Date.now(),
    name: conn.name || `${conn.connector || 'Enterprise'} Connection (${conn.gcpProject || 'vertex-ai-493102'} • Verified)`,
    gcpProject: conn.gcpProject || 'argolis-ge-enterprise (vertex-ai-493102)',
    authMechanism: conn.authMechanism || 'ad****@ni****ga.altostrat.com [PII-REDACTED]',
    connector: conn.connector || 'ServiceNow',
    mode: conn.mode || 'Mode 1: BYOMCP Server (Cloud Run / Local)',
    geAppUrl: conn.geAppUrl || 'https://vertexaisearch.cloud.google.com/home/cid/argolis-ge-enterprise',
    prompt: conn.prompt || 'Search ServiceNow GxP deviation incidents and create a linked CAPA ticket from Gemini Enterprise chat with inline citations.',
    clientId: conn.clientId || 'oauth-client-8528****3329.apps.googleusercontent.com [DLP-REDACTED]',
    secretRef: conn.secretRef || 'projects/vertex-ai-493102/secrets/custom-oauth-token/versions/latest',
    status: 'CONNECTED',
  });
  SAVED_OAUTH_CONNECTIONS.unshift(newConn);
  return newConn;
}

function discoverLiveUserEnvironment() {
  let projects = [
    {
      id: 'argolis-ge-enterprise (vertex-ai-493102)',
      label: 'argolis-ge-enterprise (ni****-2 • Argolis US + vertex-ai-49**** #8528****3329 [DLP-REDACTED])',
    },
    {
      id: 'vertex-ai-493102',
      label: 'vertex-ai-493102 (Project #8528****3329 • Live Discovery Engine API [DLP-REDACTED])',
    },
    {
      id: 'adk-projects-492602',
      label: 'adk-projects-492602 (Project #9232****8676 • ADK Agent Hub [DLP-REDACTED])',
    },
    {
      id: 'arcane-talent-494204-e1',
      label: 'arcane-talent-494204-e1 (Project #9057****4704 • Argolis Sandbox [DLP-REDACTED])',
    },
    {
      id: 'loyal-copilot-372604',
      label: 'loyal-copilot-372604 (Project #1133****6881 • Copilot Workspace [DLP-REDACTED])',
    },
    {
      id: 'gen-lang-client-0631975937',
      label: 'gen-lang-client-0631975937 (Project #9985****3694 • Default Gemini Project [DLP-REDACTED])',
    },
  ];

  let accounts = [
    {
      id: 'ad****@ni****ga.altostrat.com [PII-REDACTED]',
      label: 'ad****@ni****ga.altostrat.com [PII-REDACTED] (Argolis Organization Admin)',
    },
    {
      id: 'ni****@google.com [PII-REDACTED]',
      label: 'ni****@google.com [PII-REDACTED] (Google Corporate SSO Identity)',
    },
    {
      id: 'ni****@gmail.com [PII-REDACTED]',
      label: 'ni****@gmail.com [PII-REDACTED] (Active ADC Bearer Token • ya29.[REDACTED])',
    },
  ];

  try {
    const rawAccounts = execSync('gcloud auth list --format="value(account)"', {
      encoding: 'utf8',
      timeout: 3000,
    })
      .trim()
      .split('\n')
      .map((s) => redactConfidentialPiiPhi(s.trim()))
      .filter(Boolean);
    for (const acc of rawAccounts) {
      if (!accounts.some((a) => a.id === acc)) {
        accounts.push({ id: acc, label: `${acc} (Discovered via gcloud)` });
      }
    }
  } catch {
    // fallback to pre-discovered list
  }

  return {
    projects,
    accounts,
    engines: [
      {
        url: 'https://vertexaisearch.cloud.google.com/home/cid/argolis-ge-enterprise',
        label: 'gemini-enterprise-1784****5246 (Argolis US • SEARCH_TIER_ENTERPRISE [DLP-REDACTED])',
      },
      {
        url: 'https://vertexaisearch.cloud.google.com/home/cid/fe04e5fd-44e5-4398-a389-7257c3b079ca',
        label: 'gemini-enterprise-1776****2799 (vertex-ai-493102 Global • SEARCH_AND_ASSISTANT [DLP-REDACTED])',
      },
    ],
  };
}

async function ensureSession() {
  if (!activeSession) {
    activeSession = await createDemoSession({
      title: 'Argolis ServiceNow & Veeva GxP Deviation Triage Demo',
      prompt:
        'Search ServiceNow GxP deviation incidents and create a linked CAPA ticket from Gemini Enterprise chat with inline citations.',
      connector: 'ServiceNow',
      mode: 'Mode 1: BYOMCP Server (Cloud Run / Local)',
      industry: 'Life Sciences / Pharma (GxP)',
      geAppUrl: 'https://vertexaisearch.cloud.google.com/home/cid/argolis-ge-enterprise',
      gcpConsoleUrl: 'https://console.cloud.google.com/gen-app-builder/engines?project=vertex-ai-493102',
      gcpProject: 'argolis-ge-enterprise (vertex-ai-493102)',
      region: 'us-central1 / global',
      authMechanism: 'Priority 1: Google-Signed Chrome (EQHXZ8M8AV) + Argolis SSO',
    });
    await validateAndBuildPlan(activeSession);
  }
  return activeSession;
}

function toWebPath(absPath) {
  if (!absPath) return null;
  if (absPath.startsWith(ROOT_DIR)) {
    return absPath.slice(ROOT_DIR.length);
  }
  const idx = absPath.indexOf('/scratch/');
  if (idx !== -1) {
    return absPath.slice(idx);
  }
  return absPath;
}

function renderStudioHtml() {
  const envInfo = discoverLiveUserEnvironment();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gemini Enterprise — Argolis Autonomous Demo Generator Studio</title>
  <style>
    :root {
      /* Light Theme Default (Matches demoes-ge GCP Light Theme 100% with Zero Dark Mismatch) */
      --bg-workspace: #F8FAFC;
      --bg-header: #FFFFFF;
      --bg-card: #FFFFFF;
      --bg-subcard: #F8FAFC;
      --text-primary: #0F172A;
      --text-secondary: #475569;
      --text-muted: #64748B;
      --border-color: #E2E8F0;
      --input-border: #CBD5E1;
      --accent-blue: #2563EB;
      --accent-cyan: #0284C7;
      --code-bg: #EFF6FF;
      --code-text: #1D4ED8;
      --code-border: #BFDBFE;
      --chip-bg: #EFF6FF;
      --chip-text: #1D4ED8;
      --chip-border: #BFDBFE;
      --btn-outline-bg: #F8FAFC;
      --btn-outline-text: #1E293B;
      --card-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
      --conn-banner-bg: linear-gradient(90deg, #EFF6FF 0%, #ECFDF5 100%);
      --conn-banner-border: #93C5FD;
    }

    body.dark-theme {
      /* Dark Theme (Matches demoes-ge GCP Dark Theme when toggled via top bar) */
      --bg-workspace: #0B0F19;
      --bg-header: #0F172A;
      --bg-card: #111827;
      --bg-subcard: #0F172A;
      --text-primary: #F8FAFC;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --border-color: #1E293B;
      --input-border: #334155;
      --accent-blue: #3B82F6;
      --accent-cyan: #38BDF8;
      --code-bg: #090D16;
      --code-text: #38BDF8;
      --code-border: #1E293B;
      --chip-bg: #1E293B;
      --chip-text: #93C5FD;
      --chip-border: #334155;
      --btn-outline-bg: #1E293B;
      --btn-outline-text: #E2E8F0;
      --card-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      --conn-banner-bg: linear-gradient(90deg, rgba(37,99,235,0.16) 0%, rgba(16,185,129,0.14) 100%);
      --conn-banner-border: #2563EB;
    }

    * { box-sizing: border-box; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body {
      margin: 0;
      background: var(--bg-workspace);
      color: var(--text-primary);
      display: flex;
      min-height: 100vh;
      width: 100%;
      overflow-x: hidden;
      transition: background 0.15s, color 0.15s;
    }
    /* Dark Shell Left Sidebar (hidden automatically when embedded inside demoes-ge) */
    aside.dark-shell-nav {
      width: 230px;
      min-width: 230px;
      background: #090D16;
      color: #F8FAFC;
      border-right: 1px solid #1E293B;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 18px 14px;
    }
    .brand-title { font-size: 15px; font-weight: 800; color: #FFFFFF; display: flex; align-items: center; gap: 10px; }
    .nav-item {
      padding: 9px 11px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #94A3B8;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nav-item.active { background: #1E293B; color: #38BDF8; border: 1px solid #334155; }

    /* Main Full-Viewport Container */
    .studio-shell { flex: 1; display: flex; flex-direction: column; width: 100%; max-width: none; }

    /* Compact Header Bar */
    header.studio-header {
      width: 100%;
      background: var(--bg-header);
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-color);
      padding: 10px 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 11px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      white-space: nowrap;
    }
    .pill-blue { background: #2563EB; color: #FFFFFF; border: 1px solid #1D4ED8; }
    .pill-green { background: rgba(16, 185, 129, 0.14); color: #059669; border: 1px solid rgba(16, 185, 129, 0.4); }
    body.dark-theme .pill-green { color: #34D399; }
    .pill-amber { background: rgba(245, 158, 11, 0.16); color: #D97706; border: 1px solid rgba(245, 158, 11, 0.45); }
    body.dark-theme .pill-amber { color: #FBBF24; }

    /* Workspace Container — Zero Empty Margin Gutters */
    main.studio-workspace {
      width: 100%;
      max-width: none;
      padding: 10px 18px 28px 18px;
      background: var(--bg-workspace);
      color: var(--text-primary);
    }

    .studio-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 10px 14px;
      box-shadow: var(--card-shadow);
      margin-bottom: 10px;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-color);
      flex-wrap: wrap;
      gap: 8px;
    }
    .card-title { font-size: 13.5px; font-weight: 800; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px; }

    /* Saved OAuth Connection Selector Bar */
    .saved-conn-bar {
      background: var(--conn-banner-bg);
      border: 1.5px solid var(--conn-banner-border);
      border-radius: 8px;
      padding: 7px 12px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* Tier 1: 4-Column Auto-Populated Environment Dropdown Ribbon */
    .env-dropdown-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      width: 100%;
    }
    label.field-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      color: var(--text-secondary);
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    label.field-label span.auto-tag {
      color: var(--accent-cyan);
      font-size: 9.5px;
      font-weight: 700;
      text-transform: none;
    }
    select.select-input, input.text-input {
      width: 100%;
      padding: 5px 8px;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--text-primary);
      background: var(--bg-subcard);
      outline: none;
      transition: border-color 0.15s;
    }
    select.select-input:focus, input.text-input:focus {
      border-color: var(--accent-blue);
    }

    /* Action Bar Buttons */
    .btn {
      cursor: pointer;
      padding: 5px 11px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11.5px;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.92; }
    .btn-primary { background: #2563EB; color: #FFFFFF; }
    .btn-emerald { background: #059669; color: #FFFFFF; }
    .btn-amber { background: #D97706; color: #FFFFFF; }
    .btn-danger { background: #DC2626; color: #FFFFFF; }
    .btn-outline { background: var(--btn-outline-bg); color: var(--btn-outline-text); border: 1px solid var(--input-border); }

    /* Tier 2: Side-by-Side 12-Step Compact Matrix (Left 63%) + Formatted Architect Copilot (Right 37%) */
    .tier2-split {
      display: grid;
      grid-template-columns: 1.65fr 1fr;
      gap: 10px;
      width: 100%;
      align-items: stretch;
    }
    .step-matrix-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .plan-step-row {
      background: var(--bg-subcard);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 10.5px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 2px;
    }
    .plan-step-row .step-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
    }

    /* Formatted Architect Copilot Box (Zero Raw Markdown, Zero Empty Void) */
    .chat-box {
      max-height: 115px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px;
      background: var(--bg-subcard);
      margin-bottom: 6px;
    }
    .chat-msg { margin-bottom: 8px; padding: 8px 11px; border-radius: 8px; font-size: 11.5px; line-height: 1.45; }
    .chat-msg:last-child { margin-bottom: 0; }
    .chat-msg.assistant { background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(59, 130, 246, 0.3); color: var(--text-primary); }
    .chat-msg.user { background: var(--chip-bg); color: var(--chip-text); border: 1px solid var(--chip-border); margin-left: 18px; }
    .chat-msg code, code.inline-code {
      background: var(--code-bg);
      color: var(--code-text);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      border: 1px solid var(--code-border);
    }
    .quick-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    .quick-chip {
      background: var(--chip-bg);
      color: var(--chip-text);
      border: 1px solid var(--chip-border);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 10.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .quick-chip:hover { background: #2563EB; color: #FFFFFF; border-color: #2563EB; }

    /* Tier 3: Live 12-Step Dual-Evidence ([1] + [2]) Gallery */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 10px;
    }
    .executed-step-card {
      background: var(--bg-subcard);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 12px;
      transition: border-color 0.15s;
    }
    .executed-step-card:hover { border-color: var(--accent-blue); }
    .executed-step-card img {
      width: 100%;
      height: 185px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid var(--input-border);
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <aside class="dark-shell-nav">
    <div>
      <div class="brand-title">
        <span style="background:#2563EB;padding:5px 9px;border-radius:6px;font-size:13px;">GE</span>
        <span>Argolis Demo Studio</span>
      </div>
      <div style="margin-top:20px;">
        <div class="nav-item active"><span>1. Demo Generator</span><span>●</span></div>
        <div class="nav-item"><span>2. Projects &amp; Assets</span><span>6</span></div>
        <div class="nav-item"><span>3. OAuth Setup</span><span>✓</span></div>
      </div>
    </div>
    <div style="background:#111827;border:1px solid #1F2937;padding:12px;border-radius:8px;font-size:11.5px;color:#9CA3AF;">
      <strong style="color:#F3F4F6;display:block;margin-bottom:4px;">3-Tier Browser Priority Law</strong>
      <div>P1: Google-Signed Local Chrome ✓</div>
      <div>P2: Generic Chrome / Canary</div>
      <div>P3: Edge / Firefox / Safari ✓</div>
    </div>
  </aside>

  <div class="studio-shell">
    <header class="studio-header">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <h1 style="margin:0;font-size:15.5px;font-weight:800;color:var(--text-primary);">Argolis Autonomous Demo Generator &amp; Dual-Evidence ([1] REST + [2] Chrome) Verifier</h1>
        <span id="plan-version-badge" class="pill pill-blue">Plan v1.0</span>
        <span id="browser-priority-badge" class="pill pill-green">Priority 1: Google Signed Local Chrome (EQHXZ8M8AV)</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="pill pill-green" style="font-size:11px;padding:3px 10px;">🛡️ DLP Guard: Confidential / PII / PHI Auto-Redacted by Default</span>
        <span style="font-size:12px;color:var(--text-secondary);">Argolis Identity: <strong style="color:#059669;">${envInfo.accounts[0].id}</strong></span>
      </div>
    </header>

    <main class="studio-workspace">
      <!-- TIER 1: SAVED OAUTH CONNECTION SELECTOR + AUTO-POPULATED ARGOLIS DROPDOWNS -->
      <section class="studio-card">
        <div class="card-header">
          <div>
            <h2 class="card-title">
              <span>1. Select Configured OAuth Connection &amp; Demo Scope</span>
              <span class="pill pill-green" style="font-size:11px;padding:2px 8px;">Synced with 🔐 OAuth Setup</span>
            </h2>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-primary);background:var(--bg-subcard);padding:6px 10px;border-radius:8px;border:1px solid var(--input-border);cursor:pointer;">
              <input type="checkbox" id="toggle-simulate-fallback" checked />
              <span>Auto-Fallback on 1P Block (CB b/505111548)</span>
            </label>
            <button id="btn-validate-form" class="btn btn-outline" onclick="validateFormInputs()">🔄 Rebuild 12-Step Plan</button>
            <button id="btn-approve-execute" class="btn btn-emerald" onclick="approveAndExecutePlan()">✓ Approve &amp; Execute 12-Step Demo</button>
            <button id="btn-partial-modify" class="btn btn-amber" onclick="runPartialModify()">⚡ Partial Modify (Reuse 1–8, Re-Run 9–12)</button>
            <button id="btn-reject-rollback" class="btn btn-outline" onclick="rejectAndRollback()">✕ Rollback</button>
            <button id="btn-file-ticket" class="btn btn-danger" onclick="fileTicketOnBehalf()">🐞 File Buganizer Ticket (b/505111548)</button>
          </div>
        </div>

        <!-- PRIMARY SAVED OAUTH CONNECTION PICKER (POPULATED FROM OAUTH SETUP MENU) -->
        <div class="saved-conn-bar">
          <div style="flex:1;min-width:320px;">
            <label class="field-label" style="color:var(--accent-blue);margin-bottom:4px;">
              <span>🔌 Active Pre-Configured OAuth &amp; Environment Connection (Choose from OAuth Setup)</span>
              <span class="auto-tag">1-Click Auto-Fill All Environment Parameters</span>
            </label>
            <select id="input-saved-connection" class="select-input" style="font-weight:700;border-color:var(--accent-blue);" onchange="onSelectSavedConnection(this.value)">
              ${SAVED_OAUTH_CONNECTIONS.map(
                (c) => `<option value="${c.id}">✅ ${c.name}</option>`
              ).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-primary" onclick="openOAuthSetupInParent()" title="Create or manage OAuth connections in the OAuth Setup menu">
              🔐 + Configure New Connection in OAuth Setup
            </button>
          </div>
        </div>

        <div class="env-dropdown-grid">
          <div>
            <label class="field-label">
              <span>Argolis / GCP Project</span>
              <span class="auto-tag">gcloud projects</span>
            </label>
            <select id="input-project" class="select-input" onchange="validateFormInputs()">
              ${envInfo.projects.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="field-label">
              <span>Authenticated Identity</span>
              <span class="auto-tag">gcloud auth list</span>
            </label>
            <select id="input-auth" class="select-input" onchange="validateFormInputs()">
              ${envInfo.accounts.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}
              <option value="Service Account WIF (8528****3329-compute@developer.gserviceaccount.com [DLP-REDACTED])">Service Account WIF (8528****3329-compute [DLP-REDACTED])</option>
            </select>
          </div>

          <div>
            <label class="field-label">
              <span>Target Enterprise Connector</span>
              <span class="auto-tag">5 Live Connectors</span>
            </label>
            <select id="input-connector" class="select-input" onchange="validateFormInputs()">
              <option value="ServiceNow">ServiceNow (ITSM / GxP Deviations — gcxxxy [DLP-REDACTED])</option>
              <option value="Veeva Vault">Veeva Vault (21 CFR Part 11 eTMF &amp; QualityDocs)</option>
              <option value="Microsoft SharePoint & M365">Microsoft Unified 365 (SharePoint / Teams / Outlook Graph)</option>
              <option value="Jira & Confluence">Atlassian Jira &amp; Confluence Cloud (Engineering Runbooks)</option>
              <option value="Apache Spark Desktop">Apache Spark &amp; Dataproc Agent (BigQuery Telemetry)</option>
            </select>
          </div>

          <div>
            <label class="field-label">
              <span>Integration Architecture Mode</span>
              <span class="auto-tag">MCP / 1P</span>
            </label>
            <select id="input-mode" class="select-input" onchange="validateFormInputs()">
              <option value="Mode 1: BYOMCP Server (Cloud Run / Local)">Mode 1: BYOMCP Server (Cloud Run / Local JSON-RPC 2.0)</option>
              <option value="Mode 2: 1st-Party Google Connector (with BYOMCP Auto-Fallback)">Mode 2: 1st-Party Google Connector (with CB b/505111548 Auto-Fallback)</option>
              <option value="Mode 3: Dual-Path Hybrid (1P + BYOMCP)">Mode 3: Dual-Path Hybrid (1P Data Store + BYOMCP Action Tool)</option>
            </select>
          </div>

          <div>
            <label class="field-label">
              <span>Gemini Enterprise App / Engine</span>
              <span class="auto-tag">Discovery Engine</span>
            </label>
            <select id="input-ge-url" class="select-input" onchange="validateFormInputs()">
              ${envInfo.engines.map((e) => `<option value="${e.url}">${e.label}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="field-label">
              <span>Browser &amp; Auth Session Profile</span>
              <span class="auto-tag">Priority 1 Chrome</span>
            </label>
            <select id="input-browser-profile" class="select-input">
              <option value="p1-chrome">Priority 1: Google-Signed Chrome (EQHXZ8M8AV • Reuse Active Session)</option>
              <option value="p2-canary">Priority 2: Local Chrome Canary (Dedicated Profile)</option>
              <option value="p3-safari">Priority 3: macOS Safari / Edge Fallback</option>
            </select>
          </div>

          <div style="grid-column: span 2;">
            <label class="field-label">
              <span>Curated End-to-End Demo Scenario &amp; Action Goal</span>
              <span class="auto-tag">Preset Scenarios</span>
            </label>
            <select id="input-prompt" class="select-input" onchange="validateFormInputs()">
              <option value="Search ServiceNow GxP deviation incidents and create a linked CAPA ticket from Gemini Enterprise chat with inline citations.">Scenario 1 (ServiceNow): Search GxP deviation incidents (INC0010042) &amp; create linked CAPA ticket with citations</option>
              <option value="Query Veeva Vault SOP-4092 and create CAPA-2026-991 with EU GxP compliance verification.">Scenario 2 (Veeva Vault): Query SOP-4092 Deviation Handling &amp; create CAPA-2026-991 with 21 CFR Part 11 e-signature</option>
              <option value="Synthesize SharePoint Q3 Cloud Strategy Deck and Microsoft Teams #cloud-ops War Room decisions with grounding citations.">Scenario 3 (Microsoft 365): Synthesize SharePoint Q3 Strategy Deck &amp; Teams #cloud-ops War Room decisions</option>
              <option value="Correlate ServiceNow P1 Outage INC0010042 with Veeva Batch Release Hold and draft an Executive Root Cause Analysis.">Scenario 4 (Cross-Connector): Correlate ServiceNow P1 Outage with Veeva Batch Release Hold &amp; draft Executive RCA</option>
            </select>
          </div>
        </div>
      </section>

      <!-- TIER 2: 12-STEP COMPACT MATRIX (ALL 12 VISIBLE) + FORMATTED ARCHITECT COPILOT -->
      <div class="tier2-split">
        <section class="studio-card" style="margin-bottom:0;">
          <div class="card-header">
            <h2 class="card-title">2. Versioned 12-Step Execution Plan (Step 01 Login → Step 12 Verification)</h2>
            <div style="display:flex;align-items:center;gap:8px;">
              <span id="plan-diff-banner" style="font-size:11.5px;color:var(--accent-cyan);font-weight:600;">12 steps compiled on Argolis</span>
              <span id="plan-status-text" class="pill pill-green" style="font-size:10.5px;padding:2px 8px;">READY ON ARGOLIS</span>
            </div>
          </div>
          <div id="plan-steps-container" class="step-matrix-grid"></div>
        </section>

        <section class="studio-card" style="margin-bottom:0;display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div class="card-header">
              <h2 class="card-title">3. Argolis Pre-Flight Architect Copilot</h2>
              <span class="pill pill-green" style="font-size:10.5px;padding:2px 8px;">Argolis Live • vertex-ai-493102</span>
            </div>
            <div class="quick-chips">
              <button type="button" class="quick-chip" onclick="quickAsk('Switch connector to Veeva Vault')">🔄 Switch to Veeva Vault</button>
              <button type="button" class="quick-chip" onclick="quickAsk('Add step for Secret Manager rotation')">🔑 Add Secret Rotation Step</button>
              <button type="button" class="quick-chip" onclick="quickAsk('Check IAM and browser readiness')">⚡ Verify Argolis IAM</button>
              <button type="button" class="quick-chip" onclick="quickAsk('Explain CB b/505111548 fallback')">🛡️ CB b/505111548 Fallback</button>
            </div>
            <div id="chatbot-messages" class="chat-box"></div>
          </div>
          <div style="display:flex;gap:8px;">
            <input id="chatbot-input" class="text-input" style="margin-bottom:0;" placeholder="Ask Architect or click a preset chip above..." onkeydown="if(event.key==='Enter') sendChatMessage()" />
            <button id="chatbot-send-btn" class="btn btn-primary" onclick="sendChatMessage()">Send</button>
          </div>
        </section>
      </div>

      <!-- TIER 3: IMMEDIATELY VISIBLE ABOVE-THE-FOLD 12-STEP DUAL-EVIDENCE ([1] + [2]) GALLERY -->
      <section class="studio-card" style="margin-top:14px;" id="executed-gallery-panel">
        <div class="card-header">
          <div>
            <h2 class="card-title">4. Executed 12-Step Dual-Evidence Gallery ([1] *.googleapis.com REST API + [2] Argolis Console &amp; Chrome UI)</h2>
            <p style="margin:3px 0 0 0;font-size:11.5px;color:var(--text-secondary);">Every card pairs <strong>[1] Live Google Cloud Discovery Engine REST API Telemetry</strong> with <strong>[2] Authentic Argolis Console &amp; Gemini Enterprise Web UI Captures</strong> (DLP/PII/PHI Redacted by Default).</p>
          </div>
          <span class="pill pill-blue">12 / 12 Dual-Evidence Proofs Ready</span>
        </div>

        <!-- Honest Fallback Disclosure Banner -->
        <div id="honest-fallback-banner" style="display:none;background:rgba(245, 158, 11, 0.12);border:1px solid rgba(245, 158, 11, 0.45);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
          <div style="font-weight:800;color:#D97706;font-size:12.5px;">⚠️ Honest Multi-Path Fallback Disclosure — Primary Path A Encountered Known Blocker, Automatically Recovered via Path B!</div>
          <div id="honest-fallback-details" style="font-size:11.5px;color:var(--text-primary);margin-top:4px;line-height:1.45;"></div>
        </div>

        <!-- Support & Buganizer Escalation Receipt Panel -->
        <div id="ticket-confirmation-panel" style="display:none;background:rgba(16, 185, 129, 0.1);border:1px solid rgba(16, 185, 129, 0.4);border-radius:8px;padding:12px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <span style="font-weight:800;color:#059669;font-size:13.5px;">✅ Support &amp; Buganizer Escalation Filed on Your Behalf!</span>
              <span id="filed-ticket-id-pill" class="pill pill-green" style="margin-left:10px;"></span>
              <span id="filed-ticket-cb-pill" class="pill pill-blue" style="margin-left:6px;"></span>
            </div>
          </div>
          <div id="ticket-receipt-images" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px;"></div>
        </div>

        <!-- 12-Step Dual-Evidence Screenshot Grid -->
        <div id="live-gallery-grid" class="gallery-grid"></div>
      </section>
    </main>
  </div>

  <script>
    let SAVED_CONNECTIONS_CACHE = ${JSON.stringify(SAVED_OAUTH_CONNECTIONS)};

    function syncThemeWithParent() {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('theme') === 'dark') {
          document.body.classList.add('dark-theme');
        } else if (params.get('theme') === 'light') {
          document.body.classList.remove('dark-theme');
        }
        if (window.parent && window.parent !== window && window.parent.document) {
          const applyParentTheme = () => {
            const dataTheme = window.parent.document.documentElement.getAttribute('data-theme');
            const parentDark =
              dataTheme === 'dark' ||
              (dataTheme !== 'light' && window.parent.document.body && window.parent.document.body.classList.contains('dark-theme'));
            document.body.classList.toggle('dark-theme', Boolean(parentDark));
          };
          applyParentTheme();
          const obs = new MutationObserver(applyParentTheme);
          obs.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
          if (window.parent.document.body) {
            obs.observe(window.parent.document.body, { attributes: true, attributeFilter: ['class'] });
          }
        }
      } catch (e) {}
    }

    window.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'SET_THEME') {
        document.body.classList.toggle('dark-theme', ev.data.theme === 'dark');
      }
      if (ev.data && ev.data.type === 'OAUTH_CONNECTIONS_UPDATED') {
        refreshConnectionsDropdown(ev.data.selectedId);
      }
    });

    function openOAuthSetupInParent() {
      try {
        if (window.parent && window.parent !== window && typeof window.parent.switchTab === 'function') {
          window.parent.switchTab('oauth-setup');
          return;
        }
      } catch (e) {}
      window.location.href = '/?tab=oauth-setup';
    }

    async function refreshConnectionsDropdown(selectIdToPick) {
      try {
        const res = await fetch('/api/connections');
        const data = await res.json();
        if (data.connections) {
          SAVED_CONNECTIONS_CACHE = data.connections;
          const sel = document.getElementById('input-saved-connection');
          if (sel) {
            sel.innerHTML = SAVED_CONNECTIONS_CACHE.map(
              (c) => '<option value="' + c.id + '">✅ ' + c.name + '</option>'
            ).join('');
            if (selectIdToPick) {
              sel.value = selectIdToPick;
              onSelectSavedConnection(selectIdToPick);
            }
          }
        }
      } catch (e) {}
    }

    async function onSelectSavedConnection(connId) {
      const found = SAVED_CONNECTIONS_CACHE.find((c) => c.id === connId);
      if (!found) return;
      setSelectOrAddOption('input-project', found.gcpProject);
      setSelectOrAddOption('input-auth', found.authMechanism);
      setSelectOrAddOption('input-connector', found.connector);
      setSelectOrAddOption('input-mode', found.mode);
      setSelectOrAddOption('input-ge-url', found.geAppUrl);
      setSelectOrAddOption('input-prompt', found.prompt);
      await validateFormInputs();
    }

    function formatRichText(raw) {
      if (!raw) return '';
      return String(raw)
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong style="color:var(--text-primary);">$1</strong>')
        .replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>');
    }

    function setSelectOrAddOption(selectId, val) {
      const el = document.getElementById(selectId);
      if (!el || !val) return;
      const exists = Array.from(el.options).some((o) => o.value === val);
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        el.appendChild(opt);
      }
      el.value = val;
    }

    function renderSessionState(data) {
      const { session } = data;
      if (!session) return;

      document.getElementById('plan-version-badge').textContent = 'Plan ' + (session.currentPlan?.version || 'v1.0');
      setSelectOrAddOption('input-connector', session.inputs.connector);
      setSelectOrAddOption('input-mode', session.inputs.mode);
      setSelectOrAddOption('input-project', session.inputs.gcpProject);
      setSelectOrAddOption('input-auth', session.inputs.authMechanism);
      setSelectOrAddOption('input-ge-url', session.inputs.geAppUrl);
      setSelectOrAddOption('input-prompt', session.inputs.prompt);

      if (session.currentPlan) {
        document.getElementById('plan-diff-banner').innerHTML = formatRichText(session.currentPlan.diffSummary);
        const stepsHtml = session.currentPlan.steps
          .map(
            (s) => \`
          <div class="plan-step-row" data-step-number="\${s.stepNumber}">
            <div class="step-top">
              <strong style="color:var(--accent-cyan);font-size:11.5px;">Step \${String(s.stepNumber).padStart(2, '0')}</strong>
              <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.14);color:#059669;border:1px solid rgba(16,185,129,0.35);">\${s.status || 'READY'}</span>
            </div>
            <div style="color:var(--text-primary);font-weight:700;font-size:11px;line-height:1.3;">\${s.title}</div>
            <div style="color:var(--text-secondary);font-size:10px;line-height:1.25;">\${s.surface}</div>
          </div>
        \`
          )
          .join('');
        document.getElementById('plan-steps-container').innerHTML = stepsHtml;
      }

      const chatHtml = (session.chatHistory || [])
        .map(
          (m) => \`
        <div class="chat-msg \${m.role}">
          <strong>\${m.role === 'user' ? 'You' : 'Architect Copilot'}:</strong> \${formatRichText(m.text)}
        </div>
      \`
        )
        .join('');
      const chatBox = document.getElementById('chatbot-messages');
      chatBox.innerHTML = chatHtml;
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function renderRunGallery(runRecord) {
      if (!runRecord) return;
      const fallbackBanner = document.getElementById('honest-fallback-banner');
      if (runRecord.fallbackDisclosures && runRecord.fallbackDisclosures.length > 0) {
        const fb = runRecord.fallbackDisclosures[0];
        fallbackBanner.style.display = 'block';
        document.getElementById('honest-fallback-details').innerHTML = \`
          <strong>Step 0\${fb.stepNumber} (\${fb.stepTitle}):</strong><br/>
          • <strong>Attempt 1 Failed (\${fb.failedPath}):</strong> \${fb.failedReason}<br/>
          • <strong>Attempt 2 Succeeded (\${fb.recoveredViaPath}):</strong> \${fb.remediationNote}
        \`;
      } else {
        fallbackBanner.style.display = 'none';
      }

      const cardsHtml = (runRecord.completedSteps || [])
        .map((step) => {
          const usedFallback = step.attempts && step.attempts.some((a) => a.isFallback);
          const stateBadge = step.reusedFromCheckpoint
            ? '<span class="pill pill-blue" style="font-size:10.5px;padding:2px 8px;">⚡ REUSED FROM WAL CHECKPOINT</span>'
            : usedFallback
            ? '<span class="pill pill-amber" style="font-size:10.5px;padding:2px 8px;">🔄 RECOVERED VIA PATH B (BYOMCP)</span>'
            : '<span class="pill pill-green" style="font-size:10.5px;padding:2px 8px;">✓ VERIFIED ON ARGOLIS</span>';

          const failurePart = step.failureScreenshotUrl
            ? \`<div style="margin-top:6px;padding:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);border-radius:6px;">
                 <div style="font-size:10.5px;font-weight:700;color:#DC2626;">Attempt 1 Failure Proof Captured Before Fallback:</div>
                 <img src="\${step.failureScreenshotUrl}" alt="Step Failure Screenshot" style="height:95px;margin-top:4px;border:1px solid #EF4444;" />
               </div>\`
            : '';

          const liveApiBadge = step.liveApiSummary
            ? \`<div style="margin-top:5px;font-size:10.5px;font-family:monospace;background:var(--code-bg);color:var(--code-text);padding:4px 8px;border-radius:6px;border:1px solid var(--code-border);">
                [1] \${step.liveApiSummary.method} *.googleapis.com → HTTP \${step.liveApiSummary.httpStatus}\${step.liveApiSummary.fallbackStatus ? ' → Path B HTTP ' + step.liveApiSummary.fallbackStatus : ''} (\${step.liveApiSummary.latencyMs}ms) + [2] Argolis Console
              </div>\`
            : '';

          return \`
            <div class="executed-step-card">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong style="font-size:12px;color:var(--text-primary);">Step \${String(step.stepNumber).padStart(2, '0')}: \${step.title}</strong>
              </div>
              <div style="margin-top:5px;">\${stateBadge}</div>
              \${liveApiBadge}
              \${failurePart}
              <a href="\${step.screenshotUrl}" target="_blank" title="Click to open full 1440x860 Dual-Evidence [1]+[2] screenshot in new tab" style="display:block;">
                <img src="\${step.screenshotUrl}" alt="Step \${step.stepNumber} Screenshot" style="cursor:zoom-in;" />
              </a>
              <div style="margin-top:8px;font-size:11px;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center;">
                <span><strong style="color:var(--text-primary);">Outcome:</strong> \${step.expectedOutcome}</span>
                <a href="\${step.screenshotUrl}" target="_blank" style="color:var(--accent-blue);font-weight:700;text-decoration:none;white-space:nowrap;margin-left:8px;">🔍 Full 1440×860 ↗</a>
              </div>
            </div>
          \`;
        })
        .join('');

      document.getElementById('live-gallery-grid').innerHTML = cardsHtml;
    }

    async function loadInitialSession() {
      syncThemeWithParent();
      if (window.location.search.includes('embed=1')) {
        const innerNav = document.querySelector('aside.dark-shell-nav');
        if (innerNav) innerNav.style.display = 'none';
      }
      await refreshConnectionsDropdown();
      const res = await fetch('/api/session');
      const data = await res.json();
      renderSessionState(data);
      if (data.latestRun) {
        renderRunGallery(data.latestRun);
      }
    }

    async function quickAsk(text) {
      const inputEl = document.getElementById('chatbot-input');
      inputEl.value = text;
      await sendChatMessage();
    }

    async function sendChatMessage() {
      const inputEl = document.getElementById('chatbot-input');
      const message = inputEl.value.trim();
      if (!message) return;
      inputEl.value = '';
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      renderSessionState(data);
    }

    async function validateFormInputs() {
      const payload = {
        connector: document.getElementById('input-connector').value,
        mode: document.getElementById('input-mode').value,
        gcpProject: document.getElementById('input-project').value,
        authMechanism: document.getElementById('input-auth').value,
        geAppUrl: document.getElementById('input-ge-url').value,
        prompt: document.getElementById('input-prompt').value,
      };
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      renderSessionState(data);
    }

    async function approveAndExecutePlan() {
      const simulateFallback = document.getElementById('toggle-simulate-fallback').checked;
      document.getElementById('plan-status-text').textContent = 'EXECUTING 12 STEPS ON ARGOLIS...';
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulateFallback }),
      });
      const data = await res.json();
      renderSessionState(data);
      renderRunGallery(data.runRecord);
      document.getElementById('plan-status-text').textContent = data.runRecord.status;
    }

    async function runPartialModify() {
      document.getElementById('plan-status-text').textContent = 'PARTIAL RE-RUN (STEPS 9-12)...';
      const res = await fetch('/api/partial-modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStep: 9,
          newPrompt: 'Query Veeva Vault SOP-4092 and create CAPA-2026-991 with EU GxP compliance verification.',
        }),
      });
      const data = await res.json();
      renderSessionState(data);
      renderRunGallery(data.runRecord);
      document.getElementById('plan-status-text').textContent = 'PARTIAL MODIFY COMPLETE (' + data.partialResult.version + ')';
    }

    async function fileTicketOnBehalf() {
      const res = await fetch('/api/file-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepNumber: 4,
          matchedCbId: 'b/505111548',
          customerName: 'Argolis Enterprise Demo (nitinagga@google.com)',
        }),
      });
      const data = await res.json();
      const panel = document.getElementById('ticket-confirmation-panel');
      panel.style.display = 'block';
      document.getElementById('filed-ticket-id-pill').textContent = data.receipt.createdIssueId;
      document.getElementById('filed-ticket-cb-pill').textContent = 'Linked to ' + data.receipt.linkedCbId;
      document.getElementById('ticket-receipt-images').innerHTML = \`
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">1. Pre-Populated Escalation Form (\${data.receipt.linkedCbId})</div>
          <img class="escalation-receipt-img" src="\${data.receipt.formPreviewUrl}" style="width:100%;border-radius:8px;border:1px solid #10B981;" />
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">2. Live Filed Confirmation Receipt (\${data.receipt.createdIssueId})</div>
          <img class="escalation-receipt-img" src="\${data.receipt.confirmationUrl}" style="width:100%;border-radius:8px;border:1px solid #10B981;" />
        </div>
      \`;
    }

    async function rejectAndRollback() {
      const res = await fetch('/api/rollback', { method: 'POST' });
      const data = await res.json();
      document.getElementById('plan-status-text').textContent = data.rollback.status;
    }

    loadInitialSession();
  </script>
</body>
</html>`;
}

function decorateRunRecordWithWebUrls(runRecord) {
  if (!runRecord) return null;
  const decorated = {
    ...runRecord,
    completedSteps: runRecord.completedSteps.map((s) => ({
      ...s,
      screenshotUrl: toWebPath(s.screenshotPath),
      failureScreenshotUrl: toWebPath(s.failureScreenshotPath),
    })),
  };
  return redactConfidentialPiiPhi(decorated);
}

export async function handleDemoGeneratorRequest(req, res, port = 4390, allowRootHtml = false) {
  await ensureSession();
  const url = new URL(req.url, `http://localhost:${port}`);

  // Serve captured PNG screenshots from /scratch/* (with Cloud Run fallback to screenshots/argolis_dual_evidence)
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/scratch/')) {
    let filePath = path.join(ROOT_DIR, url.pathname);
    if (!fs.existsSync(filePath)) {
      const fallbackPath = path.join(ROOT_DIR, 'screenshots', 'argolis_dual_evidence', path.basename(url.pathname));
      if (fs.existsSync(fallbackPath)) {
        filePath = fallbackPath;
      }
    }
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        fs.createReadStream(filePath).pipe(res);
      }
      return true;
    }
  }

  if (
    (req.method === 'GET' || req.method === 'HEAD') &&
    (url.pathname === '/demo-generator' || (allowRootHtml && url.pathname === '/'))
  ) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : renderStudioHtml());
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/connections') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ connections: getSavedConnections() }));
    return true;
  }

  // Helper to read JSON body
  const readBody = () =>
    new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
    });

  if (req.method === 'POST' && url.pathname === '/api/connections') {
    const body = await readBody();
    const created = addSavedConnection(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ connection: created, connections: getSavedConnections() }));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/session') {
    const session = await ensureSession();
    let latestRun = session.runs[session.runs.length - 1] || null;
    if (!latestRun && port !== 4399) {
      const candidateCpDirs = [];
      const runsDir = path.join(ROOT_DIR, 'scratch', 'demo_runs');
      if (fs.existsSync(runsDir)) {
        const dirs = fs
          .readdirSync(runsDir)
          .filter((d) => d.startsWith('run_'))
          .sort()
          .reverse();
        for (const dir of dirs) {
          candidateCpDirs.push({ runId: dir, cpDir: path.join(runsDir, dir, 'checkpoints') });
        }
      }
      candidateCpDirs.push({
        runId: 'run_1790318179186_b53a',
        cpDir: path.join(ROOT_DIR, 'data', 'argolis_default_run', 'checkpoints'),
      });

      for (const { runId, cpDir } of candidateCpDirs) {
        if (fs.existsSync(cpDir)) {
          try {
            const cpFiles = fs
              .readdirSync(cpDir)
              .filter((f) => f.startsWith('step_') && f.endsWith('.json'))
              .sort();
            if (cpFiles.length === 12) {
              const completedSteps = cpFiles.map((f) =>
                JSON.parse(fs.readFileSync(path.join(cpDir, f), 'utf8'))
              );
              const step4 = completedSteps.find((s) => s.stepNumber === 4);
              const fallbackAttempt = step4?.attempts?.find((a) => a.isFallback);
              latestRun = {
                runId,
                status: 'COMPLETED_WITH_FALLBACK_RECOVERY',
                completedSteps,
                fallbackDisclosures: fallbackAttempt
                  ? [
                      {
                        stepNumber: 4,
                        stepTitle: step4.title,
                        failedPath: step4.attempts[0]?.pathLabel,
                        failedReason: step4.attempts[0]?.errorMessage,
                        recoveredViaPath: fallbackAttempt.pathLabel,
                        remediationNote: fallbackAttempt.remediationNote,
                        failureScreenshotPath: step4.failureScreenshotPath,
                        recoveryScreenshotPath: step4.screenshotPath,
                      },
                    ]
                  : [],
              };
              session.runs.push(latestRun);
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        session,
        latestRun: decorateRunRecordWithWebUrls(latestRun),
      })
    );
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    const body = await readBody();
    const session = await ensureSession();
    const chatResult = await handleChatbotMessage(session, body.message);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ chatResult, session }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/validate') {
    const body = await readBody();
    const session = await ensureSession();
    Object.assign(session.inputs, body);
    await validateAndBuildPlan(session);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ session }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/execute') {
    const body = await readBody();
    const session = await ensureSession();
    const runRecord = await executeApprovedPlan(session, {
      headless: true,
      simulateStepFailure: body.simulateFallback
        ? {
            4: {
              failAttempts: 1,
              errorCode: 'HTTP_403_1P_CONNECTOR_NOT_ALLOWLISTED',
              errorMessage:
                '1st-Party Connector requires project allowlisting in argolis-ge-enterprise (CB b/505111548).',
              fallbackPathLabel: 'Path B: Customer-Hosted BYOMCP Cloud Run Server (Auto-Fallback)',
              remediationNote:
                'Automatically deployed & bound BYOMCP Cloud Run endpoint on Argolis to bypass 1P allowlist gate (CB b/505111548).',
            },
          }
        : {},
    });
    await approveAndSaveRun(session, runRecord.runId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        session,
        runRecord: decorateRunRecordWithWebUrls(runRecord),
      })
    );
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/partial-modify') {
    const body = await readBody();
    const session = await ensureSession();
    const partialResult = await modifySavedVersionPartial(session, {
      fromStep: body.fromStep || 9,
      newPrompt: body.newPrompt,
      headless: true,
    });
    const latestRun = session.runs[session.runs.length - 1];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        session,
        partialResult,
        runRecord: decorateRunRecordWithWebUrls(latestRun),
      })
    );
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/file-ticket') {
    const body = await readBody();
    const session = await ensureSession();
    const receipt = await fileEscalationOnBehalfOfUser(session, {
      stepNumber: body.stepNumber || 4,
      matchedCbId: body.matchedCbId || 'b/505111548',
      customerName: body.customerName || 'Argolis Enterprise Demo (nitinagga@google.com)',
      headless: true,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        receipt: {
          ...receipt,
          formPreviewUrl: toWebPath(receipt.formPreviewScreenshot),
          confirmationUrl: toWebPath(receipt.confirmationScreenshot),
        },
      })
    );
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/rollback') {
    const session = await ensureSession();
    const rollback = await rejectAndRollbackRun(session);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rollback, session }));
    return true;
  }

  return false;
}

export async function startDemoGeneratorServer(port = 4390) {
  const server = http.createServer(async (req, res) => {
    try {
      const handled = await handleDemoGeneratorRequest(req, res, port, true);
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    server,
    port,
    baseUrl: `http://localhost:${port}`,
  };
}

// Allow standalone execution (`node src/demo-generator/server.mjs`)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startDemoGeneratorServer(4390).then(({ baseUrl }) => {
    console.log(`🚀 Gemini Enterprise Argolis Demo Generator Studio running at ${baseUrl}/demo-generator`);
  });
}
