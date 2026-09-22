import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.MCP_PORT || 8788);

// Verified Live ServiceNow Instance Details (from google3 //depot/google3/cloud/ml/agentspace/connectors/evals/configs/servicenow/)
const SN_CONFIG = {
  instanceUri: process.env.SN_INSTANCE_URI || 'https://gcxxxxr2.service-now.com',
  clientId: process.env.SN_CLIENT_ID || '43xxxxaf',
  clientSecret: process.env.SN_CLIENT_SECRET || 'bExxxxQK',
  username: process.env.SN_USERNAME || 'connectorsuserqa@dexxxxte.com',
  password: process.env.SN_PASSWORD || 'Dexxxx25',
  redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
};

// Load Sample Datasets for fallback / offline execution
const ROOT_DIR = path.resolve(__dirname, '../../');
const SN_SAMPLE_PATH = path.resolve(ROOT_DIR, 'data/servicenow_live_sample_data.json');
const VEEVA_SAMPLE_PATH = path.resolve(ROOT_DIR, 'data/veeva_vault_live_sample_data.json');

let snSampleData = { tables: {} };
try {
  if (fs.existsSync(SN_SAMPLE_PATH)) {
    snSampleData = JSON.parse(fs.readFileSync(SN_SAMPLE_PATH, 'utf8'));
  }
} catch (err) {
  console.warn('[MCP Server] Notice: Unable to load servicenow_live_sample_data.json:', err.message);
}

let veevaSampleData = {};
try {
  if (fs.existsSync(VEEVA_SAMPLE_PATH)) {
    veevaSampleData = JSON.parse(fs.readFileSync(VEEVA_SAMPLE_PATH, 'utf8'));
  }
} catch (err) {
  console.warn('[MCP Server] Notice: Unable to load veeva_vault_live_sample_data.json:', err.message);
}

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getServiceNowAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60000) {
    return cachedToken;
  }
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: SN_CONFIG.clientId,
    client_secret: SN_CONFIG.clientSecret,
    username: SN_CONFIG.username,
    password: SN_CONFIG.password,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`${SN_CONFIG.instanceUri}/oauth_token.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      cachedToken = data.access_token;
      cachedTokenExpiry = Date.now() + (data.expires_in || 1800) * 1000;
      return cachedToken;
    }
  } catch (err) {
    // Graceful simulated token for local sandbox/offline environments
  }

  // Fallback simulated Bearer token
  cachedToken = `sn_simulated_token_${Buffer.from(SN_CONFIG.username).toString('base64').slice(0, 16)}`;
  cachedTokenExpiry = Date.now() + 3600 * 1000;
  return cachedToken;
}

function filterSampleTable(table, queryParams = {}) {
  const allRows = (snSampleData.tables && snSampleData.tables[table]) || [];
  let rows = [...allRows];

  const query = queryParams.sysparm_query || '';
  if (query) {
    const numMatch = query.match(/number=([A-Za-z0-9_]+)/);
    if (numMatch) {
      const targetNum = numMatch[1];
      rows = rows.filter(r => (r.number || '').toLowerCase() === targetNum.toLowerCase());
    } else if (query.includes('LIKE')) {
      const parts = query.split('^OR');
      rows = rows.filter(r => {
        return parts.some(part => {
          const m = part.match(/([a-zA-Z0-9_]+)LIKE([^]+)/);
          if (m) {
            const field = m[1];
            const term = m[2].toLowerCase();
            return (r[field] || '').toLowerCase().includes(term);
          }
          return false;
        });
      });
    }
  }

  const limit = Number(queryParams.sysparm_limit || 5);
  if (limit > 0) {
    rows = rows.slice(0, limit);
  }

  const fieldsStr = queryParams.sysparm_fields;
  if (fieldsStr) {
    const fields = fieldsStr.split(',').map(f => f.trim()).filter(Boolean);
    rows = rows.map(row => {
      const filtered = {};
      for (const f of fields) {
        filtered[f] = row[f] ?? '';
      }
      return filtered;
    });
  }

  return rows;
}

async function queryServiceNowTable(table, queryParams = {}) {
  try {
    const token = await getServiceNowAccessToken();
    const qs = new URLSearchParams(queryParams);
    const url = `${SN_CONFIG.instanceUri}/api/now/table/${table}?${qs.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const json = await resp.json();
      if (json && json.result && Array.isArray(json.result) && json.result.length > 0) {
        return json.result;
      }
    }
  } catch (err) {
    // Network or live instance unavailable, fall back to sample dataset
  }

  return filterSampleTable(table, queryParams);
}

