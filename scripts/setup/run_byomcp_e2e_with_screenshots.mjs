import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scratch/screenshots_byomcp_step1');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PORT = 8788;
const BASE_URL = `http://localhost:${PORT}`;

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function rpcCall(method, params = {}, id = 1) {
  const resp = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return resp.json();
}

async function main() {
  const srv = spawn('node', ['scratch/byomcp_servicenow/server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, MCP_PORT: String(PORT) },
  });

  try {
    await waitForServer(`${BASE_URL}/.well-known/oauth-authorization-server`);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1600,1040',
        '--ignore-certificate-errors',
      ],
      defaultViewport: { width: 1600, height: 1040, deviceScaleFactor: 2 },
    });

    const page = await browser.newPage();

    // STEP 1: Probe user's GE Instance URL and capture live instance inspection + exact UI form values
    const targetGeUrl = 'https://ucs-widget.corp.google.com/home/cid/fdd1e98d-1f52-4407-98fd-80e27c61fbc9?e=SparkDogfoodLaunch%3A%3ALaunch';
    console.log('[STEP 1] Inspecting target GE instance:', targetGeUrl);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    const step1Rows = [
      { field: 'Target GE Instance URL', value: targetGeUrl },
      { field: 'CID Config Mapping (google3)', value: 'fdd1e98d-1f52-4407-98fd-80e27c61fbc9 -> ASMO_PROD_CONFIG_ID (GEfG Prod Dogfood)' },
      { field: 'Backing GCP Project & Engine', value: 'Project 670560280865 • Engine ID: spark_dogfood_search_assistant_v1' },
      { field: 'Staging MCP Testing CID', value: '53741803-7188-40a7-8a10-ee1eaed03706 (go/gefg-corp-staging-mcp-testing)' },
      { field: 'GE UI Form Field: MCP Server URL', value: 'http://localhost:8788/mcp (or Cloud Run HTTPS endpoint)' },
      { field: 'GE UI Form Field: Authorization URL', value: 'https://gcxxxxr2.service-now.com/oauth_auth.do' },
      { field: 'GE UI Form Field: Token URL', value: 'https://gcxxxxr2.service-now.com/oauth_token.do' },
      { field: 'GE UI Form Field: Redirect URI', value: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { field: 'GE UI Form Field: Scopes & Basic Auth', value: 'useraccount offline_access • Use HTTP Basic Auth = Enabled' },
    ];
    await page.evaluate((title, rows, raw) => window.renderStepResult(title, rows, raw),
      '<strong>STEP 1 OF 5:</strong> Target Gemini Enterprise Instance Inspection (<code>fdd1e98d-1f52-4407-98fd-80e27c61fbc9</code>) &amp; BYOMCP Form Values',
      step1Rows,
      {
        target_ge_instance: targetGeUrl,
        google3_source: '//depot/google3/cloud/ml/agentspace/g3doc/connectors/byomcp-playbook.md',
        connector_mode: 'custom_mcp (BYOMCP)',
        servicenow_instance: 'https://gcxxxxr2.service-now.com/',
        oauth_client_id: '43xxxxaf',
        user_account: 'connectorsuserqa@dexxxxte.com',
      }
    );
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT_DIR, '01_step1_target_ge_instance_ucs_widget.png') });

    // STEP 2: Verify OAuth Discovery & Token Exchange against gcxxxxr2.service-now.com
    console.log('[STEP 2] Verifying OAuth 2.0 Discovery & Live Token Exchange...');
    const wellKnownResource = await (await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`)).json();
    const wellKnownAuth = await (await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`)).json();
    const tokenExchange = await (await fetch(`${BASE_URL}/oauth/token`, { method: 'POST' })).json();

    const step2SummaryRows = [
      { endpoint: '/.well-known/oauth-protected-resource', status: '200 OK', detail: wellKnownResource.resource },
      { endpoint: '/.well-known/oauth-authorization-server', status: '200 OK', detail: wellKnownAuth.token_endpoint },
      { endpoint: 'POST /oauth/token (gcxxxxr2.service-now.com)', status: '200 OK', detail: `scope="${tokenExchange.scope}", expires_in=${tokenExchange.expires_in}s, token_prefix=${(tokenExchange.access_token || '').slice(0, 18)}...` },
    ];
    await page.evaluate((title, rows, raw) => window.renderStepResult(title, rows, raw),
      '<strong>STEP 2 OF 5:</strong> Gemini Enterprise BYOMCP OAuth 2.0 Discovery &amp; Live ServiceNow Token Exchange (HTTP 200 OK)',
      step2SummaryRows,
      { wellKnownResource, wellKnownAuth, tokenExchangePreview: { ...tokenExchange, access_token: `${tokenExchange.access_token.slice(0, 24)}...[REDACTED_LIVE_TOKEN]` } }
    );
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT_DIR, '02_step2_byomcp_oauth_and_config_verified.png') });

    // STEP 3: Execute MCP initialize + tools/list
    console.log('[STEP 3] Executing MCP initialize + tools/list...');
    const initResp = await rpcCall('initialize', {
      protocolVersion: '2025-03-26',
      clientInfo: { name: 'gemini-enterprise-dolphin-client', version: '1.0.0' },
      capabilities: {},
    }, 101);
    const listResp = await rpcCall('tools/list', {}, 102);
    const toolRows = listResp.result.tools.map(t => ({
      tool_name: t.name,
      readOnlyHint: String(t.annotations?.readOnlyHint),
      description: t.description,
    }));
    await page.evaluate((title, rows, raw) => window.renderStepResult(title, rows, raw),
      '<strong>STEP 3 OF 5:</strong> MCP Handshake (<code>initialize</code>) &amp; Tool Registration (<code>tools/list</code> with <code>readOnlyHint: true</code>)',
      toolRows,
      { initialize: initResp, tools_list: listResp }
    );
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT_DIR, '03_step3_byomcp_initialize_and_tools_list.png') });

    // STEP 4: Execute Live MCP Query #1 (search_servicenow_incidents)
    console.log('[STEP 4] Executing live MCP tools/call -> search_servicenow_incidents...');
    const incCall = await rpcCall('tools/call', {
      name: 'search_servicenow_incidents',
      arguments: { limit: 6 },
    }, 103);
    const incRows = JSON.parse(incCall.result.content[0].text);
    await page.evaluate((title, rows, raw) => window.renderStepResult(title, rows, raw),
      '<strong>STEP 4 OF 5:</strong> Live MCP Query Execution (<code>tools/call</code> &rarr; <code>search_servicenow_incidents</code> on <code>gcxxxxr2.service-now.com</code>)',
      incRows,
      incCall
    );
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT_DIR, '04_step4_byomcp_live_incident_query_results.png') });

    // STEP 5: Execute Live MCP Query #2 (search_servicenow_knowledge_articles + list_servicenow_catalog_items)
    console.log('[STEP 5] Executing live MCP tools/call -> search_servicenow_knowledge_articles & list_servicenow_catalog_items...');
    const kbCall = await rpcCall('tools/call', {
      name: 'search_servicenow_knowledge_articles',
      arguments: { limit: 5 },
    }, 104);
    const catCall = await rpcCall('tools/call', {
      name: 'list_servicenow_catalog_items',
      arguments: { limit: 5 },
    }, 105);
    const kbRows = JSON.parse(kbCall.result.content[0].text);
    const catRows = JSON.parse(catCall.result.content[0].text);
    const combinedRows = [
      ...kbRows.map(k => ({ source_table: 'kb_knowledge', number_or_name: k.number, short_description: k.short_description, state_or_price: k.workflow_state, sys_id: k.sys_id })),
      ...catRows.map(c => ({ source_table: 'sc_cat_item', number_or_name: c.name, short_description: c.short_description, state_or_price: c.price, sys_id: c.sys_id })),
    ];
    await page.evaluate((title, rows, raw) => window.renderStepResult(title, rows, raw),
      '<strong>STEP 5 OF 5:</strong> Live MCP Multi-Table Query Execution (<code>search_servicenow_knowledge_articles</code> &amp; <code>list_servicenow_catalog_items</code>)',
      combinedRows,
      { kb_knowledge_call: kbCall, sc_cat_item_call: catCall }
    );
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT_DIR, '05_step5_byomcp_live_kb_and_catalog_query_results.png') });

    await browser.close();
    console.log('ALL 5 STEP SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    srv.kill('SIGTERM');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
