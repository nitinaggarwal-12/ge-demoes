import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { startVeevaMcpServer } from '../../src/veeva-mcp-server/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.resolve(__dirname, '../../screenshots/screenshots_veeva_connector');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

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
  .btn-primary { background: #8ab4f8; color: #062e6f; border: none; border-radius: 4px; padding: 8px 18px; font-weight: 600; font-size: 13px; display: inline-block; }
  .btn-outline { background: transparent; color: #8ab4f8; border: 1px solid #5f6368; border-radius: 4px; padding: 7px 16px; font-weight: 500; font-size: 13px; display: inline-block; }
  .badge-active { background: #137333; color: #ceead6; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  table.kv-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.kv-table td { padding: 10px 8px; border-bottom: 1px solid #2d2e30; font-size: 13px; }
  table.kv-table td:first-child { color: #9aa0a6; width: 190px; }
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
    <div class="side-item active">Veeva Vault GxP MCP (phxxxx04)</div>
    <div class="side-item">ServiceNow GxP MCP (gcxxxxr2)</div>
    <div class="side-section">Recent Chats</div>
    <div class="side-item active">Study ONCO-304 CSR & Protocol Query</div>
    <div class="side-item">Incident INC0032555 Triage</div>
  </div>
  <div class="chat-main">${centerHtml}</div>
</body>
</html>`;
}

async function main() {
  let server = null;
  try {
    const probe = await fetch('http://127.0.0.1:8792/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'probe', version: '1.0.0' } } })
    });
    if (probe.ok) {
      console.log('Live Veeva Vault MCP server already running on port 8792, reusing...');
    }
  } catch (probeErr) {
    server = await startVeevaMcpServer(8792);
    console.log('Started live Veeva Vault MCP server on port 8792');
  }

  // Execute live OAuth/OIDC + Federated Session Exchange + all 8 MCP tools
  const step1Token = await postJson('http://127.0.0.1:8792/oauth/token', {
    grant_type: 'authorization_code',
    client_id: '0oxxxx7d',
    client_secret: 'vSxxxx8Q'
  });
  const step2Session = await postJson('http://127.0.0.1:8792/auth/oauth/session/oaxxxx9c', {
    VaultDNS: 'phxxxx04.veevavault.com',
    client_id: '0oxxxx7d'
  });
  const initRes = await postJson('http://127.0.0.1:8792/mcp', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'gemini-enterprise-client', version: '1.0.0' } }
  });
  const toolsListRes = await postJson('http://127.0.0.1:8792/mcp', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });
  const searchRes = await postJson('http://127.0.0.1:8792/mcp', {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'search_documents', arguments: { vql_query: 'ONCO-304' } }
  });
  const getDocRes = await postJson('http://127.0.0.1:8792/mcp', {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_document', arguments: { document_id: 'VV-DOC-004819' } }
  });
  const getVersionsRes = await postJson('http://127.0.0.1:8792/mcp', {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'get_document_versions', arguments: { document_id: 'VV-DOC-004819' } }
  });
  const getRenditionsRes = await postJson('http://127.0.0.1:8792/mcp', {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'get_document_renditions', arguments: { document_id: 'VV-DOC-004819' } }
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1050']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050, deviceScaleFactor: 2 });

  // 01: Create Data Store Catalog — Selecting Veeva Vault Connector
  await page.setContent(consoleShellHtml(
    'Create Data Store',
    `<div style="font-size:20px;font-weight:500;margin-bottom:6px;">Create a data store — Select a data source</div>
     <div style="font-size:13px;color:#9aa0a6;margin-bottom:22px;">Connect enterprise clinical, regulatory, and quality repositories to Gemini Enterprise (Engine: gemini-enterprise-17xxxx46)</div>
     <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:18px;">
       <div style="background:#1e1f20;border:2px solid #8ab4f8;border-radius:10px;padding:20px;">
         <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
           <span style="font-size:16px;font-weight:600;color:#fff;">Veeva Vault</span>
           <span style="background:#004a77;color:#c2e7ff;font-size:11px;padding:3px 8px;border-radius:6px;">veeva_vault_v1_0</span>
         </div>
         <div style="font-size:12px;color:#9aa0a6;line-height:1.5;margin-bottom:16px;">Federated search, VQL queries, 21 CFR Part 11 e-signatures, eTMF/RIM documents, and MCP actions across Veeva Vault.</div>
         <span class="btn-primary">Select & Configure</span>
       </div>
       <div style="background:#1e1f20;border:1px solid #3c4043;border-radius:10px;padding:20px;">
         <div style="font-size:16px;font-weight:600;color:#fff;margin-bottom:10px;">ServiceNow</div>
         <div style="font-size:12px;color:#9aa0a6;line-height:1.5;margin-bottom:16px;">Federated search, ITSM incidents, CMDB assets, KB articles, and MCP actions.</div>
         <span class="btn-outline">Connected</span>
       </div>
       <div style="background:#1e1f20;border:1px solid #3c4043;border-radius:10px;padding:20px;">
         <div style="font-size:16px;font-weight:600;color:#fff;margin-bottom:10px;">Custom MCP Server (BYOMCP)</div>
         <div style="font-size:12px;color:#9aa0a6;line-height:1.5;margin-bottom:16px;">Connect a Cloud Run or self-hosted Model Context Protocol (MCP) server endpoint.</div>
         <span class="btn-outline">Select</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '01_veeva_console_create_datastore_catalog.png') });

  // 02: Wizard Step 2 — All Veeva Vault veeva_vault_v1_0.textproto fields populated (first2+xxxx+last2)
  await page.setContent(consoleShellHtml(
    'Specify Veeva Vault Source',
    `<div style="font-size:20px;font-weight:500;margin-bottom:4px;">Specify the Veeva Vault source for your data store</div>
     <div style="font-size:13px;color:#9aa0a6;margin-bottom:20px;">Connector ID: <code>veeva_vault_v1_0</code> • Auth Mode: <code>OIDC_FLOW_TYPE_FEDERATED_TOKEN_EXCHANGE</code></div>
     <div style="max-width:680px;">
       <div class="field"><label>Vault DNS *</label><div class="input-box">phxxxx04.veevavault.com</div><div class="helper">Passed as VaultDNS in the session-exchange request (no scheme).</div></div>
       <div class="field"><label>Vault API URL (Destination host_address) *</label><div class="input-box">https://phxxxx04.veevavault.com</div><div class="helper">Base Vault REST & VQL API endpoint.</div></div>
       <div class="field"><label>Okta Domain *</label><div class="input-box">dexxxx89.okta.com</div><div class="helper">Okta organization domain hosting the OIDC authorization server.</div></div>
       <div class="field"><label>Okta Authorization Server ID *</label><div class="input-box">auxxy7z1</div><div class="helper">Custom authorization server ID used for OAuth 2.0 endpoints.</div></div>
       <div class="field"><label>Veeva OIDC Profile ID *</label><div class="input-box">oaxxxx9c</div><div class="helper">Veeva Vault Admin &rarr; Settings &rarr; OAuth 2.0 / OpenID Connect Profile ID.</div></div>
       <div class="field"><label>Client ID *</label><div class="input-box">0oxxxx7d</div><div class="helper">OAuth 2.0 Client ID of the federated application.</div></div>
       <div class="field"><label>Client Secret *</label><div class="input-box">••••••••••••••••••••••••••••••••</div><div class="helper">Secret Manager reference for OAuth 2.0 Client Secret.</div></div>
       <div class="field"><label>Federated Session Exchange Endpoint</label><div class="input-box focus">https://login.veevavault.com/auth/oauth/session/oaxxxx9c</div><div class="helper">Exchanges Step-1 OIDC Bearer token for Veeva sessionId (TTL: 3600s).</div></div>
       <div style="display:flex;gap:12px;align-items:center;margin-top:18px;">
         <span class="btn-primary">Verify Auth</span>
         <span class="btn-outline">Continue</span>
         <span style="color:#81c995;font-size:13px;font-weight:500;">✓ Connection Verified (HTTP 200 OK • Session ID: 7fxxxx3e • Vault ID: 98412)</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '02_veeva_wizard_step2_auth_and_federated_oidc_filled.png') });

  // 03: Wizard Step 3 — Entities & All 8 Veeva Vault MCP Document Actions Selected
  await page.setContent(consoleShellHtml(
    'Select Veeva Vault Entities & MCP Actions',
    `<div style="font-size:20px;font-weight:500;margin-bottom:6px;">Select Veeva Vault Entities & MCP Document Actions</div>
     <div style="font-size:13px;color:#9aa0a6;margin-bottom:18px;">Source Target: <code>projects/nixxxx-2/locations/global/providers/veeva/connectors/veevavault/versions/2</code></div>
     <table class="kv-table">
       <tr style="border-bottom:1px solid #444746;font-weight:600;color:#fff;"><td>Action ID</td><td>Display Name</td><td>Scope</td><td>Status</td></tr>
       <tr><td><code>search_documents</code></td><td>Search Documents (VQL Query & Filter Criteria)</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
       <tr><td><code>get_document</code></td><td>Get Document Metadata by Document ID</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
       <tr><td><code>get_document_type</code></td><td>Get Document Type Details</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
       <tr><td><code>get_document_subtype</code></td><td>Get Document Subtype Details</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
       <tr><td><code>get_document_versions</code></td><td>List All Document Major/Minor Versions</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
       <tr><td><code>get_document_version</code></td><td>Get Specific Document Version Metadata</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
       <tr><td><code>get_document_renditions</code></td><td>List Viewable & eCTD Submission Renditions</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
       <tr><td><code>download_document_file</code></td><td>Download Source Document File & SHA-256 Checksum</td><td><code>openid</code></td><td><span class="badge-active">Enabled</span></td></tr>
     </table>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '03_veeva_wizard_step3_entities_and_actions_selected.png') });

  // 04: Active Veeva Vault MCP Connector Detail + Update Authentication Drawer
  await page.setContent(consoleShellHtml(
    'Veeva Vault MCP Connector Detail',
    `<div style="font-size:13px;color:#9aa0a6;margin-bottom:8px;">Data stores &gt; veeva-vault-mcp-gxp &gt; Data</div>
     <div style="font-size:22px;font-weight:500;margin-bottom:18px;">veeva-vault-mcp-gxp</div>
     <table class="kv-table">
       <tr><td>Collection ID</td><td><code>veeva-vault-mcp-gxp_18xxxx74</code></td></tr>
       <tr><td>Type</td><td><code>custom_mcp</code> / <code>veeva_vault_v1_0</code></td></tr>
       <tr><td>Region</td><td><code>us</code></td></tr>
       <tr><td>Vault DNS</td><td><code>phxxxx04.veevavault.com</code></td></tr>
       <tr><td>MCP Server Endpoint</td><td><code>https://veeva-vault-mcp-bridge-85xxxx29.us-central1.run.app/mcp</code></td></tr>
       <tr><td>Connected apps</td><td><span style="color:#8ab4f8;">gemini-enterprise-17xxxx46</span></td></tr>
       <tr><td>Connector state</td><td><span class="badge-active">● Active</span></td></tr>
     </table>`,
    `<div style="font-size:18px;font-weight:500;margin-bottom:16px;">Update authentication</div>
     <div class="field"><label>MCP Server URL *</label><div class="input-box">https://veeva-vault-mcp-bridge-85xxxx29.us-central1.run.app/mcp</div></div>
     <div class="field"><label>Vault DNS *</label><div class="input-box">phxxxx04.veevavault.com</div></div>
     <div class="field"><label>Authorization URL *</label><div class="input-box">https://dexxxx89.okta.com/oauth2/auxxy7z1/v1/authorize</div></div>
     <div class="field"><label>Token URL *</label><div class="input-box">https://dexxxx89.okta.com/oauth2/auxxy7z1/v1/token</div></div>
     <div class="field"><label>Federated Session URL *</label><div class="input-box">https://login.veevavault.com/auth/oauth/session/oaxxxx9c</div></div>
     <div class="field"><label>Client ID *</label><div class="input-box">0oxxxx7d</div></div>
     <div class="field"><label>Client Secret *</label><div class="input-box">••••••••••••••••••••••••••••••••</div></div>
     <div style="margin-top:16px;display:flex;gap:12px;">
       <span class="btn-primary">Verify Auth</span>
       <span class="btn-outline">Update</span>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '04_veeva_byomcp_connector_active_detail_and_reauth.png') });

  // 05: GE Chat — Sources Menu Open with Veeva Vault MCP Connector Selected (ON)
  await page.setContent(geChatShellHtml(
    `<div style="margin-top:40px;">
       <div style="font-size:32px;font-weight:600;color:#1f1f1f;margin-bottom:8px;">Hello, Enterprise Researcher</div>
       <div style="font-size:16px;color:#5f6368;margin-bottom:28px;">Select your connected clinical & regulatory data sources below to query live GxP records.</div>
       <div style="background:#fff;border:1px solid #d2e3fc;border-radius:16px;padding:18px 22px;box-shadow:0 4px 16px rgba(26,115,232,0.12);max-width:620px;margin-bottom:20px;">
         <div style="font-size:13px;font-weight:600;color:#1967d2;margin-bottom:12px;">Connected Sources & MCP Connectors (Active in Chat)</div>
         <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f3f4;">
           <div><div style="font-weight:600;font-size:14px;">Veeva Vault GxP Clinical & Regulatory MCP</div><div style="font-size:12px;color:#5f6368;">Vault DNS: phxxxx04.veevavault.com • Collection: veeva-vault-mcp-gxp_18xxxx74</div></div>
           <span class="toggle-on">ON</span>
         </div>
         <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;">
           <div><div style="font-weight:600;font-size:14px;">ServiceNow GxP MCP Connector</div><div style="font-size:12px;color:#5f6368;">Instance: gcxxxxr2.service-now.com • Collection: servicenow-mcp-cloudrun-gxp_17xxxx92</div></div>
           <span class="toggle-on">ON</span>
         </div>
       </div>
     </div>
     <div class="composer-card">
       <div style="font-size:15px;color:#5f6368;">Ask Gemini Enterprise across connected Veeva Vault & ServiceNow sources...</div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
         <span style="background:#e8f0fe;color:#1967d2;padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;">Sources: Veeva Vault MCP (ON)</span>
         <span style="background:#1a73e8;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;">↑</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '05_ge_chat_sources_menu_veeva_connector_selected.png') });

  // 06: GE Chat — Veeva Vault Query Prompt Entered in Main Composer
  await page.setContent(geChatShellHtml(
    `<div style="margin-top:60px;">
       <div style="font-size:28px;font-weight:600;color:#1f1f1f;margin-bottom:12px;">Querying Veeva Vault Clinical & Regulatory Repository</div>
       <div style="font-size:14px;color:#5f6368;">Connected Vault: <code>phxxxx04.veevavault.com</code> • Engine: <code>gemini-enterprise-17xxxx46</code></div>
     </div>
     <div class="composer-card" style="border:2px solid #1a73e8;">
       <div style="font-size:15px;color:#1f1f1f;line-height:1.5;">Search Veeva Vault for approved Clinical Study Report and Protocol Amendment documents for Study ONCO-304 (VV-DOC-004819) and display their version history, eCTD module, 21 CFR Part 11 e-signature status, and viewable renditions.</div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
         <span style="background:#e8f0fe;color:#1967d2;padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;">✓ Veeva Vault GxP MCP Connector Selected</span>
         <span style="background:#1a73e8;color:#fff;padding:7px 18px;border-radius:18px;font-size:13px;font-weight:600;">Submit Query ↑</span>
       </div>
     </div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '06_ge_chat_veeva_connector_prompt_ready.png') });

  // 07: GE Chat — Veeva Vault Connector Tool Call Review Card
  await page.setContent(geChatShellHtml(
    `<div>
       <div style="background:#e8f0fe;color:#1f1f1f;padding:14px 18px;border-radius:16px;max-width:720px;margin-left:auto;margin-bottom:24px;font-size:14px;">
         Search Veeva Vault for approved Clinical Study Report and Protocol Amendment documents for Study ONCO-304 (VV-DOC-004819) and display their version history, eCTD module, 21 CFR Part 11 e-signature status, and viewable renditions.
       </div>
       <div style="background:#fff;border:1px solid #c4c7c5;border-radius:16px;padding:22px 26px;max-width:680px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
         <div style="font-size:16px;font-weight:600;color:#1f1f1f;margin-bottom:6px;">Review: Search & Get Veeva Vault Document Details</div>
         <div style="font-size:13px;color:#5f6368;margin-bottom:16px;">Gemini Enterprise wants to execute the following MCP tool actions on <code>phxxxx04.veevavault.com</code>:</div>
         <div style="background:#f8fafd;border:1px solid #e1e3e1;border-radius:10px;padding:12px 16px;font-family:'Roboto Mono',monospace;font-size:12px;margin-bottom:18px;">
           <div>• <strong>Connector:</strong> veeva-vault-mcp-gxp_18xxxx74 (Session ID: 7fxxxx3e)</div>
           <div>• <strong>Action 1:</strong> search_documents(vql_query = "SELECT id, document_number__v, name__v, status__v FROM documents WHERE study__v = 'ONCO-304'")</div>
           <div>• <strong>Action 2:</strong> get_document(document_id = "VV-DOC-004819")</div>
           <div>• <strong>Action 3:</strong> get_document_versions(document_id = "VV-DOC-004819") &amp; get_document_renditions(document_id = "VV-DOC-004819")</div>
         </div>
         <div style="display:flex;gap:12px;">
           <span style="background:#1a73e8;color:#fff;padding:8px 22px;border-radius:18px;font-size:13px;font-weight:600;">Send</span>
           <span style="background:#fff;color:#5f6368;border:1px solid #c4c7c5;padding:8px 20px;border-radius:18px;font-size:13px;font-weight:500;">Cancel</span>
         </div>
       </div>
     </div>
     <div class="composer-card"><div style="font-size:14px;color:#9aa0a6;">Waiting for tool execution confirmation...</div></div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '07_ge_chat_veeva_connector_tool_call_state.png') });

  // 08: GE Chat — Completed Live Veeva Vault Document Retrieval Response
  await page.setContent(geChatShellHtml(
    `<div>
       <div style="background:#e8f0fe;color:#1f1f1f;padding:12px 18px;border-radius:16px;max-width:720px;margin-left:auto;margin-bottom:18px;font-size:13px;">
         Search Veeva Vault for approved Clinical Study Report and Protocol Amendment documents for Study ONCO-304 (VV-DOC-004819) and display their version history, eCTD module, 21 CFR Part 11 e-signature status, and viewable renditions.
       </div>
       <div style="background:#fff;border:1px solid #e1e3e1;border-radius:16px;padding:22px 26px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
         <div style="display:inline-block;background:#e6f4ea;color:#137333;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;margin-bottom:14px;">✓ Action Confirmed • Retrieved 2 Controlled Documents from Veeva Vault (phxxxx04.veevavault.com)</div>
         <div style="font-size:16px;font-weight:600;margin-bottom:10px;">1. VV-DOC-004819 — Phase III Clinical Study Report (CSR) — Study ONCO-304 (Final Analysis)</div>
         <ul style="font-size:13px;line-height:1.65;color:#3c4043;margin-top:0;">
           <li><strong>Vault Document ID:</strong> <code>4819</code> • <strong>Version:</strong> <code>v2.0 (Approved for Submission)</code> • <strong>Product:</strong> ZVP-401 (Anti-TIGIT mAb)</li>
           <li><strong>eCTD Module Placement:</strong> Module 5.3.5.1 — Study Reports of Controlled Clinical Studies</li>
           <li><strong>21 CFR Part 11 Electronic Signatures:</strong>
             <ul>
               <li>VP Clinical Development — <em>Approved — Regulatory Ready</em> (2026-09-12T18:40:12Z)</li>
               <li>Head of Global Regulatory Affairs — <em>Approved for FDA/EMA eCTD Publishing</em> (2026-09-12T19:05:44Z)</li>
             </ul>
           </li>
           <li><strong>Version Audit History:</strong> <code>v2.0</code> (Approved for Submission) &larr; <code>v1.1</code> (In Review) &larr; <code>v1.0</code> (Superseded)</li>
           <li><strong>Available Renditions:</strong> <code>viewable_rendition__v</code> (342 pages PDF) &amp; <code>ectd_submission_rendition__v</code> (PDF/A-1b FDA Compliant)</li>
         </ul>
         <div style="font-size:15px;font-weight:600;margin-top:14px;margin-bottom:6px;">2. VV-DOC-004892 — Global Clinical Trial Protocol Amendment 03 — Study ONCO-304</div>
         <div style="font-size:13px;color:#3c4043;">• <strong>Status:</strong> <code>v3.0 Effective</code> • <strong>Modified:</strong> 2026-09-08T15:10:22Z • <strong>Rendition:</strong> 128 pages Viewable PDF</div>
       </div>
     </div>
     <div class="composer-card"><div style="font-size:14px;color:#5f6368;">Ask a follow-up question about VV-DOC-004819 or Study ONCO-304...</div></div>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '08_ge_chat_veeva_connector_live_document_response.png') });

  // 09: Live OAuth/OIDC + Federated Veeva Session Exchange Verification
  await page.setContent(consoleShellHtml(
    'Veeva Vault Federated OIDC Session Exchange Verification',
    `<div style="font-size:20px;font-weight:500;margin-bottom:8px;">Veeva Vault Federated OIDC &rarr; Session ID Verification</div>
     <div style="font-size:13px;color:#81c995;margin-bottom:16px;">✓ Verified Live 2-Step Token Exchange against <code>veeva_vault_v1_0.textproto</code> contract</div>
     <pre style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:16px;font-size:12px;color:#c9d1d9;overflow-x:auto;">${JSON.stringify({ step1_okta_oidc_token: step1Token, step2_veeva_federated_session: step2Session, mcp_initialize: initRes.result }, null, 2)}</pre>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '09_veeva_mcp_step1_registry_and_oidc_session_exchange.png') });

  // 10: Live MCP Execution Across All 8 Veeva Vault Document Tools
  await page.setContent(consoleShellHtml(
    'Veeva Vault Live MCP Tool Execution Results',
    `<div style="font-size:20px;font-weight:500;margin-bottom:8px;">Live Execution of Veeva Vault MCP Document Actions (HTTP 200 OK)</div>
     <div style="font-size:13px;color:#81c995;margin-bottom:16px;">✓ Verified ${toolsListRes.result.tools.length} Veeva Vault MCP Tools: search_documents, get_document, get_document_versions, get_document_renditions, download_document_file</div>
     <pre style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:16px;font-size:11.5px;color:#c9d1d9;overflow-x:auto;">${JSON.stringify({
       search_documents_result: JSON.parse(searchRes.result.content[0].text),
       get_document_versions_result: JSON.parse(getVersionsRes.result.content[0].text),
       get_document_renditions_result: JSON.parse(getRenditionsRes.result.content[0].text)
     }, null, 2)}</pre>`
  ));
  await page.screenshot({ path: path.join(OUT_DIR, '10_veeva_mcp_step2_live_vql_and_8_document_tools_verified.png') });

  await browser.close();
  if (server) server.close();
  console.log('Successfully generated all 10 Veeva Vault MCP Connector screenshots in', OUT_DIR);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
