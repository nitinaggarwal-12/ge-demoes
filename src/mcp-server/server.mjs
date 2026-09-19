import http from 'http';

const PORT = Number(process.env.MCP_PORT || 8788);

// Verified Live ServiceNow Instance Details (from google3 //depot/google3/cloud/ml/agentspace/connectors/evals/configs/servicenow/)
const SN_CONFIG = {
  instanceUri: 'https://gcxxxxr2.service-now.com',
  clientId: '43xxxxaf',
  clientSecret: 'bExxxxQK',
  username: 'connectorsuserqa@dexxxxte.com',
  password: process.env.SN_PASSWORD || 'Dexxxx25',
  redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
};

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

  const resp = await fetch(`${SN_CONFIG.instanceUri}/oauth_token.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`ServiceNow OAuth failed (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in || 1800) * 1000;
  return cachedToken;
}

async function queryServiceNowTable(table, queryParams = {}) {
  const token = await getServiceNowAccessToken();
  const qs = new URLSearchParams(queryParams);
  const url = `${SN_CONFIG.instanceUri}/api/now/table/${table}?${qs.toString()}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`ServiceNow Table API error (${resp.status}): ${txt}`);
  }
  const json = await resp.json();
  return json.result || [];
}

// MCP Tool Definitions strictly adhering to go/ge-byomcp-playbook (including readOnlyHint: true)
const MCP_TOOLS = [
  {
    name: 'search_servicenow_incidents',
    description: 'Search live ServiceNow incident tickets on gcxxxxr2.service-now.com by keyword, priority, or state.',
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
    description: 'Fetch full details for a specific ServiceNow incident ticket by incident number (e.g., INC0000060).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'Incident number, e.g. INC0000060' },
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
  throw new Error(`Unknown MCP tool: ${name}`);
}

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
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Gemini Enterprise — BYOMCP (custom_mcp) ServiceNow Live Connector Workbench</title>
<style>
  :root {
    --bg: #0b1020;
    --panel: #111936;
    --panel2: #172247;
    --border: #2b3c75;
    --text: #eef2ff;
    --muted: #9aa8d6;
    --accent: #4f8cff;
    --green: #10b981;
    --amber: #f59e0b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 32px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, #131f47, #1c2d6b);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 24px;
    margin-bottom: 20px;
  }
  .badge {
    background: rgba(16, 185, 129, 0.16);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.45);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.4px;
  }
  .grid {
    display: grid;
    grid-template-columns: 420px 1fr;
    gap: 20px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    min-width: 0;
  }
  h2 { margin: 0 0 12px 0; font-size: 16px; color: #dbeafe; }
  .kv {
    display: grid;
    grid-template-columns: 145px 1fr;
    gap: 8px;
    font-size: 12.5px;
    margin-bottom: 8px;
  }
  .kv .k { color: var(--muted); font-weight: 600; }
  .kv .v {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #93c5fd;
    word-break: break-all;
  }
  pre {
    background: #070b18;
    border: 1px solid #1e2d5e;
    border-radius: 10px;
    padding: 14px;
    font-size: 12px;
    line-height: 1.45;
    color: #a7f3d0;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 520px;
    overflow-y: auto;
  }
  .step-banner {
    background: #172554;
    border-left: 4px solid var(--accent);
    padding: 10px 14px;
    border-radius: 8px;
    margin-bottom: 14px;
    font-size: 13px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    margin-top: 10px;
  }
  th, td {
    border: 1px solid #26366b;
    padding: 8px 10px;
    text-align: left;
  }
  th { background: #172247; color: #93c5fd; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:12px; color:#93c5fd; font-weight:700; letter-spacing:0.6px;">GEMINI ENTERPRISE — CONNECTOR MODE 1 OF 3: BYOMCP (data_source = "custom_mcp")</div>
      <div style="font-size:21px; font-weight:800; margin-top:4px;">Live ServiceNow Streamable-HTTP MCP Server &amp; Query Console</div>
      <div style="font-size:12.5px; color:#cbd5e1; margin-top:4px;">Target GE Instance: <code>fdd1e98d-1f52-4407-98fd-80e27c61fbc9</code> (SparkDogfoodLaunch::Launch) &bull; Target ServiceNow Tenant: <code>https://gcxxxxr2.service-now.com/</code></div>
    </div>
    <div class="badge" id="statusBadge">MCP SERVER LIVE &bull; HTTP 200 OK</div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Gemini Enterprise BYOMCP Connector Configuration</h2>
      <div class="kv"><div class="k">Connector Mode</div><div class="v">custom_mcp (BYOMCP)</div></div>
      <div class="kv"><div class="k">Playbook Spec</div><div class="v">go/ge-byomcp-playbook</div></div>
      <div class="kv"><div class="k">MCP Server URL</div><div class="v">http://localhost:${PORT}/mcp</div></div>
      <div class="kv"><div class="k">ServiceNow Tenant</div><div class="v">${SN_CONFIG.instanceUri}/</div></div>
      <div class="kv"><div class="k">Authorization URL</div><div class="v">${SN_CONFIG.instanceUri}/oauth_auth.do</div></div>
      <div class="kv"><div class="k">Token URL</div><div class="v">${SN_CONFIG.instanceUri}/oauth_token.do</div></div>
      <div class="kv"><div class="k">Redirect URI</div><div class="v">${SN_CONFIG.redirectUri}</div></div>
      <div class="kv"><div class="k">OAuth Client ID</div><div class="v">${SN_CONFIG.clientId}</div></div>
      <div class="kv"><div class="k">Service Account</div><div class="v">${SN_CONFIG.username}</div></div>
      <div class="kv"><div class="k">Scopes</div><div class="v">useraccount offline_access</div></div>
      <div class="kv"><div class="k">HTTP Basic Auth</div><div class="v">Enabled (client_secret_basic)</div></div>
      <div class="kv"><div class="k">Tool Annotation</div><div class="v">readOnlyHint: true (all 5 tools)</div></div>
    </div>

    <div class="card">
      <div class="step-banner" id="stepTitle">Ready to execute BYOMCP step...</div>
      <div id="tableContainer"></div>
      <pre id="rpcOutput">Waiting for RPC execution...</pre>
    </div>
  </div>

  <script>
    window.renderStepResult = function(stepTitle, rows, rawJson) {
      document.getElementById('stepTitle').innerHTML = stepTitle;
      const tc = document.getElementById('tableContainer');
      if (Array.isArray(rows) && rows.length > 0) {
        const cols = Object.keys(rows[0]);
        let html = '<table><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        for (const r of rows) {
          html += '<tr>' + cols.map(c => '<td>' + (r[c] ?? '') + '</td>').join('') + '</tr>';
        }
        html += '</tbody></table><div style="height:12px"></div>';
        tc.innerHTML = html;
      } else {
        tc.innerHTML = '';
      }
      document.getElementById('rpcOutput').textContent = JSON.stringify(rawJson, null, 2);
    };
  </script>
</body>
</html>`);
});

server.listen(PORT, () => {
  console.log(`BYOMCP ServiceNow Server listening on http://localhost:${PORT}/mcp`);
});