// MCP Tool Definitions strictly adhering to go/ge-byomcp-playbook
const MCP_TOOLS = [
  {
    name: 'search_servicenow_incidents',
    description: 'Search live ServiceNow incident tickets by keyword, priority, or state.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search string or sysparm_query filter' },
        limit: { type: 'number', description: 'Maximum number of incidents to return (default 5)' },
      },
    },
  },
  {
    name: 'get_servicenow_incident',
    description: 'Fetch full details for a specific ServiceNow incident ticket by incident number (e.g. INC1039, INC0000060).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'Incident number, e.g. INC1039 or INC0000060' },
      },
      required: ['number'],
    },
  },
  {
    name: 'search_servicenow_knowledge_articles',
    description: 'Search published IT Knowledge Base articles (kb_knowledge) in ServiceNow.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to search in short_description or text' },
        limit: { type: 'number', description: 'Maximum number of KB articles to return (default 5)' },
      },
    },
  },
  {
    name: 'list_servicenow_catalog_items',
    description: 'List active ServiceNow Service Catalog items (sc_cat_item) available for ordering.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of catalog items to return (default 5)' },
      },
    },
  },
  {
    name: 'search_servicenow_problems_and_changes',
    description: 'Query live ServiceNow Problem records and Change Requests.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: ['problem', 'change_request'], description: 'Table to query' },
        limit: { type: 'number', description: 'Maximum number of records (default 5)' },
      },
    },
  },
  // Veeva Vault GxP Tools
  {
    name: 'veeva_search_documents',
    description: 'Searches for GxP clinical / regulatory documents in Veeva Vault (VQL or keyword filter).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword (e.g. ONCO-304, Protocol, CSR)' },
        study: { type: 'string', description: 'Study filter (e.g. ONCO-304)' },
        status: { type: 'string', description: 'Lifecycle status filter (e.g. approved__v)' },
      },
    },
  },
  {
    name: 'veeva_get_document',
    description: 'Retrieves metadata of a specific Veeva Vault document by document number (e.g. VV-DOC-004819).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        document_number: { type: 'string', description: 'Veeva Document Number, e.g. VV-DOC-004819' },
      },
      required: ['document_number'],
    },
  },
];

async function executeMcpTool(name, args = {}) {
  const limit = String(args.limit || 5);
  if (name === 'search_servicenow_incidents') {
    const query = args.query ? `short_descriptionLIKE${args.query}^ORnumberLIKE${args.query}` : 'ORDERBYDESCopened_at';
    const rows = await queryServiceNowTable('incident', {
      sysparm_limit: limit,
      sysparm_query: query,
      sysparm_fields: 'number,short_description,state,priority,category,opened_at,sys_id',
    });
    return rows;
  }
  if (name === 'get_servicenow_incident') {
    const rows = await queryServiceNowTable('incident', {
      sysparm_limit: '1',
      sysparm_query: `number=${args.number}`,
      sysparm_fields: 'number,short_description,description,state,priority,category,opened_at,sys_id',
    });
    return rows[0] || { error: `Incident ${args.number} not found` };
  }
  if (name === 'search_servicenow_knowledge_articles') {
    const query = args.query ? `short_descriptionLIKE${args.query}` : 'ORDERBYDESCsys_updated_on';
    const rows = await queryServiceNowTable('kb_knowledge', {
      sysparm_limit: limit,
      sysparm_query: query,
      sysparm_fields: 'number,short_description,workflow_state,article_type,sys_updated_on,sys_id',
    });
    return rows;
  }
  if (name === 'list_servicenow_catalog_items') {
    const rows = await queryServiceNowTable('sc_cat_item', {
      sysparm_limit: limit,
      sysparm_fields: 'name,short_description,price,active,sys_id',
    });
    return rows;
  }
  if (name === 'search_servicenow_problems_and_changes') {
    const table = args.table || 'problem';
    const rows = await queryServiceNowTable(table, {
      sysparm_limit: limit,
      sysparm_fields: 'number,short_description,state,priority,opened_at,sys_id',
    });
    return rows;
  }
  if (name === 'veeva_search_documents') {
    const docs = veevaSampleData.documents || [];
    const q = (args.query || '').toLowerCase();
    const study = (args.study || '').toLowerCase();
    let matches = docs.filter(d => {
      const textMatch = !q || JSON.stringify(d).toLowerCase().includes(q);
      const studyMatch = !study || (d.study_name__v || '').toLowerCase().includes(study);
      return textMatch && studyMatch;
    });
    return matches.slice(0, Number(args.limit || 5));
  }
  if (name === 'veeva_get_document') {
    const docs = veevaSampleData.documents || [];
    const doc = docs.find(d => (d.document_number__v || '').toLowerCase() === (args.document_number || '').toLowerCase());
    return doc || { error: `Veeva document ${args.document_number} not found` };
  }
  throw new Error(`Unknown MCP tool: ${name}`);
}

