import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.resolve(__dirname, '../../screenshots/screenshots_microsoft_connector');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function consoleShellHtml(stepTitle, innerHtml, rightDrawerHtml = '') {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; font-family: 'Google Sans', Roboto, -apple-system, BlinkMacSystemFont, sans-serif; }
  body { margin: 0; background: #131314; color: #e3e3e3; height: 1050px; overflow: hidden; }
  .topbar { height: 48px; background: #1e1f20; border-bottom: 1px solid #333537; display: flex; align-items: center; padding: 0 18px; justify-content: space-between; }
  .topbar-left { display: flex; align-items: center; gap: 16px; }
  .gc-logo { font-size: 16px; font-weight: 600; color: #fff; letter-spacing: -0.2px; }
  .proj-pill { background: #282a2c; border: 1px solid #444746; border-radius: 6px; padding: 4px 12px; font-size: 13px; color: #e3e3e3; display: flex; align-items: center; gap: 8px; }
  .search-bar { width: 460px; background: #282a2c; border-radius: 8px; padding: 6px 14px; font-size: 13px; color: #9aa0a6; }
  .avatar { width: 28px; height: 28px; border-radius: 50%; background: #1e8e3e; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; }
  .layout { display: flex; height: calc(100% - 48px); }
  .leftnav { width: 236px; background: #1b1b1b; border-right: 1px solid #333537; padding: 14px 0; }
  .nav-title { padding: 6px 20px 14px; font-size: 15px; font-weight: 500; color: #e3e3e3; border-bottom: 1px solid #2d2e30; }
  .nav-item { padding: 10px 20px; font-size: 13px; color: #c4c7c5; display: flex; align-items: center; gap: 10px; }
  .nav-item.active { background: #004a77; color: #c2e7ff; font-weight: 500; border-radius: 0 20px 20px 0; margin-right: 12px; }
  .main { flex: 1; display: flex; overflow: hidden; }
  .content { flex: 1; padding: 24px 36px; overflow-y: auto; }
  .drawer { width: 490px; background: #1e1f20; border-left: 1px solid #3c4043; padding: 24px 28px; overflow-y: auto; }
  .field { margin-bottom: 16px; }
  .field label { display: block; font-size: 12px; color: #9aa0a6; margin-bottom: 5px; }
  .input-box { background: #131314; border: 1px solid #5f6368; border-radius: 4px; padding: 9px 12px; font-size: 13px; color: #e8eaed; font-family: 'Roboto Mono', monospace; }
  .input-box.focus { border-color: #8ab4f8; }
  .helper { font-size: 11px; color: #9aa0a6; margin-top: 4px; }
  .btn-primary { background: #8ab4f8; color: #062e6f; border: none; border-radius: 4px; padding: 8px 18px; font-weight: 600; font-size: 13px; display: inline-block; cursor: pointer; }
  .btn-outline { background: transparent; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 7px 16px; font-weight: 500; font-size: 13px; display: inline-block; }
  .badge-active { background: #137333; color: #ceead6; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  table.kv-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.kv-table td { padding: 10px 8px; border-bottom: 1px solid #2d2e30; font-size: 13px; }
  table.kv-table td:first-child { color: #9aa0a6; width: 200px; }
</style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-left">
      <div class="gc-logo">Google Cloud</div>
      <div class="proj-pill">nixxxx-2</div>
    </div>
    <div class="search-bar">Search (/) for resources, docs, products, and more</div>
    <div class="avatar">S</div>
  </div>
  <div class="layout">
    <div class="leftnav">
      <div class="nav-title">AI Applications</div>
      <div class="nav-item">Apps</div>
      <div class="nav-item active">Data Stores</div>
      <div class="nav-item">Monitoring</div>
      <div class="nav-item">Settings</div>
    </div>
    <div class="main">
      <div class="content">${innerHtml}</div>
      ${rightDrawerHtml ? `<div class="drawer">${rightDrawerHtml}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

function geChatShellHtml(centerHtml) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; font-family: 'Google Sans', Roboto, -apple-system, sans-serif; }
  body { margin: 0; background: #f8fafd; color: #1f1f1f; height: 1050px; display: flex; overflow: hidden; }
  .sidebar { width: 268px; background: #f0f4f9; border-right: 1px solid #dde3ea; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .brand { font-size: 17px; font-weight: 600; color: #1f1f1f; padding: 6px 8px 14px; display: flex; align-items: center; gap: 8px; }
  .new-chat-btn { background: #d3e3fd; color: #041e49; border-radius: 20px; padding: 10px 18px; font-size: 13px; font-weight: 600; width: fit-content; }
  .side-section { margin-top: 12px; font-size: 11px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 8px; }
  .side-item { padding: 8px 10px; border-radius: 8px; font-size: 13px; color: #3c4043; }
  .side-item.active { background: #e8f0fe; color: #1967d2; font-weight: 500; }
  .chat-main { flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding: 28px 90px; overflow-y: auto; }
  .composer-card { background: #fff; border: 1px solid #c4c7c5; border-radius: 20px; padding: 16px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
  .toggle-on { background: #1a73e8; color: #fff; border-radius: 12px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
</style>
</head>
<body>
  <div class="sidebar">
    <div class="brand">✦ Gemini Enterprise</div>
    <div class="new-chat-btn">+ New chat</div>
    <div class="side-section">Connected Enterprise Sources</div>
    <div class="side-item active">Microsoft 365 MCP (SharePoint/Teams)</div>
    <div class="side-item">ServiceNow GxP MCP (gcxxxxr2)</div>
    <div class="side-item">Veeva Vault GxP MCP (phxxxx04)</div>
    <div class="side-section">Recent Chats</div>
    <div class="side-item active">FY27 Global Cloud Strategy &amp; War Room</div>
    <div class="side-item">Study ONCO-304 CSR &amp; Protocol Query</div>
    <div class="side-item">Incident INC1039 Triage</div>
  </div>
  <div class="chat-main">${centerHtml}</div>
</body>
</html>`;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1050']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050, deviceScaleFactor: 2 });

  // 01: Create Data Store Catalog — Selecting Microsoft 365 Connector
  await page.setContent(consoleShellHtml(
    'Create Data Store',
    `<div style="font-size:20px;font-weight:500;margin-bottom:6px;">Create a data store — Select a data source</div>
     <div style="font-size:13px;color:#9aa0a6;margin-bottom:22px;">Connect Microsoft 365 enterprise collaboration repositories (SharePoint Online, Teams, OneDrive) to Gemini Enterprise (Engine: gemini-enterprise-17xxxx46)</div>
     <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:18px;">
       <div style="background:#1e1f20;border:2px solid #8ab4f8;border-radius:10px;padding:20px;">
         <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
           <span style="font-size:16px;font-weight:600;color:#fff;">Microsoft 365</span>
           <span style="background:#004a77;color:#c2e7ff;font-size:11px;padding:3px 8px;border-radius:6px;">microsoft_graph_v1_0</span>
         </div>
         <div style="font-size:12px;color:#9aa0a6;line-height:1.5;margin-bottom:16px;">Federated search, SharePoint Online sites, Microsoft Teams channels, OneDrive documents, and Microsoft Graph MCP actions.</div>
         <span class="btn-primary">Select & Configure</span>
       </div>
       <div style="background:#1e1f20;border:1px solid #3c4043;border-radius:10px;padding:20px;">
         <div style="font-size:16px;font-weight:600;color:#fff;margin-bottom:10px;">ServiceNow</div>
         <div style="font-size:12px;color:#9aa0a6;line-height:1.5;margin-bottom:16px;">Federated search, ITSM incidents, CMDB assets, KB articles, and MCP actions.</div>
         <span class="btn-outline">Connected</span>
       </div>
       <div style="background:#1e1f20;border:1px solid #3c4043;border-radius:10px;padding:20px;">
         <div style="font-size:16px;font-weight:600;color:#fff;margin-bottom:10px;">Veeva Vault</div>
         <div style="font-size:12px;color:#9aa0a6;line-height:1.5;margin-bottom:16px;">Federated search, VQL queries, 21 CFR Part 11 e-signatures, and eTMF/RIM documents.</div>
         <span class="btn-outline">Connected</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '01_microsoft_console_create_datastore_catalog.png') });

  // 02: Wizard Step 2 — Entra ID (Azure AD) Authentication Config
  await page.setContent(consoleShellHtml(
    'Specify Microsoft 365 Source',
    `<div style="font-size:20px;font-weight:500;margin-bottom:4px;">Specify Microsoft 365 authentication &amp; Microsoft Graph endpoints</div>
     <div style="font-size:13px;color:#9aa0a6;margin-bottom:20px;">Connector ID: <code>microsoft_graph_v1_0</code> • Auth Mode: <code>OAUTH2_CLIENT_CREDENTIALS_ENTRA_ID</code></div>
     <div style="max-width:680px;">
       <div class="field"><label>Microsoft Entra ID Tenant ID *</label><div class="input-box">72f988bf-86f1-41af-91ab-2d7cd011db47</div><div class="helper">Directory (tenant) ID in Microsoft Entra Admin Center.</div></div>
       <div class="field"><label>Application (Client) ID *</label><div class="input-box">0oxxxx7d-8941-4cde-a11b-38914b98412e</div><div class="helper">App Registration client ID registered in Azure AD.</div></div>
       <div class="field"><label>Client Secret *</label><div class="input-box">••••••••••••••••••••••••••••••••</div><div class="helper">Stored securely in Google Cloud Secret Manager (CMEK-protected).</div></div>
       <div class="field"><label>Microsoft Graph API Base Endpoint *</label><div class="input-box">https://graph.microsoft.com/v1.0</div><div class="helper">Authoritative REST endpoint for SharePoint, Teams, and OneDrive.</div></div>
       <div class="field"><label>OAuth 2.0 Token Endpoint</label><div class="input-box focus">https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/oauth2/v2.0/token</div><div class="helper">Validates client credentials and issues bearer tokens with tenant scopes.</div></div>
       <div class="field"><label>Required Graph API Scopes</label><div class="input-box">https://graph.microsoft.com/.default (Sites.Read.All, Files.Read.All, ChannelMessage.Read.All)</div></div>
       <div style="display:flex;gap:12px;align-items:center;margin-top:18px;">
         <span class="btn-primary">Verify Auth</span>
         <span class="btn-outline">Continue</span>
         <span style="color:#81c995;font-size:13px;font-weight:500;">✓ Connection Verified (HTTP 200 OK • Tenant: argolis-enterprise.onmicrosoft.com • App: GE-Graph-Connector)</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '02_microsoft_wizard_step2_entra_id_auth_filled.png') });

  // 03: Wizard Step 3 — Entity Scope Selection (SharePoint, Teams, OneDrive)
  await page.setContent(consoleShellHtml(
    'Select Microsoft 365 Entities & Scopes',
    `<div style="font-size:20px;font-weight:500;margin-bottom:6px;">Select Microsoft 365 Entities &amp; Collaboration Scopes</div>
     <div style="font-size:13px;color:#9aa0a6;margin-bottom:18px;">Source Target: <code>projects/nixxxx-2/locations/global/providers/microsoft/connectors/graph/versions/1</code></div>
     <table class="kv-table">
       <tr style="border-bottom:1px solid #444746;font-weight:600;color:#fff;"><td>Entity Domain</td><td>Target Collection / Resource</td><td>Graph Scope</td><td>Indexing Status</td></tr>
       <tr><td><code>SharePoint Online</code></td><td><code>/sites/AI-CoE/Architecture_Specs/</code> (FY27 Global Cloud Strategy)</td><td><code>Sites.Read.All</code></td><td><span class="badge-active">Enabled (Delta Sync)</span></td></tr>
       <tr><td><code>Microsoft Teams</code></td><td><code>Global SRE &amp; Cloud Ops &gt; # P1 Incident War Room</code> (INC1039 Triage)</td><td><code>ChannelMessage.Read.All</code></td><td><span class="badge-active">Enabled (Live Stream)</span></td></tr>
       <tr><td><code>OneDrive for Business</code></td><td><code>/users/cloud-architect/Blueprints/</code> (M365 Integration Topology)</td><td><code>Files.Read.All</code></td><td><span class="badge-active">Enabled (Continuous)</span></td></tr>
       <tr><td><code>Microsoft Entra ID</code></td><td>Security Labels, Confidentiality Tags &amp; User ACLs</td><td><code>Directory.Read.All</code></td><td><span class="badge-active">ACL Mirroring Active</span></td></tr>
     </table>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '03_microsoft_wizard_step3_entities_and_scopes_selected.png') });

  // 04: Active BYOMCP Microsoft Graph Connector Detail + Re-Authentication Drawer
  await page.setContent(consoleShellHtml(
    'Microsoft Graph MCP Connector Detail',
    `<div style="font-size:13px;color:#9aa0a6;margin-bottom:8px;">Data stores &gt; microsoft-365-graph-mcp &gt; Data</div>
     <div style="font-size:22px;font-weight:500;margin-bottom:18px;">microsoft-365-graph-mcp</div>
     <table class="kv-table">
       <tr><td>Collection ID</td><td><code>microsoft-365-graph-mcp_19xxxx55</code></td></tr>
       <tr><td>Connector Type</td><td><code>custom_mcp</code> / <code>microsoft_graph_v1_0</code></td></tr>
       <tr><td>Region</td><td><code>global / us-central1</code></td></tr>
       <tr><td>Tenant Domain</td><td><code>argolis-enterprise.onmicrosoft.com</code></td></tr>
       <tr><td>MCP Server Endpoint</td><td><code>https://microsoft-graph-mcp-85xxxx29.us-central1.run.app/mcp</code></td></tr>
       <tr><td>Connected Apps</td><td><span style="color:#8ab4f8;">gemini-enterprise-17xxxx46</span></td></tr>
       <tr><td>Connector State</td><td><span class="badge-active">● Active (Health: 100%)</span></td></tr>
     </table>`,
    `<div style="font-size:18px;font-weight:500;margin-bottom:16px;">Update authentication</div>
     <div class="field"><label>MCP Server URL *</label><div class="input-box">https://microsoft-graph-mcp-85xxxx29.us-central1.run.app/mcp</div></div>
     <div class="field"><label>Entra ID Tenant ID *</label><div class="input-box">72f988bf-86f1-41af-91ab-2d7cd011db47</div></div>
     <div class="field"><label>Application (Client) ID *</label><div class="input-box">0oxxxx7d-8941-4cde-a11b-38914b98412e</div></div>
     <div class="field"><label>Client Secret *</label><div class="input-box">••••••••••••••••••••••••••••••••</div></div>
     <div class="field"><label>Token URL *</label><div class="input-box">https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/oauth2/v2.0/token</div></div>
     <div style="margin-top:16px;display:flex;gap:12px;">
       <span class="btn-primary">Verify Auth</span>
       <span class="btn-outline">Update Secret</span>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '04_microsoft_byomcp_connector_active_detail_and_reauth.png') });

  // 05: GE Chat — Sources Menu Open with Microsoft 365 Connector Selected (ON)
  await page.setContent(geChatShellHtml(
    `<div style="margin-top:40px;">
       <div style="font-size:32px;font-weight:600;color:#1f1f1f;margin-bottom:8px;">Hello, Enterprise Architect</div>
       <div style="font-size:16px;color:#5f6368;margin-bottom:28px;">Select your connected enterprise productivity sources to query across SharePoint, Teams, and OneDrive.</div>
       <div style="background:#fff;border:1px solid #d2e3fc;border-radius:16px;padding:18px 22px;box-shadow:0 4px 16px rgba(26,115,232,0.12);max-width:620px;margin-bottom:20px;">
         <div style="font-size:13px;font-weight:600;color:#1967d2;margin-bottom:12px;">Connected Sources &amp; MCP Connectors (Active in Chat)</div>
         <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f3f4;">
           <div><div style="font-weight:600;font-size:14px;">Microsoft 365 Graph MCP Connector</div><div style="font-size:12px;color:#5f6368;">SharePoint /sites/AI-CoE • Teams # P1 War Room • OneDrive Blueprints</div></div>
           <span class="toggle-on">ON</span>
         </div>
         <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f3f4;">
           <div><div style="font-weight:600;font-size:14px;">ServiceNow GxP MCP Connector</div><div style="font-size:12px;color:#5f6368;">Instance: gcxxxxr2.service-now.com • Incident INC1039 Tracking</div></div>
           <span class="toggle-on">ON</span>
         </div>
         <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;">
           <div><div style="font-weight:600;font-size:14px;">Veeva Vault GxP Clinical MCP</div><div style="font-size:12px;color:#5f6368;">Vault DNS: phxxxx04.veevavault.com • 21 CFR Part 11 Regulatory Docs</div></div>
           <span class="toggle-on">ON</span>
         </div>
       </div>
     </div>
     <div class="composer-card">
       <div style="font-size:15px;color:#5f6368;">Ask Gemini Enterprise across connected Microsoft 365, ServiceNow &amp; Veeva sources...</div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
         <span style="background:#e8f0fe;color:#1967d2;padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;">Sources: Microsoft 365 MCP (ON)</span>
         <span style="background:#1a73e8;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;">↑</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '05_ge_chat_sources_menu_microsoft_connector_selected.png') });

  // 06: GE Chat — Microsoft 365 Query Prompt Entered in Composer
  await page.setContent(geChatShellHtml(
    `<div style="margin-top:60px;">
       <div style="font-size:28px;font-weight:600;color:#1f1f1f;margin-bottom:12px;">Cross-System Inquiry: Microsoft 365 Architecture &amp; War Room Triage</div>
       <div style="font-size:14px;color:#5f6368;">Connected Sources: <code>SharePoint Online</code> • <code>Microsoft Teams</code> • <code>OneDrive</code></div>
     </div>
     <div class="composer-card" style="border:2px solid #1a73e8;">
       <div style="font-size:15px;color:#1f1f1f;line-height:1.5;">Cross-reference our SharePoint Online architecture repository (/sites/AI-CoE) and the live Microsoft Teams P1 Incident War Room channel. What is our FY27 multi-cloud indexing policy, and what was the root cause and resolution timeline for the recent ServiceNow ingestion bridge latency spike (INC1039)?</div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
         <span style="background:#e8f0fe;color:#1967d2;padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;">✓ Microsoft 365 Graph MCP Connector Selected</span>
         <span style="background:#1a73e8;color:#fff;padding:7px 18px;border-radius:18px;font-size:13px;font-weight:600;">Submit Query ↑</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '06_ge_chat_microsoft_connector_prompt_ready.png') });

  // 07: GE Chat — Microsoft Graph Tool Call Review Card
  await page.setContent(geChatShellHtml(
    `<div>
       <div style="background:#e8f0fe;color:#1f1f1f;padding:14px 18px;border-radius:16px;max-width:720px;margin-left:auto;margin-bottom:24px;font-size:14px;">
         Cross-reference our SharePoint Online architecture repository (/sites/AI-CoE) and the live Microsoft Teams P1 Incident War Room channel. What is our FY27 multi-cloud indexing policy, and what was the root cause and resolution timeline for the recent ServiceNow ingestion bridge latency spike (INC1039)?
       </div>
       <div style="background:#fff;border:1px solid #c4c7c5;border-radius:16px;padding:22px 26px;max-width:680px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
         <div style="font-size:16px;font-weight:600;color:#1f1f1f;margin-bottom:6px;">Review: Query Microsoft 365 Collaboration &amp; Incident Records</div>
         <div style="font-size:13px;color:#5f6368;margin-bottom:16px;">Gemini Enterprise wants to execute the following Microsoft Graph MCP tool actions on <code>argolis-enterprise.onmicrosoft.com</code>:</div>
         <div style="background:#f8fafd;border:1px solid #e1e3e1;border-radius:10px;padding:12px 16px;font-family:'Roboto Mono',monospace;font-size:12px;margin-bottom:18px;">
           <div>• <strong>Connector:</strong> microsoft-365-graph-mcp_19xxxx55 (Tenant: 72f988bf-xxxx)</div>
           <div>• <strong>Action 1:</strong> search_sharepoint_sites(site_id = "AI-CoE", query = "FY27 Global Cloud Infrastructure Strategy")</div>
           <div>• <strong>Action 2:</strong> get_teams_channel_messages(team_id = "Global-SRE-Cloud-Ops", channel = "p1-incident-war-room", limit = 10)</div>
           <div>• <strong>Action 3:</strong> get_drive_item(path = "/users/cloud-architect/Blueprints/FY27_MultiCloud_Architecture.docx")</div>
         </div>
         <div style="display:flex;gap:12px;">
           <span style="background:#1a73e8;color:#fff;padding:8px 22px;border-radius:18px;font-size:13px;font-weight:600;">Authorize</span>
           <span style="background:#fff;color:#5f6368;border:1px solid #c4c7c5;padding:8px 20px;border-radius:18px;font-size:13px;font-weight:500;">Cancel</span>
         </div>
       </div>
     </div>
     <div class="composer-card"><div style="font-size:14px;color:#9aa0a6;">Waiting for tool execution authorization...</div></div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '07_ge_chat_microsoft_connector_tool_call_state.png') });

  // 08: GE Chat — Completed Live Grounded Response
  await page.setContent(geChatShellHtml(
    `<div>
       <div style="background:#e8f0fe;color:#1f1f1f;padding:12px 18px;border-radius:16px;max-width:720px;margin-left:auto;margin-bottom:18px;font-size:13px;">
         Cross-reference our SharePoint Online architecture repository (/sites/AI-CoE) and the live Microsoft Teams P1 Incident War Room channel. What is our FY27 multi-cloud indexing policy, and what was the root cause and resolution timeline for the recent ServiceNow ingestion bridge latency spike (INC1039)?
       </div>
       <div style="background:#fff;border:1px solid #e1e3e1;border-radius:16px;padding:22px 26px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
         <div style="display:inline-block;background:#e6f4ea;color:#137333;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;margin-bottom:14px;">✓ Action Confirmed • Retrieved Records from SharePoint Online (/sites/AI-CoE) &amp; Microsoft Teams (# P1 War Room)</div>
         <div style="font-size:16px;font-weight:600;margin-bottom:10px;">1. FY27 Multi-Cloud Indexing Policy (SharePoint Online /sites/AI-CoE)</div>
         <ul style="font-size:13px;line-height:1.65;color:#3c4043;margin-top:0;">
           <li><strong>Source Specification:</strong> <code>FY27_Global_Cloud_Infrastructure_Strategy.docx</code> (Version <code>v2.4 Effective</code>, Author: Cloud Architecture Lead)</li>
           <li><strong>Governance Mandate:</strong> Vertex AI Search federates queries directly to Microsoft Graph endpoints without permanent document replication, preserving Entra ID permission ACLs.</li>
           <li><strong>ServiceNow Bridge SLA:</strong> Ingestion bridge queries must execute under 500ms; latency exceeding 4000ms triggers automated P1 failover.</li>
         </ul>
         <div style="font-size:15px;font-weight:600;margin-top:14px;margin-bottom:6px;">2. Incident INC1039 Root Cause &amp; Resolution (Microsoft Teams # P1 Incident War Room)</div>
         <ul style="font-size:13px;line-height:1.65;color:#3c4043;margin-top:0;">
           <li><strong>Alert Trigger:</strong> 09:40 AM UTC — OAuth token exchange on <code>gcxxxxr2.service-now.com</code> exceeded 4000ms latency threshold during automated secret rotation.</li>
           <li><strong>Triage &amp; Remediation:</strong> Site Reliability Engineering renewed the BYOMCP server lease with active bearer token at 09:45 AM UTC. Average API latency dropped to <b>118ms</b>.</li>
           <li><strong>Incident Status:</strong> Confirmed closed by Satya N. (ServiceNow Admin) at 09:48 AM UTC. Incident record <code>INC1039</code> marked <b>State: Closed (7)</b>.</li>
         </ul>
       </div>
     </div>
     <div class="composer-card"><div style="font-size:14px;color:#5f6368;">Ask a follow-up question regarding SharePoint documents or Teams war room threads...</div></div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '08_ge_chat_microsoft_connector_live_document_response.png') });

  await browser.close();
  console.log('Successfully generated all 8 Microsoft 365 Connector setup screenshots in', OUT_DIR);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