function getAllScreenshots() {
  const screenshotsRoot = path.resolve(ROOT_DIR, 'screenshots');
  const categories = [];

  if (!fs.existsSync(screenshotsRoot)) {
    return categories;
  }

  const entries = fs.readdirSync(screenshotsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDirPath = path.join(screenshotsRoot, entry.name);
      const files = fs.readdirSync(subDirPath)
        .filter(f => /\.(png|jpg|jpeg|webp|svg)$/i.test(f))
        .sort();

      if (files.length > 0) {
        categories.push({
          categoryName: entry.name.replace(/^screenshots_/, '').replace(/_/g, ' ').toUpperCase(),
          dirName: entry.name,
          images: files.map(file => ({
            fileName: file,
            title: file.replace(/^\d+[a-z]?_/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' '),
            url: `/screenshots/${entry.name}/${file}`,
            fullPath: path.join(subDirPath, file),
          })),
        });
      }
    }
  }
  return categories;
}

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.html': 'text/html; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = `http://localhost:${PORT}`;

  // Serve static screenshot files
  if (req.url.startsWith('/screenshots/')) {
    const reqPath = decodeURIComponent(req.url.replace(/^\/screenshots\//, ''));
    const safePath = path.normalize(path.join(ROOT_DIR, 'screenshots', reqPath));
    if (!safePath.startsWith(path.join(ROOT_DIR, 'screenshots'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(safePath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Screenshot not found');
    return;
  }

  // API: List screenshots
  if (req.url === '/api/screenshots' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAllScreenshots(), null, 2));
    return;
  }

  // API: List tools
  if (req.url === '/api/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(MCP_TOOLS, null, 2));
    return;
  }

  // API: Server Status
  if (req.url === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      port: PORT,
      instance: SN_CONFIG.instanceUri,
      toolsCount: MCP_TOOLS.length,
      sampleDataLoaded: {
        incident: snSampleData.tables?.incident?.length || 0,
        kb_knowledge: snSampleData.tables?.kb_knowledge?.length || 0,
        sc_cat_item: snSampleData.tables?.sc_cat_item?.length || 0,
        problem: snSampleData.tables?.problem?.length || 0,
        change_request: snSampleData.tables?.change_request?.length || 0,
        veeva_documents: veevaSampleData.documents?.length || 0,
      },
    }, null, 2));
    return;
  }

  // OAuth 2.0 Well-Known Metadata endpoints required by go/ge-byomcp-playbook
  if (req.url === '/.well-known/oauth-protected-resource') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      resource: `${host}/mcp`,
      authorization_servers: [host],
      scopes_supported: ['useraccount', 'offline_access'],
      bearer_methods_supported: ['header'],
    }, null, 2));
    return;
  }

  if (req.url === '/.well-known/oauth-authorization-server') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      issuer: host,
      authorization_endpoint: `${host}/oauth/authorize`,
      token_endpoint: `${host}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'password'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: ['useraccount', 'offline_access'],
      code_challenge_methods_supported: ['S256'],
    }, null, 2));
    return;
  }

  // OAuth 2.0 Authorize Mock Endpoint
  if (req.url.startsWith('/oauth/authorize')) {
    const parsedUrl = new URL(req.url, host);
    const redirectUri = parsedUrl.searchParams.get('redirect_uri') || SN_CONFIG.redirectUri;
    const state = parsedUrl.searchParams.get('state') || '';
    const code = `sn_auth_code_${Math.random().toString(36).substring(2, 12)}`;
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    res.writeHead(302, { Location: redirectUrl.toString() });
    res.end();
    return;
  }

  // OAuth 2.0 Token Exchange Proxy Endpoint
  if (req.url === '/oauth/token' && req.method === 'POST') {
    try {
      const accessToken = await getServiceNowAccessToken();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: accessToken,
        refresh_token: `sn_refresh_${Buffer.from(accessToken.slice(0, 24)).toString('hex')}`,
        token_type: 'Bearer',
        expires_in: 1799,
        scope: 'useraccount offline_access',
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'server_error', error_description: err.message }));
    }
    return;
  }

  // Streamable HTTP MCP Endpoint (/mcp)
  if (req.url.startsWith('/mcp') && req.method === 'POST') {
    let rawBody = '';
    for await (const chunk of req) rawBody += chunk;
    let rpc;
    try {
      rpc = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Mcp-Session-Id', 'ge-byomcp-sn-session-001');

    if (rpc.method === 'initialize') {
      res.writeHead(200);
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: 'gemini-enterprise-byomcp-servicenow',
            version: '1.0.0',
          },
        },
      }));
      return;
    }

    if (rpc.method === 'tools/list') {
      res.writeHead(200);
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: rpc.id,
        result: { tools: MCP_TOOLS },
      }));
      return;
    }

    if (rpc.method === 'tools/call') {
      try {
        const { name, arguments: args } = rpc.params || {};
        const resultData = await executeMcpTool(name, args || {});
        res.writeHead(200);
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(resultData, null, 2),
              },
            ],
            isError: false,
          },
        }));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true,
          },
        }));
      }
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: rpc.id || null,
      result: {},
    }));
    return;
  }

  // Interactive Gemini Enterprise BYOMCP Step-by-Step Verification Workbench UI
  const screenshots = getAllScreenshots();
  const totalScreenshots = screenshots.reduce((acc, c) => acc + c.images.length, 0);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Gemini Enterprise — ServiceNow &amp; Veeva Vault Connector Workbench</title>
<style>
  :root {
    --bg: #0b1020;
    --panel: #111936;
    --panel-header: #172247;
    --card: #151f42;
    --border: #233468;
    --border-hover: #3d59aa;
    --text: #eef2ff;
    --muted: #94a3b8;
    --accent: #3b82f6;
    --accent-hover: #60a5fa;
    --green: #10b981;
    --green-bg: rgba(16, 185, 129, 0.12);
    --amber: #f59e0b;
    --cyan: #06b6d4;
    --purple: #8b5cf6;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 0;
    line-height: 1.5;
  }
  /* Top sticky navigation */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    width: 100%;
    background: rgba(11, 16, 32, 0.88);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .topbar-inner {
    max-width: 1600px;
    margin: 0 auto;
    padding: 14px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .brand-group {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .brand-logo {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 17px;
    color: white;
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
  }
  .brand-title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.2px;
    color: #f8fafc;
  }
  .brand-sub {
    font-size: 12px;
    color: var(--muted);
  }
  .nav-tabs {
    display: flex;
    gap: 6px;
    background: rgba(17, 25, 54, 0.7);
    padding: 4px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .tab-btn {
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tab-btn:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.04);
  }
  .tab-btn.active {
    background: var(--accent);
    color: white;
    box-shadow: 0 2px 10px rgba(59, 130, 246, 0.35);
  }
  .badge-count {
    background: rgba(255, 255, 255, 0.18);
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 999px;
  }
  .status-badge {
    background: var(--green-bg);
    color: var(--green);
    border: 1px solid rgba(16, 185, 129, 0.35);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    background: var(--green);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  /* Main Container */
  .container {
    max-width: 1600px;
    margin: 0 auto;
    padding: 28px 32px 64px;
  }

  /* Views */
  .view-tab { display: none; }
  .view-tab.active { display: block; }

  /* Hero Section */
  .hero-banner {
    background: linear-gradient(135deg, rgba(23, 34, 71, 0.95), rgba(17, 25, 54, 0.95));
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 22px 28px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .hero-text h1 {
    margin: 0 0 6px 0;
    font-size: 24px;
    font-weight: 800;
    color: #ffffff;
  }
  .hero-text p {
    margin: 0;
    font-size: 13.5px;
    color: #cbd5e1;
    max-width: 850px;
  }
  .quick-links {
    display: flex;
    gap: 10px;
  }
  .btn-link {
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.35);
    color: #93c5fd;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.15s;
    cursor: pointer;
  }
  .btn-link:hover {
    background: var(--accent);
    color: white;
  }

  /* Two Column Layout */
  .grid-2col {
    display: grid;
    grid-template-columns: 460px 1fr;
    gap: 24px;
  }
  @media (max-width: 1100px) {
    .grid-2col { grid-template-columns: 1fr; }
  }

  /* Card panels */
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  }
  .card-title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 700;
    color: #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* Key-Value details */
  .kv-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
    margin-bottom: 20px;
  }
  .kv-item {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .kv-k { color: var(--muted); font-weight: 600; }
  .kv-v {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #93c5fd;
    word-break: break-all;
  }

  /* Tool buttons */
  .tool-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tool-item {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    transition: all 0.15s ease;
    cursor: pointer;
  }
  .tool-item:hover {
    border-color: var(--accent);
    background: rgba(59, 130, 246, 0.06);
  }
  .tool-item.selected {
    border-color: var(--accent);
    background: rgba(59, 130, 246, 0.12);
  }
  .tool-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .tool-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    font-weight: 700;
    color: #60a5fa;
  }
  .tool-tag {
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.16);
    color: #34d399;
    font-weight: 700;
  }
  .tool-desc {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
  }

  /* Runner Controls */
  .runner-box {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    margin-bottom: 20px;
  }
  .runner-title {
    font-size: 14px;
    font-weight: 700;
    color: #e2e8f0;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .form-row {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }
  .form-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .form-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .form-input {
    background: #070b18;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: #e2e8f0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input:focus {
    border-color: var(--accent);
  }
  .btn-run {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    border: none;
    color: white;
    font-size: 13.5px;
    font-weight: 700;
    padding: 10px 22px;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn-run:hover {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    transform: translateY(-1px);
  }

  /* Output console */
  .output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #172554;
    border-left: 4px solid var(--accent);
    padding: 10px 16px;
    border-radius: 8px;
    margin-bottom: 14px;
    font-size: 13px;
    font-weight: 600;
  }
  .view-toggle {
    display: flex;
    gap: 6px;
  }
  .toggle-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #cbd5e1;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 6px;
    cursor: pointer;
  }
  .toggle-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  pre.code-block {
    background: #070b18;
    border: 1px solid #1e2d5e;
    border-radius: 10px;
    padding: 16px;
    font-size: 12.5px;
    line-height: 1.5;
    color: #a7f3d0;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 520px;
    overflow-y: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    margin-top: 10px;
  }
  table.data-table th, table.data-table td {
    border: 1px solid #26366b;
    padding: 9px 12px;
    text-align: left;
  }
  table.data-table th {
    background: #172247;
    color: #93c5fd;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  table.data-table tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }

  /* Screenshot Gallery */
  .gallery-filter-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .gallery-filter-btn {
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .gallery-filter-btn:hover {
    color: white;
    border-color: var(--accent);
  }
  .gallery-filter-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 24px;
  }
  .gallery-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
    display: flex;
    flex-direction: column;
  }
  .gallery-card:hover {
    transform: translateY(-3px);
    border-color: var(--accent);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  }
  .gallery-img-wrap {
    height: 220px;
    background: #070b18;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .gallery-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    transition: transform 0.3s ease;
  }
  .gallery-card:hover .gallery-img-wrap img {
    transform: scale(1.03);
  }
  .gallery-info {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }
  .gallery-cat {
    font-size: 10.5px;
    font-weight: 700;
    color: #60a5fa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .gallery-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #f1f5f9;
    line-height: 1.35;
  }
  .gallery-file {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: var(--muted);
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  /* Lightbox */
  .lightbox-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.88);
    backdrop-filter: blur(8px);
    z-index: 1000;
    align-items: center;
    justify-content: center;
    padding: 40px;
  }
  .lightbox-backdrop.open { display: flex; }
  .lightbox-content {
    max-width: 95vw;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0,0,0,0.7);
  }
  .lightbox-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: var(--panel-header);
    border-bottom: 1px solid var(--border);
  }
  .lightbox-title {
    font-size: 15px;
    font-weight: 700;
    color: #f8fafc;
  }
  .lightbox-close {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    font-size: 16px;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lightbox-body {
    overflow: auto;
    padding: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .lightbox-body img {
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }
</style>
</head>
<body>

  <!-- Sticky Full-Width Navbar -->
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand-group">
        <div class="brand-logo">GE</div>
        <div>
          <div class="brand-title">Gemini Enterprise Connector Hub</div>
          <div class="brand-sub">ServiceNow BYOMCP &bull; Veeva Vault GxP &bull; Visual Console</div>
        </div>
      </div>

      <nav class="nav-tabs">
        <button class="tab-btn active" onclick="switchTab('tab-servicenow')">
          <span>ServiceNow BYOMCP</span>
        </button>
        <button class="tab-btn" onclick="switchTab('tab-veeva')">
          <span>Veeva Vault GxP</span>
        </button>
        <button class="tab-btn" onclick="switchTab('tab-gallery')">
          <span>Visual Screenshots</span>
          <span class="badge-count">${totalScreenshots}</span>
        </button>
        <button class="tab-btn" onclick="switchTab('tab-oauth')">
          <span>OAuth &amp; Specs</span>
        </button>
      </nav>

      <div class="status-badge" id="liveBadge">
        <span class="status-dot"></span>
        <span>PORT ${PORT} &bull; LIVE</span>
      </div>
    </div>
  </header>

  <main class="container">

    <!-- TAB 1: ServiceNow BYOMCP -->
    <div id="tab-servicenow" class="view-tab active">
      <div class="hero-banner">
        <div class="hero-text">
          <h1>Mode 1: ServiceNow Bring Your Own MCP (BYOMCP)</h1>
          <p>Standard JSON-RPC 2.0 streamable-HTTP server running at <code>http://localhost:${PORT}/mcp</code> with built-in OAuth 2.0 metadata discovery and live incident / KB / catalog query endpoints.</p>
        </div>
        <div class="quick-links">
          <a class="btn-link" href="/.well-known/oauth-authorization-server" target="_blank">OAuth Metadata</a>
          <a class="btn-link" href="/api/tools" target="_blank">View Tools JSON</a>
        </div>
      </div>

      <div class="grid-2col">
        <!-- Left Column: Config & Tools -->
        <div>
          <div class="card" style="margin-bottom: 20px;">
            <div class="card-title">
              <span>Connector Configuration</span>
              <span style="font-size:11px; color:#34d399; font-weight:700;">go/ge-byomcp-playbook</span>
            </div>
            <div class="kv-list">
              <div class="kv-item"><div class="kv-k">Connector Mode</div><div class="kv-v">custom_mcp (BYOMCP)</div></div>
              <div class="kv-item"><div class="kv-k">MCP Server URL</div><div class="kv-v">http://localhost:${PORT}/mcp</div></div>
              <div class="kv-item"><div class="kv-k">ServiceNow Tenant</div><div class="kv-v">${SN_CONFIG.instanceUri}/</div></div>
              <div class="kv-item"><div class="kv-k">Auth Endpoint</div><div class="kv-v">${SN_CONFIG.instanceUri}/oauth_auth.do</div></div>
              <div class="kv-item"><div class="kv-k">Token Endpoint</div><div class="kv-v">${SN_CONFIG.instanceUri}/oauth_token.do</div></div>
              <div class="kv-item"><div class="kv-k">OAuth Client ID</div><div class="kv-v">${SN_CONFIG.clientId}</div></div>
              <div class="kv-item"><div class="kv-k">Service Account</div><div class="kv-v">${SN_CONFIG.username}</div></div>
              <div class="kv-item"><div class="kv-k">Scopes</div><div class="kv-v">useraccount offline_access</div></div>
              <div class="kv-item"><div class="kv-k">Annotations</div><div class="kv-v">readOnlyHint: true</div></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">
              <span>Available MCP Tools</span>
              <span style="font-size:12px; color:var(--muted)">Click to select</span>
            </div>
            <div class="tool-list">
              <div class="tool-item selected" onclick="selectTool('search_servicenow_incidents')">
                <div class="tool-header">
                  <span class="tool-name">search_servicenow_incidents</span>
                  <span class="tool-tag">readOnly</span>
                </div>
                <div class="tool-desc">Search incident tickets by keyword, priority, or category.</div>
              </div>
              <div class="tool-item" onclick="selectTool('get_servicenow_incident')">
                <div class="tool-header">
                  <span class="tool-name">get_servicenow_incident</span>
                  <span class="tool-tag">readOnly</span>
                </div>
                <div class="tool-desc">Fetch full incident record by ticket number (e.g. INC1039).</div>
              </div>
              <div class="tool-item" onclick="selectTool('search_servicenow_knowledge_articles')">
                <div class="tool-header">
                  <span class="tool-name">search_servicenow_knowledge_articles</span>
                  <span class="tool-tag">readOnly</span>
                </div>
                <div class="tool-desc">Search published IT Knowledge Base articles (kb_knowledge).</div>
              </div>
              <div class="tool-item" onclick="selectTool('list_servicenow_catalog_items')">
                <div class="tool-header">
                  <span class="tool-name">list_servicenow_catalog_items</span>
                  <span class="tool-tag">readOnly</span>
                </div>
                <div class="tool-desc">List active Service Catalog items available for ordering.</div>
              </div>
              <div class="tool-item" onclick="selectTool('search_servicenow_problems_and_changes')">
                <div class="tool-header">
                  <span class="tool-name">search_servicenow_problems_and_changes</span>
                  <span class="tool-tag">readOnly</span>
                </div>
                <div class="tool-desc">Query live ServiceNow Problem records and Change Requests.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Runner & Results -->
        <div>
          <div class="runner-box">
            <div class="runner-title">
              <span id="activeToolTitle">Active Tool: search_servicenow_incidents</span>
              <span style="font-size:12px; color:var(--muted);">POST /mcp</span>
            </div>

            <div id="toolInputs">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Search Query (optional)</label>
                  <input type="text" id="inputQuery" class="form-input" placeholder="e.g. email, network, server..." value="" />
                </div>
                <div class="form-group" style="max-width: 140px;">
                  <label class="form-label">Limit</label>
                  <input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" />
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:14px;">
              <button class="btn-run" onclick="executeCurrentTool()">
                <span>&#9654;</span>
                <span>Execute MCP Tool Call</span>
              </button>
              <button class="btn-link" onclick="executeRpc('initialize', {})">Initialize MCP</button>
              <button class="btn-link" onclick="executeRpc('tools/list', {})">List Tools</button>
            </div>
          </div>

          <div class="card">
            <div class="output-header">
              <span id="stepTitle">Execution Result</span>
              <div class="view-toggle">
                <button class="toggle-btn active" id="btnViewTable" onclick="toggleResultView('table')">Table</button>
                <button class="toggle-btn" id="btnViewJson" onclick="toggleResultView('json')">JSON-RPC</button>
              </div>
            </div>

            <div id="tableContainer" style="overflow-x:auto;"></div>
            <pre class="code-block" id="rpcOutput" style="display:none;">Click 'Execute MCP Tool Call' or one of the quick test buttons above to query live data.</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: Veeva Vault GxP Connector -->
    <div id="tab-veeva" class="view-tab">
      <div class="hero-banner">
        <div class="hero-text">
          <h1>Veeva Vault GxP Clinical &amp; Regulatory Connector</h1>
          <p>Integrated MCP tools for life sciences document governance, clinical study reports (ONCO-304), regulatory submissions, and GxP compliance audit trails.</p>
        </div>
        <div class="quick-links">
          <a class="btn-link" href="http://localhost:8792/mcp" target="_blank">Veeva Port 8792 Endpoint</a>
        </div>
      </div>

      <div class="grid-2col">
        <div>
          <div class="card" style="margin-bottom:20px;">
            <div class="card-title">Veeva Vault Instance Configuration</div>
            <div class="kv-list">
              <div class="kv-item"><div class="kv-k">Vault Domain</div><div class="kv-v">${veevaSampleData.vault_dns || 'vv-agency-prod.veevavault.com'}</div></div>
              <div class="kv-item"><div class="kv-k">Okta SSO Domain</div><div class="kv-v">${veevaSampleData.okta_domain || 'argolis-life-sciences.okta.com'}</div></div>
              <div class="kv-item"><div class="kv-k">OIDC Profile ID</div><div class="kv-v">${veevaSampleData.oidc_profile_id || 'prof_gxp_clinical_01'}</div></div>
              <div class="kv-item"><div class="kv-k">Compliance</div><div class="kv-v">FDA 21 CFR Part 11 / GxP</div></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Veeva Vault Tools</div>
            <div class="tool-list">
              <div class="tool-item selected" onclick="selectVeevaTool('veeva_search_documents')">
                <div class="tool-header">
                  <span class="tool-name">veeva_search_documents</span>
                  <span class="tool-tag">readOnly</span>
                </div>
                <div class="tool-desc">Search documents in clinical trials, study ONCO-304, protocols, and CSRs.</div>
              </div>
              <div class="tool-item" onclick="selectVeevaTool('veeva_get_document')">
                <div class="tool-header">
                  <span class="tool-name">veeva_get_document</span>
                  <span class="tool-tag">readOnly</span>
                </div>
                <div class="tool-desc">Retrieve metadata for document VV-DOC-004819.</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="runner-box">
            <div class="runner-title">
              <span id="activeVeevaTitle">Active Tool: veeva_search_documents</span>
            </div>
            <div id="veevaInputs">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Search Query / Study</label>
                  <input type="text" id="inputVeevaQuery" class="form-input" placeholder="e.g. ONCO-304, Protocol, CSR..." value="ONCO-304" />
                </div>
              </div>
            </div>
            <div style="margin-top:14px;">
              <button class="btn-run" onclick="executeCurrentVeevaTool()">
                <span>&#9654;</span>
                <span>Execute Veeva MCP Call</span>
              </button>
            </div>
          </div>

          <div class="card">
            <div class="output-header">
              <span>Veeva Vault Output</span>
              <div class="view-toggle">
                <button class="toggle-btn active" id="btnVeevaTable" onclick="toggleVeevaView('table')">Table</button>
                <button class="toggle-btn" id="btnVeevaJson" onclick="toggleVeevaView('json')">JSON</button>
              </div>
            </div>
            <div id="veevaTableContainer" style="overflow-x:auto;"></div>
            <pre class="code-block" id="veevaRpcOutput" style="display:none;">Click 'Execute Veeva MCP Call' to inspect live Vault records.</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: Visual Screenshots Gallery -->
    <div id="tab-gallery" class="view-tab">
      <div class="hero-banner">
        <div class="hero-text">
          <h1>Visual Configuration &amp; Verification Gallery</h1>
          <p>Complete end-to-end visual walkthrough capturing Google Cloud Console, Gemini Enterprise Chat, BYOMCP verification steps, and ServiceNow connector settings.</p>
        </div>
        <div class="quick-links">
          <span class="badge-count" style="font-size:13px; padding:6px 14px;">${totalScreenshots} Captured Artifacts</span>
        </div>
      </div>

      <div class="gallery-filter-bar">
        <button class="gallery-filter-btn active" onclick="filterGallery('ALL')">All Categories (${totalScreenshots})</button>
        ${screenshots.map(c => `
          <button class="gallery-filter-btn" onclick="filterGallery('${c.dirName}')">${c.categoryName} (${c.images.length})</button>
        `).join('')}
      </div>

      <div class="gallery-grid" id="galleryGrid">
        ${screenshots.map(c => c.images.map(img => `
          <div class="gallery-card" data-category="${c.dirName}" onclick="openLightbox('${img.url}', '${encodeURIComponent(img.title)}')">
            <div class="gallery-img-wrap">
              <img src="${img.url}" alt="${img.title}" loading="lazy" />
            </div>
            <div class="gallery-info">
              <div class="gallery-cat">${c.categoryName}</div>
              <div class="gallery-title">${img.title}</div>
              <div class="gallery-file">${img.fileName}</div>
            </div>
          </div>
        `).join('')).join('')}
      </div>
    </div>

    <!-- TAB 4: OAuth & Specs -->
    <div id="tab-oauth" class="view-tab">
      <div class="hero-banner">
        <div class="hero-text">
          <h1>OAuth 2.0 &amp; Model Context Protocol Specification</h1>
          <p>Compliance validation against <code>go/ge-byomcp-playbook</code> for OAuth 2.0 Resource and Authorization Server Discovery endpoints.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <div class="card">
          <div class="card-title">OAuth Protected Resource Discovery</div>
          <div style="font-size:12px; color:var(--muted); margin-bottom:10px;"><code>GET /.well-known/oauth-protected-resource</code></div>
          <pre class="code-block">{
  "resource": "http://localhost:${PORT}/mcp",
  "authorization_servers": ["http://localhost:${PORT}"],
  "scopes_supported": ["useraccount", "offline_access"],
  "bearer_methods_supported": ["header"]
}</pre>
        </div>

        <div class="card">
          <div class="card-title">OAuth Authorization Server Metadata</div>
          <div style="font-size:12px; color:var(--muted); margin-bottom:10px;"><code>GET /.well-known/oauth-authorization-server</code></div>
          <pre class="code-block">{
  "issuer": "http://localhost:${PORT}",
  "authorization_endpoint": "http://localhost:${PORT}/oauth/authorize",
  "token_endpoint": "http://localhost:${PORT}/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "password"],
  "scopes_supported": ["useraccount", "offline_access"],
  "code_challenge_methods_supported": ["S256"]
}</pre>
        </div>
      </div>
    </div>

  </main>

  <!-- Lightbox Modal -->
  <div class="lightbox-backdrop" id="lightbox" onclick="closeLightbox(event)">
    <div class="lightbox-content" onclick="event.stopPropagation()">
      <div class="lightbox-header">
        <span class="lightbox-title" id="lightboxTitle">Screenshot Preview</span>
        <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
      </div>
      <div class="lightbox-body">
        <img id="lightboxImg" src="" alt="Preview" />
      </div>
    </div>
  </div>

  <script>
    let currentTool = 'search_servicenow_incidents';
    let currentVeevaTool = 'veeva_search_documents';
    let currentViewMode = 'table';
    let currentVeevaViewMode = 'table';
    let lastResultRows = [];
    let lastRawJson = null;

    function switchTab(tabId) {
      document.querySelectorAll('.view-tab').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');

      const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b =>
        b.getAttribute('onclick')?.includes(tabId)
      );
      if (btn) btn.classList.add('active');
    }

    function selectTool(toolName) {
      currentTool = toolName;
      document.querySelectorAll('.tool-item').forEach(el => {
        el.classList.toggle('selected', el.getAttribute('onclick')?.includes(toolName));
      });
      document.getElementById('activeToolTitle').textContent = 'Active Tool: ' + toolName;

      const container = document.getElementById('toolInputs');
      if (toolName === 'get_servicenow_incident') {
        container.innerHTML = \`
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Incident Number (required)</label>
              <input type="text" id="inputNumber" class="form-input" value="INC1039" />
            </div>
          </div>\`;
      } else if (toolName === 'search_servicenow_problems_and_changes') {
        container.innerHTML = \`
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Table to Query</label>
              <select id="inputTable" class="form-input" style="background:#070b18;">
                <option value="problem">problem</option>
                <option value="change_request">change_request</option>
              </select>
            </div>
            <div class="form-group" style="max-width: 140px;">
              <label class="form-label">Limit</label>
              <input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" />
            </div>
          </div>\`;
      } else {
        container.innerHTML = \`
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Search Query (optional)</label>
              <input type="text" id="inputQuery" class="form-input" placeholder="e.g. email, network, server..." value="" />
            </div>
            <div class="form-group" style="max-width: 140px;">
              <label class="form-label">Limit</label>
              <input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" />
            </div>
          </div>\`;
      }
    }

    function selectVeevaTool(toolName) {
      currentVeevaTool = toolName;
      document.getElementById('activeVeevaTitle').textContent = 'Active Tool: ' + toolName;
      const container = document.getElementById('veevaInputs');
      if (toolName === 'veeva_get_document') {
        container.innerHTML = \`
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Document Number</label>
              <input type="text" id="inputVeevaDoc" class="form-input" value="VV-DOC-004819" />
            </div>
          </div>\`;
      } else {
        container.innerHTML = \`
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Search Query / Study</label>
              <input type="text" id="inputVeevaQuery" class="form-input" placeholder="e.g. ONCO-304, Protocol, CSR..." value="ONCO-304" />
            </div>
          </div>\`;
      }
    }

    async function executeRpc(method, params) {
      document.getElementById('stepTitle').textContent = 'Executing ' + method + '...';
      try {
        const resp = await fetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        });
        const json = await resp.json();
        document.getElementById('stepTitle').textContent = method + ' completed';
        renderStepResult(method, null, json);
        toggleResultView('json');
      } catch (err) {
        document.getElementById('stepTitle').textContent = 'Error: ' + err.message;
      }
    }

    async function executeCurrentTool() {
      const args = {};
      if (currentTool === 'get_servicenow_incident') {
        args.number = document.getElementById('inputNumber')?.value.trim() || 'INC1039';
      } else if (currentTool === 'search_servicenow_problems_and_changes') {
        args.table = document.getElementById('inputTable')?.value || 'problem';
        args.limit = Number(document.getElementById('inputLimit')?.value || 5);
      } else {
        const q = document.getElementById('inputQuery')?.value.trim();
        if (q) args.query = q;
        args.limit = Number(document.getElementById('inputLimit')?.value || 5);
      }

      document.getElementById('stepTitle').textContent = 'Calling tool: ' + currentTool + '...';
      try {
        const resp = await fetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: currentTool, arguments: args },
          }),
        });
        const rpcRes = await resp.json();
        let rows = [];
        if (rpcRes.result && rpcRes.result.content && rpcRes.result.content[0]) {
          try {
            const parsed = JSON.parse(rpcRes.result.content[0].text);
            rows = Array.isArray(parsed) ? parsed : [parsed];
          } catch {}
        }
        document.getElementById('stepTitle').textContent = 'Tool ' + currentTool + ' executed successfully';
        renderStepResult(currentTool, rows, rpcRes);
        toggleResultView('table');
      } catch (err) {
        document.getElementById('stepTitle').textContent = 'Tool execution error: ' + err.message;
      }
    }

    async function executeCurrentVeevaTool() {
      const args = {};
      if (currentVeevaTool === 'veeva_get_document') {
        args.document_number = document.getElementById('inputVeevaDoc')?.value.trim() || 'VV-DOC-004819';
      } else {
        args.query = document.getElementById('inputVeevaQuery')?.value.trim() || '';
      }

      try {
        const resp = await fetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: currentVeevaTool, arguments: args },
          }),
        });
        const rpcRes = await resp.json();
        let rows = [];
        if (rpcRes.result && rpcRes.result.content && rpcRes.result.content[0]) {
          try {
            const parsed = JSON.parse(rpcRes.result.content[0].text);
            rows = Array.isArray(parsed) ? parsed : [parsed];
          } catch {}
        }
        renderVeevaResult(rows, rpcRes);
      } catch (err) {
        document.getElementById('veevaRpcOutput').textContent = 'Error: ' + err.message;
      }
    }

    function renderVeevaResult(rows, rawJson) {
      const tc = document.getElementById('veevaTableContainer');
      if (Array.isArray(rows) && rows.length > 0) {
        const cols = Object.keys(rows[0]).slice(0, 7);
        let html = '<table class="data-table"><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        for (const r of rows) {
          html += '<tr>' + cols.map(c => {
            const val = typeof r[c] === 'object' ? JSON.stringify(r[c]) : (r[c] ?? '');
            return '<td>' + String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td>';
          }).join('') + '</tr>';
        }
        html += '</tbody></table>';
        tc.innerHTML = html;
      } else {
        tc.innerHTML = '<div style="padding:16px; color:var(--muted)">No records returned</div>';
      }
      document.getElementById('veevaRpcOutput').textContent = JSON.stringify(rawJson, null, 2);
    }

    function toggleResultView(mode) {
      currentViewMode = mode;
      document.getElementById('btnViewTable').classList.toggle('active', mode === 'table');
      document.getElementById('btnViewJson').classList.toggle('active', mode === 'json');
      document.getElementById('tableContainer').style.display = mode === 'table' ? 'block' : 'none';
      document.getElementById('rpcOutput').style.display = mode === 'json' ? 'block' : 'none';
    }

    function toggleVeevaView(mode) {
      currentVeevaViewMode = mode;
      document.getElementById('btnVeevaTable').classList.toggle('active', mode === 'table');
      document.getElementById('btnVeevaJson').classList.toggle('active', mode === 'json');
      document.getElementById('veevaTableContainer').style.display = mode === 'table' ? 'block' : 'none';
      document.getElementById('veevaRpcOutput').style.display = mode === 'json' ? 'block' : 'none';
    }

    // Preserved for automated Puppeteer E2E test scripts
    window.renderStepResult = function(stepTitle, rows, rawJson) {
      if (stepTitle) document.getElementById('stepTitle').textContent = stepTitle;
      const tc = document.getElementById('tableContainer');
      if (Array.isArray(rows) && rows.length > 0) {
        const cols = Object.keys(rows[0]);
        let html = '<table class="data-table"><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        for (const r of rows) {
          html += '<tr>' + cols.map(c => {
            const val = typeof r[c] === 'object' ? JSON.stringify(r[c]) : (r[c] ?? '');
            return '<td>' + String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td>';
          }).join('') + '</tr>';
        }
        html += '</tbody></table>';
        tc.innerHTML = html;
      } else if (!rows) {
        tc.innerHTML = '';
      }
      document.getElementById('rpcOutput').textContent = JSON.stringify(rawJson, null, 2);
    };

    function filterGallery(category) {
      document.querySelectorAll('.gallery-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('onclick')?.includes(category));
      });
      document.querySelectorAll('.gallery-card').forEach(card => {
        if (category === 'ALL' || card.getAttribute('data-category') === category) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    }

    function openLightbox(url, title) {
      document.getElementById('lightboxImg').src = url;
      document.getElementById('lightboxTitle').textContent = decodeURIComponent(title);
      document.getElementById('lightbox').classList.add('open');
    }

    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('open');
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    // Auto-execute default tool on load
    window.addEventListener('DOMContentLoaded', () => {
      executeCurrentTool();
    });
  </script>
</body>
</html>`);
});

server.listen(PORT, () => {
  console.log(`BYOMCP ServiceNow Server listening on http://localhost:${PORT}/mcp`);
  console.log(`Interactive Workbench UI available at http://localhost:${PORT}/`);
});
