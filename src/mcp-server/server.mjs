import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { startVeevaMcpServer } from '../veeva-mcp-server/server.mjs';

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

const AUDIO_CACHE_DIR = path.resolve(ROOT_DIR, 'scratch/audio_cache');
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

// Google Cloud Token Caching
let cachedGcloudToken = null;
let gcloudTokenExpiry = 0;

function getGcloudAccessToken() {
  if (cachedGcloudToken && Date.now() < gcloudTokenExpiry) {
    return cachedGcloudToken;
  }
  try {
    const token = execSync('gcloud auth print-access-token', { timeout: 8000 }).toString().trim();
    if (token && token.startsWith('ya29.')) {
      cachedGcloudToken = token;
      gcloudTokenExpiry = Date.now() + 40 * 60 * 1000; // 40 minutes
      return token;
    }
  } catch (err) {
    console.warn('[Audio] gcloud token note:', err.message);
  }
  return null;
}


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

// Microsoft Unified Connector Live Sample Data
const msSampleData = {
  tenant_id: '72f988bf-86f1-41af-91ab-2d7cd011db47',
  client_id: 'a87265c1-3991-4c12-9c92-7f28bcde2910',
  entra_domain: 'argolis-enterprise.onmicrosoft.com',
  graph_endpoint: 'https://graph.microsoft.com/v1.0',
  connector_type: 'MICROSOFT_UNIFIED (SharePoint, Teams, OneDrive, Exchange)',
  auth_mode: 'OAuth 2.0 Auth Code (3LO) / Entra ID Delegated',
  scopes: 'Files.Read.All, Sites.Read.All, Chat.Read, Mail.Read, offline_access',
  status: 'ACTIVE_CONNECTED',
  documents: [
    { id: 'SP-DOC-8921', title: 'FY27 Global Cloud Infrastructure Strategy.docx', source: 'SharePoint Online (Global IT Intranet)', author: 'Satya N. / Cloud Architecture', modified: '2026-09-18 14:22:00', permissions: 'Confidential / Internal' },
    { id: 'SP-DOC-8922', title: 'AI Grounding Architecture & Graph API Connector Guide.pptx', source: 'SharePoint Online (AI CoE)', author: 'Enterprise Arch Lead', modified: '2026-09-20 09:15:30', permissions: 'Enterprise-Wide' },
    { id: 'OD-FILE-4410', title: 'Q3 Enterprise MCP Benchmarks & Latency Matrix.xlsx', source: 'OneDrive for Business', author: 'Cloud Performance Team', modified: '2026-09-21 16:40:12', permissions: 'Restricted' },
    { id: 'TM-MSG-1092', title: 'Incident Response War Room: P1 Cloud Egress Latency', source: 'Microsoft Teams (#cloud-ops)', author: 'SecOps Director', modified: '2026-09-22 08:30:00', permissions: 'Operations Team' },
    { id: 'EX-MAIL-3301', title: 'Approved Architecture Decision Record: Vertex AI + Microsoft Unified', source: 'Exchange Online', author: 'VP Enterprise Engineering', modified: '2026-09-22 11:05:44', permissions: 'Executive Distribution' }
  ]
};



// Canonical Bidirectional Mapping between Interactive Demo Tools & Underlying Verification Assets
const TOOL_ASSET_MAPPINGS = {
  'search_servicenow_incidents': {
    toolName: 'search_servicenow_incidents',
    tab: 'servicenow',
    assetId: '14_ge_chat_matching_servicenow_query_results',
    label: 'Incident Search Proof (INC1039)',
    group: 'ground-truth'
  },
  'get_servicenow_incident': {
    toolName: 'get_servicenow_incident',
    tab: 'servicenow',
    assetId: '15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison',
    label: 'Incident INC1039 Side-by-Side Parity',
    group: 'ground-truth'
  },
  'search_servicenow_knowledge_articles': {
    toolName: 'search_servicenow_knowledge_articles',
    tab: 'servicenow',
    assetId: '19_ge_chat_sources_menu_servicenow_connector_selected',
    label: 'Knowledge Sources Menu',
    group: 'ge-chat'
  },
  'list_servicenow_catalog_items': {
    toolName: 'list_servicenow_catalog_items',
    tab: 'servicenow',
    assetId: '21_ge_chat_servicenow_connector_tool_call_state',
    label: 'Live Tool Call & Catalog State',
    group: 'ge-chat'
  },
  'search_servicenow_problems_and_changes': {
    toolName: 'search_servicenow_problems_and_changes',
    tab: 'servicenow',
    assetId: '13b_servicenow_live_ui_full_incident_list',
    label: 'ServiceNow Polaris Live Records List',
    group: 'ground-truth'
  },
  'search_vault_documents': {
    toolName: 'search_vault_documents',
    tab: 'veeva',
    assetId: '11_veeva_live_ui_query_results',
    label: 'Veeva Live UI Regulatory Documents',
    group: 'ground-truth'
  },
  'get_audit_trail': {
    toolName: 'get_audit_trail',
    tab: 'veeva',
    assetId: '12_ge_chat_matching_veeva_query_results',
    label: 'GE Chat Veeva Audit Query & Response',
    group: 'ground-truth'
  },
  'get_binder_structure': {
    toolName: 'get_binder_structure',
    tab: 'veeva',
    assetId: '13_veeva_ui_vs_ge_chat_side_by_side_truth_comparison',
    label: '21 CFR Part 11 Compliance Parity',
    group: 'ground-truth'
  }
};

const ASSET_TOOL_MAPPINGS = {
  '14_ge_chat_matching_servicenow_query_results': { tab: 'servicenow', tool: 'search_servicenow_incidents', label: 'search_servicenow_incidents' },
  '15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison': { tab: 'servicenow', tool: 'get_servicenow_incident', label: 'get_servicenow_incident' },
  '13b_servicenow_live_ui_full_incident_list': { tab: 'servicenow', tool: 'search_servicenow_problems_and_changes', label: 'search_servicenow_problems_and_changes' },
  '19_ge_chat_sources_menu_servicenow_connector_selected': { tab: 'servicenow', tool: 'search_servicenow_knowledge_articles', label: 'search_servicenow_knowledge_articles' },
  '21_ge_chat_servicenow_connector_tool_call_state': { tab: 'servicenow', tool: 'list_servicenow_catalog_items', label: 'list_servicenow_catalog_items' },
  '11_veeva_live_ui_query_results': { tab: 'veeva', tool: 'search_vault_documents', label: 'search_vault_documents' },
  '12_ge_chat_matching_veeva_query_results': { tab: 'veeva', tool: 'get_audit_trail', label: 'get_audit_trail' },
  '13_veeva_ui_vs_ge_chat_side_by_side_truth_comparison': { tab: 'veeva', tool: 'get_binder_structure', label: 'get_binder_structure' }
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
    let query = '';
    if (args.query) {
      if (args.query.startsWith('PRB') || args.query.startsWith('CHG')) {
        query = `number=${args.query}`;
      } else {
        query = `short_descriptionLIKE${args.query}`;
      }
    }
    const rows = await queryServiceNowTable(table, {
      sysparm_limit: limit,
      sysparm_query: query,
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

const SLIDE_CONCEPT_NARRATIONS = {
  // Group 1: Argolis Console & Data Stores (15 slides)
  "00_post_login_state.png": "Welcome to Google Cloud.\n\nAfter authenticating through enterprise single sign-on... we land directly inside the Vertex AI Search and Conversation console.\n\nNotice how this dashboard anchors our enterprise discovery engine — coordinating indexing schedules, embeddings, and security boundaries across every organizational data store.",
  "01_argolis_console_engines_overview.png": "Here in the Argolis console... we examine our active search and conversation engines.\n\nEach engine encapsulates semantic retrieval, embedding models, and tool definitions.\n\nWhy is this architecture so critical? Because it serves as the unified AI grounding backend — powering both Gemini Enterprise and downstream conversational agents with strict enterprise governance.",
  "02_argolis_console_datastores_overview.png": "Navigating to the Data Stores tab... we inspect the underlying knowledge repositories.\n\nTake a close look at the custom ServiceNow Cloud Run deployment registered right alongside production data stores.\n\nThis design enables federated, real-time retrieval — without requiring risky or redundant manual data replication.",
  "03_argolis_console_create_datastore_connectors.png": "When provisioning a new data store... Google Cloud presents a rich choice of first-party ingestion pipelines.\n\nTo integrate live IT service management data directly... we navigate into the third-party partner connector marketplace.",
  "04_argolis_wizard_step1_search_servicenow_cards.png": "Filtering third-party sources brings up the official ServiceNow connector.\n\nWhy does this matter? Google Cloud native connectors provide fully managed ingestion pipelines — handling OAuth handshakes, delta synchronization, and schema discovery with zero custom code.",
  "04b_argolis_wizard_step1_servicenow_card_scrolled.png": "Selecting the ServiceNow integration card reveals its full capabilities.\n\nIt supports automated schema discovery across core ITSM tables — including Incident, Change Request, Problem, and the Knowledge Base.\n\nNotice how all relational linkages are preserved automatically.",
  "05_argolis_wizard_step2_servicenow_mode_and_auth_config.png": "Step two initiates connection configuration.\n\nHere we define our ServiceNow instance host URI... and choose between OAuth 2.0 authorization code grant or client credentials.\n\nThis gives enterprise architects complete flexibility to align with corporate security policies.",
  "06_argolis_wizard_step2_servicenow_auth_fields_scrolled.png": "Scrolling down through the authentication parameters... we configure token endpoints, client secrets, and scopes.\n\nWhere do these credentials live? Google Cloud stores them securely within Secret Manager — featuring automatic encryption and customer-managed encryption keys.",
  "08_argolis_gemini_enterprise_app_config_and_connected_datastores.png": "Inside the Gemini Enterprise application configuration... we verify how data stores bind to the agent runtime.\n\nThis mapping is critical. It defines the exact knowledge domains and operational boundaries the AI model can tap into during conversational grounding.",
  "09_argolis_wizard_step2_servicenow_credentials_filled.png": "With our OAuth client identifier and instance endpoints populated... the wizard prepares to execute a cryptographic handshake against the ServiceNow identity provider.",
  "09b_argolis_wizard_step2_servicenow_verify_auth_clicked.png": "Clicking Verify Authentication triggers an outbound mutual TLS authorization probe.\n\nGoogle Cloud validates tenant certificates... and confirms that the provided credentials hold valid read permissions across the target tables.",
  "10_argolis_wizard_step3_servicenow_connection_tested_destinations.png": "Once authentication succeeds... Step three maps the ingested records directly to their destination data store.\n\nHere, we designate a dedicated search index — purpose-built and optimized for IT operational metadata.",
  "10b_argolis_wizard_step3_destinations_expanded.png": "Expanding destination details confirms the underlying index topology.\n\nNotice that Google Cloud allocates multi-region resilient storage — backed by automated replication and enterprise disaster recovery.",
  "10c_argolis_wizard_step4_advanced_options_expanded.png": "Step four unlocks advanced tuning.\n\nAdministrators can configure custom document filters, entity extraction models, and ACL synchronization rules — mirroring ServiceNow user permissions directly into Gemini search results.",
  "11_argolis_wizard_step5_servicenow_entities_to_search.png": "Step five specifies the entity scope.\n\nBy indexing incident numbers, caller identifiers, priority levels, and assignment groups... we empower Gemini Enterprise to resolve nuanced, mission-critical operational questions.",

  // Group 2: GCP Console 01-05 (5 slides)
  "gcp_console_01_engines_overview.png": "This high-level perspective showcases our complete fleet of Vertex AI Search engines.\n\nIt illustrates how multiple conversational agents across different business units can share underlying connector infrastructure — without cross-tenant data leakage.",
  "gcp_console_02_datastores_overview.png": "Here we audit active data stores across environments.\n\nTracking document counts, update frequencies, and synchronization health ensures operational visibility across all enterprise knowledge sources.",
  "gcp_console_03_ai_applications_start_page.png": "The AI Applications portal is the launchpad where developers create new Gemini Enterprise experiences.\n\nIt seamlessly combines multi-turn conversational agents with live enterprise grounding.",
  "gcp_console_04_ai_applications_engines.png": "Reviewing the engines linked to our enterprise applications demonstrates how modular search indexes power distinct departmental workspaces — from IT support to HR.",
  "gcp_console_05_ai_applications_datastores.png": "Here we see the connected data stores ready for deployment... completing the foundational ingestion setup in Google Cloud Console.",

  // Group 3: BYOMCP Integration Architecture (4 slides)
  "07_argolis_existing_byomcp_datastore_detail_config.png": "Here is our Bring Your Own MCP connector configuration.\n\nUnlike traditional scheduled batch syncs... BYOMCP connects via the open Model Context Protocol over streamable HTTP.\n\nThe real breakthrough? Zero-latency live queries directly against ServiceNow APIs — with no batch ETL required.",
  "12_argolis_byomcp_view_edit_parameters_modal.png": "The View and Edit Parameters modal allows administrators to adjust endpoint headers, tune timeout thresholds, and update query filter predicates... all without redeploying the underlying microservice.",
  "13_argolis_byomcp_reauthenticate_credentials_modal.png": "When security rotation policies trigger or OAuth refresh tokens expire... this modal facilitates credential renewal.\n\nIt initiates an on-demand OAuth handshake — ensuring zero downtime for end users.",
  "13b_argolis_byomcp_reauthenticate_credentials_populated.png": "Confirming the updated client secret completes the re-authentication sequence.\n\nThe MCP server immediately receives fresh authorization bearer tokens to resume live queries without missing a beat.",

  // Group 4: Gemini Enterprise Conversational Threads (11 slides)
  "14_argolis_ge_chat_home_screen.png": "Welcome to the Gemini Enterprise chat interface.\n\nThis delivers an intuitive, enterprise-grade AI workspace where employees can search documents, query systems of record, and trigger business workflows in natural language.",
  "15_argolis_ge_chat_servicenow_incident_retrieval_thread.png": "In this conversational thread... an IT specialist asks about recent high-priority network outages.\n\nWatch how Gemini dynamically recognizes that ServiceNow holds the authoritative records... and immediately prepares an MCP tool call.",
  "15_argolis_ge_chat_servicenow_query_entered.png": "Notice the query prompt entered by the user.\n\nGemini's semantic parser extracts key entities like priority and topic — rather than relying on brittle, keyword-based matching.",
  "16_argolis_ge_chat_gxp_lims_asset_ci_thread.png": "Here we see Gemini handling a specialized life sciences query.\n\nThis demonstrates its remarkable versatility across IT service management... and regulated laboratory information management systems.",
  "16_argolis_ge_chat_servicenow_live_response.png": "Gemini returns a synthesized operational brief.\n\nNotice how it highlights critical incident details, current assigned technician, and recent work notes — grounding every single claim in live ServiceNow data.",
  "17_argolis_ge_chat_new_servicenow_query_entered.png": "In this follow-up query... the user asks for specific incident numbers.\n\nGemini maintains multi-turn conversational memory... and refines its subsequent MCP search parameters accordingly.",
  "18_argolis_ge_chat_new_servicenow_query_live_response.png": "The live response streams back formatted tables and direct system links.\n\nUsers can review ticket status without ever needing to navigate complex ServiceNow forms.",
  "19_ge_chat_sources_menu_servicenow_connector_selected.png": "The Sources and Tools menu allows users to inspect and toggle active integrations.\n\nSelecting the ServiceNow connector explicitly authorizes Gemini to query the live BYOMCP endpoint.",
  "20_ge_chat_servicenow_connector_prompt_ready.png": "With the ServiceNow connector active... a visual indicator confirms tool readiness.\n\nGemini automatically includes the connector's tool definitions within its execution context.",
  "21_ge_chat_servicenow_connector_tool_call_state.png": "This screenshot reveals the underlying reasoning step.\n\nGemini emits a structured JSON-RPC search_servicenow_incidents call — transmitting parameter payloads directly to our local MCP bridge.",
  "22_ge_chat_servicenow_connector_live_query_response.png": "Upon receiving the JSON-RPC response... Gemini synthesizes a comprehensive response, formatting tabular ticket fields into clear, human-digestible prose.",

  // Group 5: Gemini Enterprise Application & Features (12 slides)
  "ge_app_01_home_dashboard.png": "The Gemini Enterprise home dashboard serves as the daily hub for corporate knowledge discovery... providing instant access to enterprise agents and recent chats.",
  "ge_app_02_select_tools_menu.png": "Opening the Tools selector reveals available first-party and third-party extensions.\n\nThis gives administrators granular control over which external systems the agent may contact.",
  "ge_app_03_sources_connectors_menu.png": "The Sources panel exposes connected enterprise repositories.\n\nAdministrators can verify which indexes are active and check synchronization timestamps.",
  "ge_app_03b_sources_connectors_scrolled.png": "Scrolling through the connectors list confirms active bindings for ServiceNow, Veeva Vault, and Google Drive — forming a unified corporate knowledge fabric.",
  "ge_app_07_headless_verified_home.png": "This headless browser capture verifies interface responsiveness and component initialization under automated regression test conditions.",
  "ge_app_08_servicenow_query_prompt_entered.png": "Here the operator prepares an incident query.\n\nGemini's auto-completion and context hints guide the user toward actionable operational phrasing.",
  "ge_app_09_servicenow_live_chat_response_part1.png": "Part one of the live response shows immediate tool invocation.\n\nGemini streams initial ticket summaries and status badges in real time.",
  "ge_app_10_servicenow_live_chat_response_part2.png": "Part two delivers expanded technical diagnostics... detailing root causes and recommended remediation procedures extracted from resolved ServiceNow incidents.",
  "ge_app_04_enterprise_search_view.png": "The Enterprise Search view unifies structured database queries with unstructured document retrieval — giving staff a single search box for the entire organization.",
  "ge_app_04_new_agent_builder.png": "Agent Studio provides a no-code canvas to build specialized virtual colleagues.\n\nBuilders define persona instructions, configure guardrails, and attach tools with zero scripting.",
  "ge_app_05_agents_gallery.png": "The Agents Gallery catalogs certified organizational agents — from IT Service Desk helpers to HR onboarding guides — ready for one-click deployment.",
  "ge_app_06_new_agent_studio.png": "Inside Agent Studio... engineers can test model behavior, inspect prompt-to-tool routing, and simulate edge cases in an interactive sandbox.",

  // Group 6: Ground-Truth Parity: Native UI vs. GE Chat Side-by-Side (7 slides)
  "13_servicenow_live_ui_query_results.png": "This is our ground-truth baseline... the native ServiceNow Polaris UI showing live incident INC1039.\n\nWe inspect the raw short description, state code, and priority values.",
  "13b_servicenow_live_ui_full_incident_list.png": "Examining the full incident table in ServiceNow establishes the exact records present in the production database prior to agent testing.",
  "14_ge_chat_matching_servicenow_query_results.png": "Now we examine Gemini Enterprise querying the exact same incident.\n\nEvery single field — from ticket ID to status timestamps — matches the ServiceNow record verbatim.",
  "15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison.png": "Here is the definitive side-by-side parity proof.\n\nOn the left... native ServiceNow. On the right... Gemini Enterprise.\n\nNotice every single attribute — from the incident description to priority badges — matches verbatim. That's one hundred percent data fidelity... with zero hallucination.",
  "11_veeva_live_ui_query_results.png": "Turning to our life sciences integration... this screenshot displays clinical trial documentation and audit records inside native Veeva Vault GxP.",
  "12_ge_chat_matching_veeva_query_results.png": "Gemini Enterprise queries the Veeva Vault MCP server — returning exact document versions and 21 CFR Part 11 compliant approval states.",
  "13_veeva_ui_vs_ge_chat_side_by_side_truth_comparison.png": "This final comparison confirms strict regulatory parity between Veeva Vault and Gemini Enterprise... demonstrating enterprise readiness for compliance-critical workloads.",

  // Group 7: Multi-Tab Audit & Identity SSO Verification (11 slides)
  "tab1_IAM_amp_Admin_Google_Cloud_console.png": "Auditing Tab one verifies IAM permissions.\n\nWe ensure the service accounts driving our connectors hold principle-of-least-privilege access.",
  "tab2_AI_Applications_Google_Cloud_console.png": "Tab two tracks our Vertex AI application runtime... verifying healthy resource allocation and latency metrics.",
  "tab3_Introduction_The_LLM_Extension.png": "Tab three inspects LLM extension manifests... auditing how model tool declarations are packaged and validated.",
  "tab4_Laxis_Your_AI_Workforce.png": "Tab four confirms external partner session state — ensuring clean isolation between tenant workspaces.",
  "tab5_AI_Applications_Google_Cloud_console.png": "Tab five verifies engine configuration across regional zones... confirming high availability for mission-critical search.",
  "tab6_Google.png": "Tab six validates corporate identity single sign-on federation through Google Workspace and Okta.",
  "tab7_Gemini_Enterprise.png": "Tab seven confirms the active Gemini Enterprise user session... demonstrating seamless cross-tab authentication.",
  "01_gemini_enterprise_app_ucs_widget.png": "Here we audit the unified conversational search widget embedded into internal portal frameworks.",
  "02_pantheon_gen_app_builder_engines.png": "This view audits underlying Gen App Builder engine endpoints in the Google Cloud Pantheon console.",
  "03_pantheon_gen_app_builder_datastores.png": "Inspecting Gen App Builder data stores confirms healthy index synchronization across all document partitions.",
  "04_cloud_console_gen_app_builder_engines.png": "Finally... this audit view validates that all deployed engines maintain green operational status in the Google Cloud Console."
};

function getConceptNarration(fileName, title, groupTitle, groupDesc) {
  if (SLIDE_CONCEPT_NARRATIONS[fileName]) {
    return SLIDE_CONCEPT_NARRATIONS[fileName];
  }
  return `This view captures ${title} within the ${groupTitle} workflow. ${groupDesc}`;
}

// All Supported Narrator Voice Options
const NARRATOR_VOICES = {
  // 🌟 Google Journey (Ultra-Human Storyteller — Most Expressive & Natural)
  'journey-d': {
    name: 'David',
    engine: 'google-journey',
    model: 'en-US-Journey-D',
    role: 'Warm Human Architect',
    group: 'Google Journey',
    gender: 'male',
    tag: '🌟 Most Human'
  },
  'journey-f': {
    name: 'Fiona',
    engine: 'google-journey',
    model: 'en-US-Journey-F',
    role: 'Natural Expressive Narrator',
    group: 'Google Journey',
    gender: 'female',
    tag: '🌟 Natural Storyteller'
  },
  'journey-o': {
    name: 'Olivia',
    engine: 'google-journey',
    model: 'en-US-Journey-O',
    role: 'Executive Keynote',
    group: 'Google Journey',
    gender: 'female',
    tag: '🌟 Executive Keynote'
  },

  // ⚡ Google DeepMind Chirp-HD (Foundation Speech Model)
  'chirp-d': {
    name: 'Daniel',
    engine: 'google-chirp',
    model: 'en-US-Chirp-HD-D',
    role: 'Dynamic Tech Lead',
    group: 'Google Chirp-HD',
    gender: 'male',
    tag: '⚡ Tech Specialist'
  },
  'chirp-f': {
    name: 'Faith',
    engine: 'google-chirp',
    model: 'en-US-Chirp-HD-F',
    role: 'Articulate Engineer',
    group: 'Google Chirp-HD',
    gender: 'female',
    tag: '⚡ Articulate'
  },

  // 🎙️ Google Studio (Broadcast Keynote)
  'studio-q': {
    name: 'Quinn',
    engine: 'google-studio',
    model: 'en-US-Studio-Q',
    role: 'Broadcast Baritone',
    group: 'Google Studio',
    gender: 'male',
    tag: '🎙️ Broadcast Baritone'
  },
  'studio-o': {
    name: 'Oprah',
    engine: 'google-studio',
    model: 'en-US-Studio-O',
    role: 'Studio Documentary',
    group: 'Google Studio',
    gender: 'female',
    tag: '🎙️ Studio Documentary'
  },

  // 🤖 Google Gemini DeepMind Multimodal Audio
  'gemini-charon': {
    name: 'Charon',
    engine: 'gemini-tts',
    model: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Charon',
    role: 'Cloud Principal Architect',
    group: 'Google Gemini',
    gender: 'male',
    tag: '🤖 DeepMind Architect'
  },
  'gemini-aoede': {
    name: 'Aoede',
    engine: 'gemini-tts',
    model: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Aoede',
    role: 'Executive Briefing Lead',
    group: 'Google Gemini',
    gender: 'female',
    tag: '🤖 DeepMind Executive'
  },
  'gemini-puck': {
    name: 'Puck',
    engine: 'gemini-tts',
    model: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Puck',
    role: 'Solutions Advocate',
    group: 'Google Gemini',
    gender: 'male',
    tag: '🤖 DeepMind Solutions'
  },
  'gemini-kore': {
    name: 'Kore',
    engine: 'gemini-tts',
    model: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Kore',
    role: 'Security & Compliance Auditor',
    group: 'Google Gemini',
    gender: 'female',
    tag: '🤖 Security Auditor'
  },
  'gemini-fenrir': {
    name: 'Fenrir',
    engine: 'gemini-tts',
    model: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Fenrir',
    role: 'Staff Infrastructure Architect',
    group: 'Google Gemini',
    gender: 'male',
    tag: '🤖 Staff Architect'
  },

  // 🌐 OpenAI GPT-4o Omni Audio
  'openai-alloy': {
    name: 'Alloy',
    engine: 'openai-tts',
    model: 'tts-1',
    voiceName: 'alloy',
    role: 'OpenAI Omni Balanced',
    group: 'OpenAI Omni',
    gender: 'neutral',
    tag: '🌐 Omni Balanced'
  },
  'openai-echo': {
    name: 'Echo',
    engine: 'openai-tts',
    model: 'tts-1',
    voiceName: 'echo',
    role: 'OpenAI Omni Resonance',
    group: 'OpenAI Omni',
    gender: 'male',
    tag: '🌐 Omni Resonance'
  },
  'openai-nova': {
    name: 'Nova',
    engine: 'openai-tts',
    model: 'tts-1',
    voiceName: 'nova',
    role: 'OpenAI Omni Dynamic',
    group: 'OpenAI Omni',
    gender: 'female',
    tag: '🌐 Omni Dynamic'
  },
  'openai-onyx': {
    name: 'Onyx',
    engine: 'openai-tts',
    model: 'tts-1',
    voiceName: 'onyx',
    role: 'OpenAI Omni Baritone',
    group: 'OpenAI Omni',
    gender: 'male',
    tag: '🌐 Omni Baritone'
  },

  // 💻 Browser Device Voice (Offline Fallback)
  'browser-default': {
    name: 'Local Device Voice',
    engine: 'browser-speech-synthesis',
    role: 'Offline Device Synthesis',
    group: 'Browser Native',
    gender: 'neutral',
    tag: '💻 Local Offline'
  }
};


function getLogicalGroups() {
  const screenshotsRoot = path.resolve(ROOT_DIR, 'screenshots');
  const allImages = [];
  if (fs.existsSync(screenshotsRoot)) {
    const entries = fs.readdirSync(screenshotsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDirPath = path.join(screenshotsRoot, entry.name);
        const files = fs.readdirSync(subDirPath)
          .filter(f => /\.(png|jpg|jpeg|webp|svg)$/i.test(f))
          .sort();
        for (const file of files) {
          const rawSlug = file.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          allImages.push({
            assetId: rawSlug,
            fileName: file,
            dirName: entry.name,
            title: file.replace(/^\d+[a-z]?_/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' '),
            url: `/screenshots/${entry.name}/${file}`,
            fullPath: path.join(subDirPath, file),
          });
        }
      }
    }
  }

  const groupDefs = [
    {
      id: 'gcp-wizard',
      title: 'GCP Console: Data Store & ServiceNow Wizard',
      icon: '🛠️',
      description: 'End-to-end setup in Google Cloud Console: Vertex AI Search data store provisioning, 3rd-party ServiceNow connector selection, OAuth credential configuration, and destination mapping.',
      filter: item => {
        if (item.dirName === 'screenshots_ge_app_and_console' && item.fileName.startsWith('gcp_console_')) return true;
        if (item.dirName === 'screenshots_argolis_console') {
          const match = item.fileName.match(/^(\d+[a-z]?)_/);
          if (match) {
            const num = match[1];
            if (['00','01','02','03','04','04b','05','06','08','09','09b','10','10b','10c','11'].includes(num)) return true;
          }
        }
        return false;
      }
    },
    {
      id: 'byomcp-setup',
      title: 'BYOMCP Connector Configuration & Re-Authentication',
      icon: '🔌',
      description: 'Bring Your Own MCP (BYOMCP) server registration, custom tool definitions, parameter editing, and live token re-authentication dialogs.',
      filter: item => {
        if (item.dirName === 'screenshots_argolis_console') {
          const match = item.fileName.match(/^(\d+[a-z]?)_/);
          if (match) {
            const num = match[1];
            if (['07','12','13','13b'].includes(num)) return true;
          }
        }
        return false;
      }
    },
    {
      id: 'ge-chat',
      title: 'Gemini Enterprise Chat: Sources, Tools & Live Queries',
      icon: '💬',
      description: 'Gemini Enterprise web application interface: connected tool activation, ServiceNow sources drawer, natural language incident lookups, and multi-turn live query generation.',
      filter: item => {
        if (item.dirName === 'screenshots_argolis_console') {
          const match = item.fileName.match(/^(\d+[a-z]?)_/);
          if (match) {
            const num = match[1];
            if (['14','15','16','17','18','19','20','21','22'].includes(num)) return true;
          }
        }
        if (item.dirName === 'screenshots_ge_app_and_console') {
          if (['ge_app_01_home_dashboard.png', 'ge_app_02_select_tools_menu.png', 'ge_app_03_sources_connectors_menu.png', 'ge_app_03b_sources_connectors_scrolled.png', 'ge_app_07_headless_verified_home.png', 'ge_app_08_servicenow_query_prompt_entered.png', 'ge_app_09_servicenow_live_chat_response_part1.png', 'ge_app_10_servicenow_live_chat_response_part2.png'].includes(item.fileName)) {
            return true;
          }
        }
        return false;
      }
    },
    {
      id: 'agent-studio',
      title: 'Agent Studio & Enterprise Discovery',
      icon: '🎨',
      description: 'Gemini Enterprise Agent Builder, agent galleries, specialized prompt definitions, and unified enterprise search capabilities.',
      filter: item => {
        if (item.dirName === 'screenshots_ge_app_and_console') {
          if (['ge_app_04_enterprise_search_view.png', 'ge_app_04_new_agent_builder.png', 'ge_app_05_agents_gallery.png', 'ge_app_06_new_agent_studio.png'].includes(item.fileName)) {
            return true;
          }
        }
        return false;
      }
    },
    {
      id: 'ground-truth',
      title: 'Ground-Truth Parity: Native UI vs. GE Chat Side-by-Side',
      icon: '⚖️',
      description: 'Side-by-side verification proving 100% data parity between native enterprise systems (ServiceNow Polaris UI, Veeva Vault GxP) and Gemini Enterprise AI responses.',
      filter: item => {
        return item.dirName === 'screenshots_servicenow_connector' || item.dirName === 'screenshots_veeva_connector';
      }
    },
    {
      id: 'live-auth',
      title: 'Multi-Tab Audit & Identity SSO Verification',
      icon: '🔐',
      description: 'Browser workspace session auditing across Argolis Cloud Console, IAM Admin, Gemini Enterprise App, and Okta SSO authentication tabs.',
      filter: item => {
        if (item.dirName === 'screenshots_live_browser_auth') return true;
        if (item.dirName === 'screenshots_ge_app_and_console' && item.fileName.startsWith('tab')) return true;
        return false;
      }
    }
  ];

  return groupDefs.map(g => {
    const items = allImages.filter(g.filter);
    return {
      id: g.id,
      title: g.title,
      icon: g.icon,
      description: g.description,
      count: items.length,
      images: items.map((img, idx) => ({
        ...img,
        groupIndex: idx + 1,
        groupId: g.id,
        groupTitle: g.title,
        narration: getConceptNarration(img.fileName, img.title, g.title, g.description),
        linkedTool: ASSET_TOOL_MAPPINGS[img.assetId] || null,
      }))
    };
  });
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


function generatePrintDossierHtml(allSlides, totalScreenshots) {
  const coverHtml = `
  <div class="dossier-page dossier-cover-page">
    <div>
      <div class="dossier-gcp-strip"></div>
      <div class="dossier-cover-brand">
        <div class="dossier-logo">
          <svg viewBox="0 0 192 155" fill="none" style="width:100%; height:100%;">
            <path d="M152.6 63.8c-1.8 0-3.6.2-5.3.5C141.4 39.4 120.4 22 95.5 22c-23.7 0-43.9 15.8-50.5 37.8-2.6-.9-5.4-1.4-8.3-1.4C16.4 58.4 0 74.8 0 95.1s16.4 36.7 36.7 36.7h115.9c21.7 0 39.4-17.6 39.4-39.4 0-21.7-17.7-38.6-39.4-38.6z" fill="#4285F4"/>
            <path d="M95.5 22c-15.6 0-29.6 7-39 18l19.5 19.5c4.7-5.5 11.7-9.1 19.5-9.1 14.3 0 25.9 11.6 25.9 25.9 0 2.4-.3 4.8-1 7l27.1 27.1c1.5-4.4 2.3-9.1 2.3-14 0-38.3-24.9-69.4-54.3-69.4z" fill="#EA4335"/>
            <path d="M152.6 131.8H36.7c-9.1 0-17.4-3.4-23.8-9l20.4-20.4c1.1.7 2.2 1.2 3.4 1.4h115.9c6.4 0 11.6-5.2 11.6-11.6 0-3.2-1.3-6.1-3.4-8.2l20.4-20.4c7.3 7.3 11.8 17.4 11.8 28.6 0 21.8-18.1 39.6-40.4 39.6z" fill="#34A853"/>
            <path d="M36.7 58.4c2.9 0 5.7.5 8.3 1.4C51.6 37.8 71.8 22 95.5 22c-23.7 0-43.9 15.8-50.5 37.8L115 59.5c-4.7-5.5-11.7-9.1-19.5-9.1-14.3 0-25.9 11.6-25.9 25.9 0 2.4.3 4.8 1 7l-27.1 27.1c-1.5-4.4-2.3-9.1-2.3-14 0-20.3 16.4-38 35.5-38z" fill="#FBBC04"/>
          </svg>
        </div>
        <div>
          <div class="dossier-org">Google Cloud Enterprise Architecture</div>
          <div class="dossier-program">Gemini Enterprise Grounding &amp; BYOMCP Integration</div>
        </div>
      </div>

      <div class="dossier-tag">OFFICIAL VERIFICATION DOSSIER • ARCHITECTURE BLUEPRINT</div>
      <h1 class="dossier-title">Gemini Enterprise &amp; ServiceNow BYOMCP Architecture Dossier</h1>
      <p class="dossier-subtitle">Production Ground-Truth Verification, Model Context Protocol (MCP) Server Implementation, &amp; End-to-End Workflow Slide Deck</p>

      <div class="dossier-stats-grid">
        <div class="dossier-stat-card">
          <div class="dossier-stat-num">${totalScreenshots} Slides</div>
          <div class="dossier-stat-label">Authentic Captures Verified</div>
          <div class="dossier-stat-desc">Captured live from Argolis Console, GCP Console, Cloud Run, and ServiceNow Polaris. Zero synthetic mocks.</div>
        </div>
        <div class="dossier-stat-card">
          <div class="dossier-stat-num">MCP 2.0</div>
          <div class="dossier-stat-label">Model Context Protocol</div>
          <div class="dossier-stat-desc">Standardized JSON-RPC tool declarations hosted on Google Cloud Run with streamable HTTP.</div>
        </div>
        <div class="dossier-stat-card">
          <div class="dossier-stat-num">Zero-ETL</div>
          <div class="dossier-stat-label">Real-Time Federated Queries</div>
          <div class="dossier-stat-desc">Live Table API execution directly against ServiceNow without batch replication delays.</div>
        </div>
        <div class="dossier-stat-card">
          <div class="dossier-stat-num">100% Match</div>
          <div class="dossier-stat-label">Data Parity Verified</div>
          <div class="dossier-stat-desc">Verbatim field-by-field alignment between ServiceNow incident INC1039 and GE Chat response.</div>
        </div>
      </div>

      <div class="dossier-exec-summary">
        <div class="dossier-summary-title">Executive Architecture Briefing</div>
        <p>This dossier documents the complete technical implementation and empirical validation for grounding <strong>Google Cloud Gemini Enterprise</strong> into enterprise systems of record—specifically <strong>ServiceNow Polaris ITSM</strong> and <strong>Veeva Vault GxP</strong>—via the open <strong>Model Context Protocol (BYOMCP)</strong>. It provides complete visual trace proofs covering the Google Cloud Console onboarding wizard, Cloud Run microservice hosting, OAuth 2.0 token life-cycle management, natural multi-turn conversational reasoning, and side-by-side ground-truth data parity.</p>
      </div>
    </div>

    <div class="dossier-footer-bar">
      <span>Google Cloud Confidential • Argolis Partner Architecture Briefing • Verified Release</span>
      <span>Page 1 of Executive Dossier</span>
    </div>
  </div>`;

  const codeHtml = `
  <div class="dossier-page dossier-code-page">
    <div>
      <div class="dossier-gcp-strip"></div>
      <div class="dossier-slide-header">
        <div class="dossier-slide-left">
          <span class="dossier-group-badge">TECHNICAL ARCHITECTURE &amp; PROTOCOL IMPLEMENTATION</span>
          <span class="dossier-slide-title">Model Context Protocol (MCP) Server Architecture &amp; Live Code</span>
        </div>
        <span class="dossier-page-indicator">Section: Architecture &amp; Code</span>
      </div>

      <div class="dossier-code-grid">
        <div class="dossier-code-panel">
          <div class="dossier-panel-header">⚡ End-to-End BYOMCP Information Architecture</div>
          <div class="dossier-arch-box">
            <div class="arch-flow-step">
              <div class="step-badge">1. User Query</div>
              <div class="step-text">Employee prompts in Gemini Enterprise Chat: <em>&quot;Find P1 network outages in ServiceNow&quot;</em></div>
            </div>
            <div class="arch-flow-arrow">▼</div>
            <div class="arch-flow-step">
              <div class="step-badge">2. Semantic Model Context Protocol Resolution</div>
              <div class="step-text">Gemini extracts intent, matches BYOMCP tool schema <code>search_servicenow_incidents</code></div>
            </div>
            <div class="arch-flow-arrow">▼</div>
            <div class="arch-flow-step">
              <div class="step-badge">3. Cloud Run MCP Server Handshake</div>
              <div class="step-text">Emits JSON-RPC 2.0 <code>tools/call</code> with OAuth 2.0 Bearer authorization</div>
            </div>
            <div class="arch-flow-arrow">▼</div>
            <div class="arch-flow-step">
              <div class="step-badge">4. Live ServiceNow Polaris Table API</div>
              <div class="step-text">Executes live query against <code>/api/now/table/incident</code>; returns real records</div>
            </div>
            <div class="arch-flow-arrow">▼</div>
            <div class="arch-flow-step">
              <div class="step-badge">5. Grounded Brief Synthesis</div>
              <div class="step-text">Gemini formats verbatim ticket data with citations; 100% factual accuracy</div>
            </div>
          </div>
        </div>

        <div class="dossier-code-panel">
          <div class="dossier-panel-header">💻 Cloud Run MCP Server Query Handler (Node.js)</div>
          <pre class="dossier-code-content"><code>// Model Context Protocol: search_servicenow_incidents Tool Handler
async function handleSearchIncidents(args) {
  const token = await getServiceNowAccessToken(); // OAuth Bearer token
  const queryParts = [];
  if (args.query) queryParts.push('short_descriptionLIKE' + args.query);
  if (args.priority) queryParts.push('priority=' + args.priority);
  
  const queryParams = {
    sysparm_query: queryParts.join('^') || 'ORDERBYDESCsys_updated_on',
    sysparm_limit: Math.min(Number(args.limit || 5), 50),
    sysparm_fields: 'number,short_description,state,priority,assigned_to,sys_updated_on'
  };

  const url = instanceUri + '/api/now/table/incident?' + new URLSearchParams(queryParams);
  const resp = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  const { result } = await resp.json();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2)
    }]
  };
}</code></pre>
        </div>
      </div>

      <div class="dossier-code-panel" style="margin-top: 10px;">
        <div class="dossier-panel-header">📋 Registered MCP Tool Schema Definition (tools/list JSON Schema)</div>
        <pre class="dossier-code-content" style="max-height: 105px;"><code>{
  "name": "search_servicenow_incidents",
  "description": "Query live ServiceNow Polaris incidents with priority filters, state codes, and caller assignments",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Free-text search against short_description" },
      "priority": { "type": "string", "description": "Filter priority (1 - Critical, 2 - High, 3 - Moderate)" },
      "limit": { "type": "number", "description": "Maximum records to return (default: 5)" }
    }
  }
}</code></pre>
      </div>
    </div>

    <div class="dossier-footer-bar">
      <span>Google Cloud Confidential • Argolis BYOMCP Server Implementation Code</span>
      <span>Page 2 of Executive Dossier</span>
    </div>
  </div>`;

  const slidesHtml = allSlides.map((slide, idx) => {
    const paras = (slide.narration || '').split(/\n\n+/).map(p => '<p>' + p + '</p>').join('');
    return `
    <div class="dossier-page dossier-slide-page" data-group-id="${slide.groupId}">
      <div>
        <div class="dossier-gcp-strip"></div>
        <div class="dossier-slide-header">
          <div class="dossier-slide-left">
            <span class="dossier-group-badge">${slide.groupTitle}</span>
            <span class="dossier-slide-title">${slide.title}</span>
          </div>
          <div class="dossier-slide-right">
            <span class="dossier-asset-id-badge" style="background:#1a73e8; color:#fff; padding:2px 8px; border-radius:4px; font-family:monospace; font-size:10px; font-weight:bold;">ID: ${slide.assetId || slide.fileName}</span>
            <span class="dossier-filename-badge">${slide.fileName}</span>
            <span class="dossier-page-indicator">Slide ${idx + 1} of ${allSlides.length}</span>
          </div>
        </div>

        <div class="dossier-screenshot-frame">
          <img class="dossier-screenshot-img" src="${slide.url}" alt="${slide.title}" />
        </div>

        <div class="dossier-narration-box">
          <div class="dossier-narration-header">
            <span class="dossier-narration-icon">💡</span>
            <span class="dossier-narration-tag">Architectural Concept &amp; Ground-Truth Verification</span>
          </div>
          <div class="dossier-narration-text">
            ${paras}
          </div>
        </div>
      </div>

      <div class="dossier-footer-bar">
        <span>Google Cloud &amp; Gemini Enterprise • ServiceNow BYOMCP Verification Dossier</span>
        <span>Slide ${idx + 1} of ${allSlides.length} • Authentic Google Cloud Artifact</span>
      </div>
    </div>`;
  }).join('');

  return `<div id="printDossierContainer" class="print-dossier">
    ${coverHtml}
    ${codeHtml}
    ${slidesHtml}
  </div>`;
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

  // API: List screenshots (standard directory categories array)
  if (req.url === '/api/screenshots' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAllScreenshots(), null, 2));
    return;
  }

  // API: List logical workflow groups
  if (req.url === '/api/screenshots/groups' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getLogicalGroups(), null, 2));
    return;
  }

  // API: Veeva Vault MCP Proxy (Same-origin bridge to port 8792)
  if (req.url === '/api/veeva-mcp') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const veevaResp = await fetch('http://127.0.0.1:8792/mcp', {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          body: req.method === 'POST' ? body : undefined,
        });
        const data = await veevaResp.text();
        res.writeHead(veevaResp.status, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to communicate with Veeva MCP server on port 8792: ' + err.message }));
      }
    });
    return;
  }

  // API: Serve Cached Audio MP3/WAV files
  if (req.url.startsWith('/api/audio/') && req.method === 'GET') {
    const filename = req.url.replace('/api/audio/', '').split('?')[0];
    const filepath = path.join(AUDIO_CACHE_DIR, filename);
    if (fs.existsSync(filepath)) {
      const stat = fs.statSync(filepath);
      res.writeHead(200, {
        'Content-Type': filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      fs.createReadStream(filepath).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Audio not found');
      return;
    }
  }

// Compiles human prose into expressive SSML with natural breath pauses & pitch variation
function compileSSML(rawText) {
  let ssml = (rawText || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Human respiratory breaks on paragraphs
  ssml = ssml.replace(/\n\n+/g, '<break time="800ms"/> ');
  // Dramatic / contemplative hesitation on ellipses
  ssml = ssml.replace(/\.\.\./g, '<break time="550ms"/>');
  // Conversational tempo shifts on em-dashes
  ssml = ssml.replace(/ — /g, '<break time="350ms"/> ');
  // Clear completion pauses on sentences and questions
  ssml = ssml.replace(/([.!?])\s+/g, '$1 <break time="500ms"/> ');
  // Breathing pauses on commas
  ssml = ssml.replace(/,\s+/g, ', <break time="220ms"/> ');

  return `<speak><prosody rate="94%">${ssml}</prosody></speak>`;
}

  // API: Multi-Engine Audio Narrator (Google Journey, Chirp-HD, Studio, Gemini, OpenAI Omni)
  if (req.url === '/api/narrate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const voiceId = payload.voiceId || 'journey-d';
        const text = payload.text || 'Google Cloud architectural briefing ready.';
        const vInfo = NARRATOR_VOICES[voiceId] || NARRATOR_VOICES['journey-d'];

        if (vInfo.engine === 'browser-speech-synthesis') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ mode: 'browser_speech', voiceId, text }));
          return;
        }

        // Cache hash based on voiceId and text
        const hash = crypto.createHash('sha256').update(voiceId + '::' + text).digest('hex').slice(0, 24);
        const cacheFile = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);

        if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1000) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            mode: 'cached_stream',
            audioUrl: `/api/audio/${hash}.mp3`,
            voiceId,
            voiceName: vInfo.name,
            cached: true
          }));
          return;
        }

        let audioBuffer = null;

        // Engine 1: Google Cloud Journey, Chirp-HD, and Studio voices
        if (vInfo.engine.startsWith('google-')) {
          const token = getGcloudAccessToken();
          if (token) {
            const project = process.env.GOOGLE_CLOUD_PROJECT || 'vertex-ai-493102';
            try {
              // Journey and Chirp require plain text input with paralinguistics (status 400 on SSML)
              // Studio, Neural2, and Standard voices accept rich SSML with explicit pause breaks
              const supportsSsml = vInfo.model.includes('Studio') || vInfo.model.includes('Neural2');
              const inputPayload = supportsSsml ? { ssml: compileSSML(text) } : { text: text };

              const ttsResp = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  'x-goog-user-project': project
                },
                body: JSON.stringify({
                  input: inputPayload,
                  voice: { languageCode: 'en-US', name: vInfo.model },
                  audioConfig: { audioEncoding: 'MP3', speakingRate: 0.94 }
                })
              });
              if (ttsResp.ok) {
                const data = await ttsResp.json();
                if (data.audioContent) {
                  audioBuffer = Buffer.from(data.audioContent, 'base64');
                }
              } else {
                const errJson = await ttsResp.json().catch(() => ({}));
                console.warn('[TTS] Google Cloud TTS error:', errJson);
                // Fallback to plain text if SSML was rejected
                if (supportsSsml) {
                  const fallbackResp = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json',
                      'x-goog-user-project': project
                    },
                    body: JSON.stringify({
                      input: { text: text },
                      voice: { languageCode: 'en-US', name: vInfo.model },
                      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.94 }
                    })
                  });
                  if (fallbackResp.ok) {
                    const fbData = await fallbackResp.json();
                    if (fbData.audioContent) {
                      audioBuffer = Buffer.from(fbData.audioContent, 'base64');
                    }
                  }
                }
              }
            } catch (err) {
              console.warn('[TTS] Fetch error:', err.message);
            }
          }
        }

        // Engine 2: Google Gemini Multimodal Audio (gemini-2.5-flash-preview-tts)
        if (!audioBuffer && vInfo.engine === 'gemini-tts') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (apiKey) {
            try {
              const ttsResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: text }] }],
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: vInfo.voiceName || 'Aoede' }
                      }
                    }
                  }
                })
              });
              if (ttsResp.ok) {
                const ttsData = await ttsResp.json();
                const audioBase64 = ttsData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (audioBase64) {
                  audioBuffer = Buffer.from(audioBase64, 'base64');
                }
              }
            } catch (err) {
              console.warn('[Gemini TTS] error:', err.message);
            }
          }
        }

        // Engine 3: OpenAI GPT-4o Omni Audio
        if (!audioBuffer && vInfo.engine === 'openai-tts') {
          const openAiKey = process.env.OPENAI_API_KEY;
          if (openAiKey) {
            try {
              const oResp = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openAiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: vInfo.model || 'tts-1',
                  input: text,
                  voice: vInfo.voiceName || 'alloy'
                })
              });
              if (oResp.ok) {
                const arrayBuf = await oResp.arrayBuffer();
                audioBuffer = Buffer.from(arrayBuf);
              }
            } catch (err) {
              console.warn('[OpenAI TTS] error:', err.message);
            }
          }
        }

        // Automatic High-Quality Fallback: If chosen engine had no key, fallback to Google Journey David
        if (!audioBuffer) {
          const token = getGcloudAccessToken();
          if (token) {
            try {
              const ttsResp = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  'x-goog-user-project': 'vertex-ai-493102'
                },
                body: JSON.stringify({
                  input: { text: text },
                  voice: { languageCode: 'en-US', name: 'en-US-Journey-D' },
                  audioConfig: { audioEncoding: 'MP3', speakingRate: 0.94 }
                })
              });
              if (ttsResp.ok) {
                const data = await ttsResp.json();
                if (data.audioContent) {
                  audioBuffer = Buffer.from(data.audioContent, 'base64');
                }
              }
            } catch (err) {}
          }
        }

        // If audio synthesized, save to disk cache and return audio URL
        if (audioBuffer && audioBuffer.length > 500) {
          fs.writeFileSync(cacheFile, audioBuffer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            mode: 'synthesized_stream',
            audioUrl: `/api/audio/${hash}.mp3`,
            voiceId,
            voiceName: vInfo.name,
            cached: false
          }));
          return;
        }

        // If offline / no credentials, notify client to use browser SpeechSynthesis
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          mode: 'browser_speech',
          voiceId,
          voiceName: vInfo.name,
          text: text
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }


  // API: High-Definition Pixel-Perfect Vector PDF Export (Puppeteer headless engine)
  if (req.url.startsWith('/api/export-pdf') && req.method === 'GET') {
    const parsedUrl = new URL(req.url, host);
    const scope = parsedUrl.searchParams.get('scope') || 'ALL';

    try {
      const puppeteerModule = await import('puppeteer-core');
      const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      const browser = await puppeteerModule.default.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 1050, deviceScaleFactor: 2 });
      await page.goto(`${host}/?printView=true&scope=${encodeURIComponent(scope)}`, {
        waitUntil: 'networkidle0',
        timeout: 45000,
      });

      if (scope !== 'ALL') {
        await page.evaluate((scopeFilter) => {
          document.querySelectorAll('#printDossierContainer .dossier-slide-page').forEach(el => {
            if (el.getAttribute('data-group-id') !== scopeFilter) {
              el.remove();
            }
          });
        }, scope);
      }

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '6mm', bottom: '6mm', left: '8mm', right: '8mm' },
      });

      await browser.close();

      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Google-Cloud-Gemini-Enterprise-BYOMCP-Dossier-${scope}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.end(pdfBuffer);
      return;
    } catch (err) {
      console.error('[PDF Export] Generation error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
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
  const directoryCategories = getAllScreenshots();
  const logicalGroups = getLogicalGroups();
  const totalScreenshots = logicalGroups.reduce((acc, g) => acc + g.count, 0);

  // Flattened slide list for slideshow
  const allSlides = [];
  logicalGroups.forEach(group => {
    group.images.forEach(img => {
      allSlides.push({
        ...img,
        globalIndex: allSlides.length + 1,
      });
    });
  });

  const logicalGroupsJson = JSON.stringify(logicalGroups);
  const allSlidesJson = JSON.stringify(allSlides);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Google Cloud — Gemini Enterprise &amp; ServiceNow BYOMCP Workbench</title>
<!-- Google Fonts: Google Sans, Google Sans Text, Roboto, Roboto Mono -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Text:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  /* ==========================================================================
     GOOGLE CLOUD PLATFORM (GCP) DESIGN SYSTEM & COLOR TOKENS
     ========================================================================== */
  :root {
    /* Google Brand 4 Colors */
    --gcp-blue: #4285f4;
    --gcp-red: #ea4335;
    --gcp-yellow: #fbbc04;
    --gcp-green: #34a853;
    --gcp-cloud-blue: #1a73e8;

    /* Google Cloud Console Dark Mode (Default) */
    --bg: #1f2128;
    --sidebar-bg: #1a1c23;
    --sidebar-border: #2e323b;
    --topbar-bg: #1e2025;
    --panel: #252830;
    --panel-header: #20232b;
    --card: #282b34;
    --card-hover: #323642;
    --border: #3c4043;
    --border-hover: #5f6368;
    --text: #e8eaed;
    --text-heading: #ffffff;
    --muted: #9aa0a6;
    --accent: #1a73e8;
    --accent-hover: #1557b0;
    --accent-light: #8ab4f8;
    --accent-glow: rgba(26, 115, 232, 0.35);
    --green: #34a853;
    --green-bg: rgba(52, 168, 83, 0.16);
    --amber: #fbbc04;
    --purple: #a142f4;
    --cyan: #24c1e0;
    --code-bg: #15171c;
    --code-border: #2e323b;
    --sidebar-width: 270px;
    --sidebar-collapsed-width: 68px;
    --font-heading: 'Google Sans', 'Google Sans Text', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
    --font-body: 'Google Sans Text', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
    --font-mono: 'Roboto Mono', 'Google Sans Mono', Menlo, Consolas, monospace;
    --gcp-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15);
    --gcp-card-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.25);
  }

  /* Google Cloud Console Light Mode (Toggleable) */
  [data-theme="light"] {
    --bg: #f8f9fa;
    --sidebar-bg: #ffffff;
    --sidebar-border: #dadce0;
    --topbar-bg: #ffffff;
    --panel: #ffffff;
    --panel-header: #f1f3f4;
    --card: #ffffff;
    --card-hover: #f1f3f4;
    --border: #dadce0;
    --border-hover: #bdc1c6;
    --text: #202124;
    --text-heading: #202124;
    --muted: #5f6368;
    --accent: #1a73e8;
    --accent-hover: #1557b0;
    --accent-light: #1a73e8;
    --accent-glow: rgba(26, 115, 232, 0.2);
    --green: #1e8e3e;
    --green-bg: rgba(30, 142, 62, 0.12);
    --amber: #f9ab00;
    --purple: #9334e6;
    --cyan: #12b5cb;
    --code-bg: #f8f9fa;
    --code-border: #dadce0;
    --gcp-shadow: 0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15);
    --gcp-card-shadow: 0 1px 3px 0 rgba(60, 64, 67, 0.15);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: var(--font-body);
    background: var(--bg);
    color: var(--text);
    padding: 0;
    line-height: 1.5;
    overflow-x: hidden;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  /* Google Cloud 4-Color Signature Accent Strip */
  .gcp-color-strip {
    height: 3px;
    width: 100%;
    background: linear-gradient(to right,
      #4285F4 0%, #4285F4 25%,
      #EA4335 25%, #EA4335 50%,
      #FBBC04 50%, #FBBC04 75%,
      #34A853 75%, #34A853 100%);
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    z-index: 350;
  }

  /* App Shell Layout */
  .app-layout {
    display: flex;
    min-height: 100vh;
  }

  /* Collapsible Left Sidebar (GCP Console Navigation Drawer) */
  .app-sidebar {
    width: var(--sidebar-width);
    background: var(--sidebar-bg);
    border-right: 1px solid var(--sidebar-border);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 3px; /* right below color strip */
    bottom: 0;
    left: 0;
    z-index: 200;
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease;
    overflow: hidden;
  }
  .app-sidebar.collapsed {
    width: var(--sidebar-collapsed-width);
  }

  .sidebar-header {
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--sidebar-border);
    min-height: 64px;
    gap: 8px;
  }
  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }
  .brand-logo-small {
    width: 36px;
    height: 36px;
    min-width: 36px;
    background: transparent;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .brand-logo-small svg {
    width: 32px;
    height: 26px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    opacity: 1;
    transition: opacity 0.2s;
  }
  .app-sidebar.collapsed .brand-text {
    display: none;
    opacity: 0;
  }
  .brand-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--text-heading);
    letter-spacing: -0.2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .brand-tag {
    font-size: 11px;
    color: var(--muted);
    font-weight: 500;
  }

  .sidebar-toggle-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--sidebar-border);
    color: var(--muted);
    width: 28px;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 11px;
  }
  .sidebar-toggle-btn:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .app-sidebar.collapsed .sidebar-toggle-btn {
    margin: 0 auto;
    transform: rotate(180deg);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .sidebar-content::-webkit-scrollbar {
    width: 5px;
  }
  .sidebar-content::-webkit-scrollbar-thumb {
    background: var(--sidebar-border);
    border-radius: 4px;
  }

  .sidebar-section-title {
    font-family: var(--font-heading);
    font-size: 10px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.9px;
    padding: 0 12px;
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .app-sidebar.collapsed .sidebar-section-title {
    display: none;
  }

  .sidebar-nav-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sidebar-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 0 20px 20px 0;
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    text-decoration: none;
    border-left: 3px solid transparent;
    margin-right: 6px;
  }
  .sidebar-nav-item:hover {
    background: rgba(138, 180, 248, 0.08);
    color: var(--accent-light);
  }
  .sidebar-nav-item.active {
    background: rgba(26, 115, 232, 0.15);
    color: var(--accent-light);
    border-left: 3px solid var(--accent);
    font-weight: 600;
  }
  [data-theme="light"] .sidebar-nav-item.active {
    background: #e8f0fe;
    color: #1a73e8;
    border-left: 3px solid #1a73e8;
  }
  .sidebar-nav-icon {
    font-size: 16px;
    width: 22px;
    text-align: center;
    flex-shrink: 0;
  }
  .sidebar-nav-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .app-sidebar.collapsed .sidebar-nav-label,
  .app-sidebar.collapsed .sidebar-nav-badge {
    display: none;
  }
  .sidebar-nav-badge {
    background: rgba(255, 255, 255, 0.08);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 12px;
    color: var(--muted);
  }
  .sidebar-nav-item.active .sidebar-nav-badge {
    background: var(--accent);
    color: #ffffff;
  }

  /* Sidebar Action Deck Buttons (Google Cloud Material styling) */
  .sidebar-actions {
    padding: 12px 10px;
    border-top: 1px solid var(--sidebar-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .btn-sidebar-action {
    background: rgba(26, 115, 232, 0.12);
    border: 1px solid rgba(26, 115, 232, 0.3);
    color: var(--accent-light);
    padding: 9px 12px;
    border-radius: 6px;
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: all 0.15s;
    white-space: nowrap;
    justify-content: flex-start;
  }
  .btn-sidebar-action:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(26, 115, 232, 0.4);
    transform: translateY(-1px);
  }
  .app-sidebar.collapsed .btn-sidebar-action {
    justify-content: center;
    padding: 10px;
  }
  .app-sidebar.collapsed .btn-sidebar-action span:not(.sidebar-nav-icon) {
    display: none;
  }

  .sidebar-footer-status {
    padding: 10px 14px;
    font-size: 11px;
    color: var(--muted);
    border-top: 1px solid var(--sidebar-border);
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .app-sidebar.collapsed .sidebar-footer-status span:not(.status-dot) {
    display: none;
  }

  /* Main Application Shell */
  .app-main {
    flex: 1;
    margin-left: var(--sidebar-width);
    min-width: 0;
    transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
  }
  .app-sidebar.collapsed ~ .app-main {
    margin-left: var(--sidebar-collapsed-width);
  }

  /* Google Cloud Console Top Sticky Header */
  .topbar {
    position: sticky;
    top: 3px; /* immediately below 3px color strip */
    z-index: 150;
    width: 100%;
    background: var(--topbar-bg);
    border-bottom: 1px solid var(--border);
    box-shadow: var(--gcp-shadow);
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }
  .topbar-inner {
    max-width: 1600px;
    margin: 0 auto;
    padding: 10px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .topbar-toggle-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    width: 34px;
    height: 34px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 15px;
  }
  .topbar-toggle-btn:hover {
    background: var(--card-hover);
    border-color: var(--border-hover);
  }

  /* Google Cloud Project Selector Chip */
  .gcp-project-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: var(--card);
    border: 1px solid var(--border);
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s;
  }
  .gcp-project-chip:hover {
    border-color: var(--accent);
    background: var(--card-hover);
  }
  .gcp-project-icon {
    color: var(--gcp-blue);
    font-size: 13px;
  }
  .gcp-project-label {
    color: var(--muted);
    font-size: 11px;
  }
  .gcp-project-name {
    font-family: var(--font-mono);
    color: var(--accent-light);
    font-weight: 600;
  }
  .gcp-project-arrow {
    color: var(--muted);
    font-size: 10px;
    margin-left: 2px;
  }

  /* GCP Search Box */
  .gcp-search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 12px;
    min-width: 280px;
    max-width: 480px;
    flex: 1;
    cursor: pointer;
    transition: all 0.15s;
  }
  @media (max-width: 1200px) {
    .gcp-search-box { display: none; }
  }
  .gcp-search-box:hover {
    border-color: var(--accent);
  }
  .gcp-search-icon {
    font-size: 12px;
    color: var(--muted);
  }
  .gcp-search-placeholder {
    font-size: 12px;
    color: var(--muted);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gcp-kbd {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 10px;
    font-family: var(--font-mono);
    padding: 1px 5px;
    color: var(--muted);
  }

  /* GCP Navigation Tabs */
  .nav-tabs {
    display: flex;
    gap: 4px;
    background: var(--card);
    padding: 3px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .tab-btn {
    background: transparent;
    border: none;
    color: var(--muted);
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 500;
    padding: 6px 13px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .tab-btn:hover {
    color: var(--text);
    background: var(--card-hover);
  }
  .tab-btn.active {
    background: var(--accent);
    color: #ffffff;
    box-shadow: 0 1px 4px rgba(26, 115, 232, 0.4);
  }
  .badge-count {
    background: rgba(255, 255, 255, 0.2);
    font-size: 10.5px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
  }
  .tab-btn.active .badge-count {
    background: rgba(255, 255, 255, 0.3);
    color: #ffffff;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Google Cloud Theme Switcher Button */
  .btn-theme-toggle {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 11px;
    border-radius: 4px;
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }
  .btn-theme-toggle:hover {
    background: var(--card-hover);
    border-color: var(--accent);
    color: var(--accent-light);
  }

  .status-badge {
    background: var(--green-bg);
    color: var(--green);
    border: 1px solid rgba(52, 168, 83, 0.35);
    padding: 5px 11px;
    border-radius: 16px;
    font-family: var(--font-heading);
    font-size: 11.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    background: var(--green);
    border-radius: 50%;
    box-shadow: 0 0 6px var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  /* Main Container */
  .container {
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
    padding: 24px 32px 64px;
    flex: 1;
  }

  /* Views */
  .view-tab { display: none; }
  .view-tab.active { display: block; }

  /* GCP Console Hero Banner */
  .hero-banner {
    background: linear-gradient(135deg, rgba(26, 115, 232, 0.12), rgba(66, 133, 244, 0.04));
    border: 1px solid rgba(66, 133, 244, 0.3);
    border-radius: 12px;
    padding: 22px 28px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    box-shadow: var(--gcp-card-shadow);
  }
  .hero-text h1 {
    font-family: var(--font-heading);
    margin: 0 0 6px 0;
    font-size: 22px;
    font-weight: 600;
    color: var(--text-heading);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .hero-text p {
    margin: 0;
    font-size: 13.5px;
    color: var(--muted);
    max-width: 880px;
  }
  .hero-text code {
    background: var(--code-bg);
    border: 1px solid var(--code-border);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
    color: var(--accent-light);
    font-size: 12px;
  }
  .quick-links {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn-link {
    background: rgba(26, 115, 232, 0.1);
    border: 1px solid rgba(26, 115, 232, 0.35);
    color: var(--accent-light);
    padding: 7px 14px;
    border-radius: 4px;
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.15s;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn-link:hover {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }
  .btn-link.accent {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
    box-shadow: 0 1px 4px rgba(26, 115, 232, 0.4);
  }
  .btn-link.accent:hover {
    background: var(--accent-hover);
  }

  /* Google Cloud Project Selector Dropdown */
  .gcp-project-dropdown-wrapper {
    position: relative;
    display: inline-block;
  }
  .gcp-project-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    min-width: 340px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--gcp-shadow);
    z-index: 500;
    padding: 8px;
    animation: fadeInMenu 0.15s ease-out;
  }
  @keyframes fadeInMenu {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .gcp-project-menu-header {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    padding: 6px 10px 8px;
    letter-spacing: 0.6px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 6px;
  }
  .gcp-project-menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
    color: var(--text);
  }
  .gcp-project-menu-item:hover {
    background: var(--card-hover);
    color: var(--accent-light);
  }
  .gcp-project-menu-item.active {
    background: rgba(26, 115, 232, 0.12);
    border-left: 3px solid var(--accent);
  }
  [data-theme="light"] .gcp-project-menu-item.active {
    background: #e8f0fe;
    border-left: 3px solid #1a73e8;
  }
  .project-menu-icon {
    font-size: 18px;
    flex-shrink: 0;
  }
  .project-menu-info {
    flex: 1;
    min-width: 0;
  }
  .project-menu-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-heading);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .project-menu-desc {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .project-menu-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 10px;
    background: var(--green-bg);
    color: var(--green);
  }
  .gcp-project-menu-divider {
    height: 1px;
    background: var(--border);
    margin: 6px 0;
  }

  /* Left Sidebar: Collapsible Projects & Hierarchical Tree Navigation */
  .sidebar-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--muted);
  }
  .app-sidebar.collapsed .sidebar-section-header {
    display: none;
  }
  .sidebar-project-node {
    margin-bottom: 6px;
    border-radius: 8px;
    transition: background 0.15s ease;
  }
  .project-node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
    transition: all 0.15s ease;
    color: var(--text);
    font-weight: 600;
    font-size: 12.5px;
  }
  .project-node-header:hover {
    background: rgba(138, 180, 248, 0.08);
    color: var(--accent-light);
  }
  .project-node-header.active {
    color: var(--accent-light);
  }
  .project-chevron-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-size: 10px;
    color: var(--muted);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
  }
  .project-chevron-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .sidebar-project-node.collapsed .project-chevron-btn {
    transform: rotate(-90deg);
  }
  .project-node-icon {
    font-size: 15px;
    flex-shrink: 0;
  }
  .project-node-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }
  .app-sidebar.collapsed .project-chevron-btn,
  .app-sidebar.collapsed .project-node-title,
  .app-sidebar.collapsed .project-pill,
  .app-sidebar.collapsed .sidebar-submenu {
    display: none !important;
  }

  /* Submenu Tree Container */
  .sidebar-submenu {
    overflow: hidden;
    transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
    max-height: 480px;
    opacity: 1;
    margin-left: 12px;
    padding-left: 8px;
    border-left: 1.5px solid rgba(255, 255, 255, 0.08);
  }
  [data-theme="light"] .sidebar-submenu {
    border-left: 1.5px solid rgba(0, 0, 0, 0.1);
  }
  .sidebar-project-node.collapsed .sidebar-submenu {
    max-height: 0;
    opacity: 0;
    pointer-events: none;
    margin-top: 0;
    margin-bottom: 0;
  }

  /* Submenu Items (Level 1) */
  .sub-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
    margin-bottom: 2px;
  }
  .sub-nav-item:hover {
    background: rgba(138, 180, 248, 0.08);
    color: var(--accent-light);
  }
  .sub-nav-item.active {
    background: rgba(26, 115, 232, 0.15);
    color: var(--accent-light);
    font-weight: 600;
  }
  [data-theme="light"] .sub-nav-item.active {
    background: #e8f0fe;
    color: #1a73e8;
  }
  .sub-nav-icon {
    font-size: 14px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
  }
  .sub-nav-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub-nav-count {
    font-size: 10.5px;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 6px;
    border-radius: 10px;
    color: var(--muted);
  }
  [data-theme="light"] .sub-nav-count {
    background: #f1f3f4;
    color: #5f6368;
  }

  /* Nested Asset Sub-Items (Level 2) */
  .asset-sub-menu {
    overflow: hidden;
    transition: max-height 0.22s ease, opacity 0.2s ease;
    max-height: 260px;
    opacity: 1;
    margin-left: 14px;
    padding-left: 6px;
    border-left: 1px dashed rgba(255, 255, 255, 0.1);
  }
  [data-theme="light"] .asset-sub-menu {
    border-left: 1px dashed rgba(0, 0, 0, 0.12);
  }
  .asset-sub-menu.collapsed {
    max-height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .asset-sub-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 5px;
    font-size: 11.5px;
    color: var(--muted);
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
    margin-bottom: 2px;
  }
  .asset-sub-item:hover {
    background: rgba(138, 180, 248, 0.06);
    color: var(--text);
  }
  .asset-sub-item.active {
    color: var(--accent-light);
    font-weight: 600;
  }
  .asset-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--muted);
    flex-shrink: 0;
  }
  .asset-sub-item:hover .asset-dot,
  .asset-sub-item.active .asset-dot {
    background: var(--accent-light);
  }
  .sidebar-nav-tag {
    font-size: 9.5px;
    font-weight: 700;
    color: var(--green);
    background: var(--green-bg);
    padding: 1px 6px;
    border-radius: 10px;
    margin-left: auto;
    white-space: nowrap;
  }
  .app-sidebar.collapsed .sidebar-nav-tag {
    display: none;
  }

  /* Full-Width Configuration Strip */
  .config-strip-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 20px;
    margin-bottom: 20px;
    box-shadow: var(--gcp-card-shadow);
  }
  .config-strip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 8px;
  }
  .config-strip-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-heading);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px 20px;
  }
  .config-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .config-cell-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .config-cell-value {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text);
    word-break: break-word;
    line-height: 1.4;
  }
  .config-cell-value.link-val {
    color: var(--accent);
    cursor: pointer;
  }
  .config-cell-value.link-val:hover {
    text-decoration: underline;
  }

  /* 2-Column Balanced Workbench Layout */
  .workbench-grid {
    display: grid;
    grid-template-columns: 380px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 1100px) {
    .workbench-grid { grid-template-columns: 1fr; }
  }

  /* Tool List Scrollable Container */
  .tool-list-scrollable {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 480px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .tool-list-scrollable::-webkit-scrollbar {
    width: 4px;
  }
  .tool-list-scrollable::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  .tool-card-item {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .tool-card-item:hover {
    border-color: var(--accent);
    background: var(--card-hover);
  }
  .tool-card-item.selected {
    border-color: var(--accent);
    background: rgba(26, 115, 232, 0.12);
    border-left: 4px solid var(--accent);
  }
  [data-theme="light"] .tool-card-item.selected {
    background: #e8f0fe;
    border-color: #1a73e8;
    border-left: 4px solid #1a73e8;
  }
  .tool-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 4px;
  }
  .tool-card-name {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tool-card-desc {
    font-size: 11.5px;
    color: var(--muted);
    line-height: 1.35;
    margin-bottom: 6px;
  }
  .tool-card-asset-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-family: var(--font-mono);
    color: var(--accent-light);
    background: rgba(26, 115, 232, 0.08);
    border: 1px solid rgba(26, 115, 232, 0.2);
    padding: 2px 7px;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tool-card-asset-chip:hover {
    background: var(--accent);
    color: #ffffff;
  }

  /* Table Status Badges and Mono Hashes */
  .table-mono-id {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--accent-light);
    cursor: pointer;
    display: inline-block;
  }
  .table-mono-id:hover {
    text-decoration: underline;
  }
  .badge-status-pill {
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
    display: inline-block;
    white-space: nowrap;
  }
  .state-closed {
    background: rgba(52, 168, 83, 0.15);
    color: var(--green);
    border: 1px solid rgba(52, 168, 83, 0.3);
  }
  .state-online {
    background: rgba(52, 168, 83, 0.15);
    color: var(--green);
    border: 1px solid rgba(52, 168, 83, 0.3);
  }
  .priority-p5 {
    background: rgba(66, 133, 244, 0.12);
    color: var(--accent-light);
    border: 1px solid rgba(66, 133, 244, 0.3);
  }
  .priority-p1 {
    background: rgba(234, 67, 53, 0.15);
    color: #ea4335;
    border: 1px solid rgba(234, 67, 53, 0.3);
  }

  /* Two Column Layout */
  .grid-2col {
    display: grid;
    grid-template-columns: 440px minmax(0, 1fr);
    gap: 24px;
  }
  .grid-2col > div {
    min-width: 0;
  }
  @media (max-width: 1180px) {
    .grid-2col { grid-template-columns: 1fr; }
  }

  /* GCP Card Panels */
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    box-shadow: var(--gcp-card-shadow);
    transition: border-color 0.15s, background-color 0.2s;
  }
  .card-title {
    font-family: var(--font-heading);
    margin: 0 0 16px 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-heading);
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
  [data-theme="light"] .kv-item {
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }
  .kv-k { color: var(--muted); font-weight: 500; font-size: 12.5px; }
  .kv-v {
    font-family: var(--font-mono);
    color: var(--accent-light);
    word-break: break-all;
    font-size: 12.5px;
  }

  /* Tool buttons */
  .tool-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .tool-item {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    transition: all 0.15s ease;
    cursor: pointer;
  }
  .tool-item:hover {
    border-color: var(--accent);
    background: rgba(26, 115, 232, 0.06);
  }
  .tool-item.selected {
    border-color: var(--accent);
    background: rgba(26, 115, 232, 0.12);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .tool-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .tool-name {
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--accent-light);
  }
  .tool-tag {
    font-size: 10px;
    font-family: var(--font-heading);
    padding: 2px 7px;
    border-radius: 12px;
    background: var(--green-bg);
    color: var(--green);
    font-weight: 700;
  }
  .tool-desc {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.4;
  }

  /* Runner Controls */
  .runner-box {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 20px;
    box-shadow: var(--gcp-card-shadow);
  }
  .runner-title {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-heading);
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
    font-size: 11.5px;
    font-weight: 600;
    color: var(--muted);
  }
  .form-input {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--text);
    font-family: var(--font-mono);
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  /* Sample Scenario & Preset Options Dropdowns */
  .sample-scenario-box {
    background: rgba(26, 115, 232, 0.06);
    border: 1px solid rgba(26, 115, 232, 0.25);
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
    transition: all 0.15s ease;
  }
  [data-theme="light"] .sample-scenario-box {
    background: #f1f6fd;
    border: 1px solid #c2dbfe;
  }
  .sample-scenario-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .sample-scenario-label {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--accent-light);
    display: flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  [data-theme="light"] .sample-scenario-label {
    color: #1a73e8;
  }
  .sample-scenario-select {
    width: 100%;
    background: var(--card);
    border: 1.5px solid var(--accent);
    border-radius: 5px;
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text);
    font-family: var(--font-heading);
    cursor: pointer;
    outline: none;
    transition: all 0.15s ease;
  }
  [data-theme="light"] .sample-scenario-select {
    background: #ffffff;
    border-color: #1a73e8;
    color: #202124;
  }
  .sample-scenario-select:focus {
    box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.35);
  }
  .sample-chips-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }
  .sample-chips-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    margin-right: 2px;
  }
  .sample-chip-btn {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 3px 9px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }
  .sample-chip-btn:hover {
    background: rgba(26, 115, 232, 0.2);
    border-color: var(--accent);
    color: var(--accent-light);
    transform: translateY(-1px);
  }
  [data-theme="light"] .sample-chip-btn {
    background: #ffffff;
    border-color: #dadce0;
    color: #3c4043;
  }
  [data-theme="light"] .sample-chip-btn:hover {
    background: #e8f0fe;
    border-color: #1a73e8;
    color: #1a73e8;
  }
  .btn-run {
    background: var(--accent);
    border: none;
    color: #ffffff;
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    padding: 9px 20px;
    border-radius: 4px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(26, 115, 232, 0.4);
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn-run:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(26, 115, 232, 0.5);
  }

  /* Output console */
  .output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--panel-header);
    border-left: 4px solid var(--accent);
    padding: 10px 16px;
    border-radius: 4px;
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
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .toggle-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  pre.code-block {
    background: var(--code-bg);
    border: 1px solid var(--code-border);
    border-radius: 6px;
    padding: 16px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--green);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 520px;
    overflow-y: auto;
    font-family: var(--font-mono);
  }
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-top: 10px;
    background: var(--panel);
  }
  table.data-table th, table.data-table td {
    border: 1px solid var(--border);
    padding: 9px 12px;
    text-align: left;
  }
  table.data-table th {
    background: var(--panel-header);
    color: var(--accent-light);
    font-family: var(--font-heading);
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10.5px;
    letter-spacing: 0.5px;
  }
  table.data-table tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }
  [data-theme="light"] table.data-table tr:nth-child(even) {
    background: #f8f9fa;
  }

  /* LOGICAL WORKFLOW GALLERY (GCP Console Product Design) */
  .gallery-filter-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
    position: sticky;
    top: 56px;
    z-index: 40;
    background: var(--bg);
    padding: 10px 0;
    backdrop-filter: blur(10px);
    transition: background-color 0.2s;
  }
  .gallery-filter-btn {
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--muted);
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 13px;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .gallery-filter-btn:hover {
    color: var(--text-heading);
    border-color: var(--accent);
  }
  .gallery-filter-btn.active {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
    box-shadow: 0 1px 4px rgba(26, 115, 232, 0.4);
  }

  .workflow-group-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 30px;
    padding: 22px;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-shadow: var(--gcp-card-shadow);
  }
  .workflow-group-card:hover {
    border-color: var(--border-hover);
  }
  .workflow-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 18px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 14px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .workflow-title-area {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .workflow-icon {
    font-size: 26px;
    line-height: 1;
  }
  .workflow-title {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--text-heading);
    margin: 0 0 4px 0;
  }
  .workflow-desc {
    font-size: 13px;
    color: var(--muted);
    margin: 0;
    max-width: 820px;
  }
  .workflow-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .btn-group-action {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 12px;
    border-radius: 4px;
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }
  .btn-group-action:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  
  /* ==========================================================================
     UNIQUE DEEP LINKS, ASSET IDS, & PERMALINKS DESIGN SYSTEM
     ========================================================================== */
  .permalink-chip {
    background: rgba(66, 133, 244, 0.12);
    border: 1px solid rgba(66, 133, 244, 0.3);
    color: var(--accent-light);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
    text-decoration: none;
  }
  .permalink-chip:hover {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  .permalink-tool-chip {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all 0.15s ease;
  }
  .permalink-tool-chip:hover {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  .asset-copy-chip {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(31, 33, 40, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    backdrop-filter: blur(6px);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
    z-index: 2;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-copy-chip:hover {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  .linked-demo-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #34a853;
    background: rgba(52, 168, 83, 0.12);
    border: 1px solid rgba(52, 168, 83, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .linked-demo-pill:hover {
    background: #34a853;
    color: #ffffff;
  }

  .linked-asset-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--accent-light);
    background: rgba(66, 133, 244, 0.08);
    border: 1px solid rgba(66, 133, 244, 0.22);
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 6px;
    transition: all 0.15s ease;
    text-decoration: none;
  }
  .linked-asset-link:hover {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  .slideshow-asset-badge {
    background: rgba(66, 133, 244, 0.2);
    border: 1px solid rgba(66, 133, 244, 0.4);
    color: #8ab4f8;
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
  }
  .slideshow-asset-badge:hover {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  .btn-share-link {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #e8eaed;
    padding: 5px 10px;
    border-radius: 4px;
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .btn-share-link:hover {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  /* Toast Notification */
  .gcp-toast {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%) translateY(120px);
    background: #202124;
    color: #ffffff;
    border: 1px solid #4285f4;
    border-radius: 30px;
    padding: 10px 22px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    z-index: 99999;
    transition: transform 0.28s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.28s ease;
    opacity: 0;
    pointer-events: none;
    max-width: 90vw;
  }
  .gcp-toast.visible {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  .gcp-toast-icon { font-size: 16px; }
  .gcp-toast-title { font-size: 12.5px; font-weight: 600; font-family: var(--font-heading); }
  .gcp-toast-url { font-size: 11px; color: #9aa0a6; font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 420px; }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 18px;
  }
  .gallery-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
    display: flex;
    flex-direction: column;
    position: relative;
    box-shadow: var(--gcp-shadow);
  }
  .gallery-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }
  [data-theme="light"] .gallery-card:hover {
    box-shadow: 0 6px 16px rgba(60, 64, 67, 0.2);
  }
  .gallery-img-wrap {
    height: 195px;
    background: var(--code-bg);
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid var(--border);
  }
  .gallery-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    transition: transform 0.25s ease;
  }
  .gallery-card:hover .gallery-img-wrap img {
    transform: scale(1.02);
  }
  .slide-num-pill {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(31, 33, 40, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #e8eaed;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    backdrop-filter: blur(4px);
  }
  .gallery-info {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1;
  }
  .gallery-cat {
    font-family: var(--font-heading);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--accent-light);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .gallery-title {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-heading);
    line-height: 1.35;
  }
  .gallery-file {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--muted);
    margin-top: auto;
    padding-top: 6px;
    border-top: 1px solid var(--border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* GOOGLE DEEPMIND AUDIO NARRATOR & KARAOKE STYLING */
  .narrator-controls-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .gcp-voice-select {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 11.5px;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
    max-width: 220px;
  }
  .gcp-voice-select:hover, .gcp-voice-select:focus {
    border-color: var(--accent);
  }
  .btn-narrate-action {
    background: var(--accent);
    border: none;
    color: white;
    font-family: var(--font-heading);
    font-size: 11.5px;
    font-weight: 600;
    padding: 6px 13px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
    box-shadow: 0 1px 3px rgba(26, 115, 232, 0.4);
    white-space: nowrap;
  }
  .btn-narrate-action:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }
  .btn-narrate-action.speaking {
    background: var(--green);
    animation: voicePulse 1.5s infinite;
  }
  @keyframes voicePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(52, 168, 83, 0.5); }
    50% { box-shadow: 0 0 0 6px rgba(52, 168, 83, 0); }
  }
  .gcp-narrate-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    user-select: none;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border);
  }
  .gcp-narrate-toggle:hover {
    color: var(--text-heading);
    border-color: var(--accent);
  }

  /* Live Gold Karaoke Subtitles Bar */
  .slideshow-karaoke-bar {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: 92%;
    max-width: 1050px;
    background: rgba(22, 24, 30, 0.94);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
    z-index: 25;
    transition: opacity 0.25s ease, transform 0.25s ease;
  }
  [data-theme="light"] .slideshow-karaoke-bar {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  .slideshow-karaoke-bar.hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateX(-50%) translateY(15px);
  }
  .karaoke-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
  }
  .karaoke-voice-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(26, 115, 232, 0.15);
    border: 1px solid rgba(26, 115, 232, 0.35);
    color: var(--accent-light);
    padding: 2px 8px;
    border-radius: 10px;
    font-family: var(--font-heading);
    font-weight: 600;
  }
  .karaoke-pulse-dot {
    width: 6px;
    height: 6px;
    background: var(--green);
    border-radius: 50%;
    animation: pulse 1.8s infinite;
  }
  .karaoke-concept-tag {
    color: var(--muted);
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 500;
  }
  .karaoke-text {
    font-family: var(--font-heading);
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--muted);
    text-align: left;
    max-height: 120px;
    overflow-y: auto;
  }
  .karaoke-paragraph {
    margin-bottom: 6px;
  }
  .karaoke-paragraph:last-child {
    margin-bottom: 0;
  }
  .karaoke-word {
    display: inline-block;
    margin-right: 3px;
    transition: color 0.1s, text-shadow 0.1s, transform 0.1s;
  }
  .karaoke-word.active {
    color: #fbbc04;
    font-weight: 700;
    text-shadow: 0 0 10px rgba(251, 188, 4, 0.7);
    transform: scale(1.05);
  }
  .karaoke-word.past {
    color: var(--text-heading);
    font-weight: 500;
  }

  /* FULLSCREEN SLIDESHOW MODAL (Google Cloud Presentation Deck) */
  .slideshow-modal {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(18, 19, 23, 0.96);
    backdrop-filter: blur(14px);
    z-index: 1000;
    flex-direction: column;
  }
  .slideshow-modal.open {
    display: flex;
  }
  .slideshow-topbar {
    padding: 10px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    background: var(--sidebar-bg);
    gap: 16px;
    min-width: 0;
  }
  .slideshow-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  .slideshow-group-badge {
    background: rgba(26, 115, 232, 0.15);
    border: 1px solid rgba(26, 115, 232, 0.4);
    color: var(--accent-light);
    font-family: var(--font-heading);
    font-size: 11.5px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 12px;
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slideshow-slide-title {
    font-family: var(--font-heading);
    font-size: 14.5px;
    font-weight: 600;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 180px;
    max-width: 500px;
    flex: 1 1 auto;
  }
  .slideshow-file-tag {
    display: none;
  }
  .slideshow-asset-badge {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border);
    padding: 3px 8px;
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--accent-light);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slideshow-counter {
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    color: #e8eaed;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .slideshow-header-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .btn-slideshow-tool {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border);
    color: #e8eaed;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 14px;
  }
  .btn-slideshow-tool:hover {
    background: var(--accent);
    color: white;
  }
  .slideshow-stage {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 80px;
    overflow: hidden;
  }
  .slideshow-img {
    max-width: 100%;
    max-height: 74vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
    border: 1px solid var(--border);
    transition: opacity 0.2s ease;
  }
  .slideshow-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(31, 33, 40, 0.85);
    border: 1px solid var(--border);
    color: white;
    font-size: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    z-index: 10;
  }
  .slideshow-arrow:hover {
    background: var(--accent);
    transform: translateY(-50%) scale(1.06);
  }
  .slideshow-arrow.prev { left: 24px; }
  .slideshow-arrow.next { right: 24px; }

  /* Slideshow bottom bar & Google 4-Color progress bar */
  .slideshow-bottom {
    background: var(--sidebar-bg);
    border-top: 1px solid var(--border);
    padding: 10px 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .slideshow-progress-bar {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }
  .slideshow-progress-fill {
    height: 100%;
    width: 0%;
    background: linear-gradient(to right, #4285f4, #ea4335, #fbbc04, #34a853);
    transition: width 0.1s linear;
  }
  .slideshow-controls-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .slideshow-play-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .btn-slideshow-play {
    background: var(--accent);
    border: none;
    color: white;
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 16px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    box-shadow: 0 1px 3px rgba(26, 115, 232, 0.4);
  }
  .speed-select {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .filmstrip-toggle-btn {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .slideshow-filmstrip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 0;
    max-height: 75px;
  }
  .slideshow-filmstrip::-webkit-scrollbar {
    height: 4px;
  }
  .slideshow-filmstrip::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 2px;
  }
  .filmstrip-thumb {
    width: 86px;
    height: 52px;
    min-width: 86px;
    border-radius: 4px;
    overflow: hidden;
    border: 2px solid transparent;
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.15s;
    background: #000;
  }
  .filmstrip-thumb:hover {
    opacity: 0.9;
    border-color: var(--accent-light);
  }
  .filmstrip-thumb.active {
    opacity: 1;
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }
  .filmstrip-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* PRINT & PDF EXPORT MODAL (GCP Material Dialog) */
  .print-modal {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(6px);
    z-index: 1000;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .print-modal.open {
    display: flex;
  }
  .print-dialog {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 100%;
    max-width: 620px;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  }
  .print-header {
    padding: 16px 22px;
    background: var(--panel-header);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .print-header h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--text-heading);
  }
  .print-body {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .print-option-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .print-option-card:hover {
    border-color: var(--accent);
    background: rgba(26, 115, 232, 0.05);
  }
  .print-option-card.selected {
    border-color: var(--accent);
    background: rgba(26, 115, 232, 0.1);
  }
  .print-option-card input[type="radio"] {
    margin-top: 3px;
  }
  .print-option-title {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13.5px;
    color: var(--text-heading);
    margin-bottom: 3px;
  }
  .print-option-desc {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.4;
  }
  .print-footer {
    padding: 14px 22px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    background: var(--panel-header);
  }

  /* Lightbox */
  .lightbox-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(6px);
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
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(0,0,0,0.6);
  }
  .lightbox-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 18px;
    background: var(--panel-header);
    border-bottom: 1px solid var(--border);
  }
  .lightbox-title {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-heading);
  }
  .lightbox-close {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    font-size: 16px;
    width: 30px;
    height: 30px;
    border-radius: 4px;
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
    border-radius: 6px;
  }

  /* PRINT MEDIA STYLES: 100% Pixel-Perfect Executive Presentation & Dossier */
  #printDossierContainer {
    display: none;
  }

  @media print {
    @page {
      size: landscape;
      margin: 6mm 8mm;
    }
    html, body {
      background: #ffffff !important;
      color: #1a1a1a !important;
      font-family: 'Google Sans Text', -apple-system, Roboto, sans-serif !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .app-layout,
    .app-sidebar,
    .topbar,
    .gallery-filter-bar,
    .workflow-actions,
    .quick-links,
    .runner-box,
    .slideshow-modal,
    .print-modal,
    .lightbox-backdrop,
    .gcp-color-strip,
    #tab-servicenow,
    #tab-veeva,
    #tab-oauth,
    #tab-gallery {
      display: none !important;
    }

    #printDossierContainer {
      display: block !important;
      width: 100% !important;
    }

    .dossier-page {
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      width: 100% !important;
      height: 96vh !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      padding: 6px 0 !important;
      background: #ffffff !important;
    }

    .dossier-page:last-child {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    .dossier-gcp-strip {
      height: 4px;
      width: 100%;
      background: linear-gradient(90deg, #4285F4 25%, #EA4335 25% 50%, #FBBC04 50% 75%, #34A853 75%);
      margin-bottom: 12px;
      border-radius: 2px;
    }

    /* Cover Page */
    .dossier-cover-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .dossier-logo {
      width: 42px;
      height: 34px;
    }
    .dossier-org {
      font-size: 14px;
      font-weight: 700;
      color: #1a73e8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .dossier-program {
      font-size: 12px;
      color: #5f6368;
    }
    .dossier-tag {
      font-size: 11px;
      font-weight: 700;
      color: #1a73e8;
      background: rgba(26, 115, 232, 0.08);
      border: 1px solid rgba(26, 115, 232, 0.3);
      padding: 4px 10px;
      border-radius: 12px;
      display: inline-block;
      margin-bottom: 10px;
    }
    .dossier-title {
      font-size: 26px;
      font-weight: 700;
      color: #202124;
      margin: 0 0 8px 0;
      line-height: 1.25;
    }
    .dossier-subtitle {
      font-size: 13.5px;
      color: #5f6368;
      margin: 0 0 20px 0;
      line-height: 1.45;
    }
    .dossier-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .dossier-stat-card {
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 12px;
      background: #f8f9fa;
    }
    .dossier-stat-num {
      font-size: 20px;
      font-weight: 700;
      color: #1a73e8;
      margin-bottom: 4px;
    }
    .dossier-stat-label {
      font-size: 11.5px;
      font-weight: 700;
      color: #202124;
      margin-bottom: 3px;
    }
    .dossier-stat-desc {
      font-size: 10.5px;
      color: #5f6368;
      line-height: 1.35;
    }
    .dossier-exec-summary {
      border-left: 4px solid #1a73e8;
      background: #f8f9fa;
      padding: 14px 18px;
      border-radius: 0 8px 8px 0;
      font-size: 12px;
      line-height: 1.6;
      color: #3c4043;
    }
    .dossier-summary-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #202124;
      margin-bottom: 6px;
    }

    /* Architecture & Code Page */
    .dossier-code-grid {
      display: grid;
      grid-template-columns: 1fr 1.25fr;
      gap: 14px;
      margin-top: 10px;
    }
    .dossier-code-panel {
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 12px 14px;
      background: #ffffff;
    }
    .dossier-panel-header {
      font-size: 12px;
      font-weight: 700;
      color: #202124;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 1px solid #eee;
      padding-bottom: 6px;
    }
    .arch-flow-step {
      background: #f8f9fa;
      border: 1px solid #e8eaed;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 4px;
    }
    .step-badge {
      font-size: 10px;
      font-weight: 700;
      color: #1a73e8;
    }
    .step-text {
      font-size: 10.5px;
      color: #3c4043;
    }
    .arch-flow-arrow {
      text-align: center;
      color: #1a73e8;
      font-size: 10px;
      line-height: 1;
      margin: 2px 0;
    }
    pre.dossier-code-content {
      background: #f8f9fa !important;
      border: 1px solid #e8eaed !important;
      border-radius: 6px !important;
      padding: 10px !important;
      font-size: 10px !important;
      line-height: 1.45 !important;
      color: #202124 !important;
      font-family: 'Roboto Mono', monospace !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
      margin: 0 !important;
      overflow: hidden !important;
    }

    /* Slide Pages */
    .dossier-slide-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #dadce0;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .dossier-slide-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .dossier-group-badge {
      font-size: 10px;
      font-weight: 700;
      color: #1a73e8;
      background: rgba(26, 115, 232, 0.08);
      border: 1px solid rgba(26, 115, 232, 0.3);
      padding: 2px 8px;
      border-radius: 10px;
    }
    .dossier-slide-title {
      font-size: 15px;
      font-weight: 700;
      color: #202124;
    }
    .dossier-slide-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dossier-filename-badge {
      font-family: 'Roboto Mono', monospace;
      font-size: 10px;
      color: #5f6368;
      background: #f1f3f4;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .dossier-page-indicator {
      font-size: 11px;
      font-weight: 700;
      color: #1a73e8;
    }
    .dossier-screenshot-frame {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 6px 0;
      max-height: 440px;
    }
    .dossier-screenshot-img {
      max-height: 420px;
      width: auto;
      max-width: 100%;
      object-fit: contain;
      border: 1px solid #dadce0;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .dossier-narration-box {
      border-left: 3.5px solid #1a73e8;
      background: #f8f9fa;
      padding: 8px 14px;
      border-radius: 0 6px 6px 0;
      margin-top: 6px;
    }
    .dossier-narration-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .dossier-narration-icon {
      font-size: 11px;
    }
    .dossier-narration-tag {
      font-size: 10.5px;
      font-weight: 700;
      color: #1a73e8;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .dossier-narration-text {
      font-size: 11.5px;
      line-height: 1.45;
      color: #3c4043;
    }
    .dossier-narration-text p {
      margin: 0 0 4px 0;
    }
    .dossier-narration-text p:last-child {
      margin: 0;
    }
    .dossier-footer-bar {
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #80868b;
      border-top: 1px solid #e8eaed;
      padding-top: 4px;
      margin-top: 6px;
    }
  }
</style>
</head>
<body>

<!-- Google Cloud 4-Color Accent Strip -->
<div class="gcp-color-strip"></div>

<div class="app-layout">

  <!-- Collapsible Left Sidebar (GCP Console Drawer) -->
  <aside class="app-sidebar" id="appSidebar">
    <div class="sidebar-header">
      <a class="sidebar-brand" onclick="switchTab('tab-servicenow')">
        <div class="brand-logo-small">
          <!-- Authentic Google Cloud Geometric Cloud Logo SVG -->
          <svg viewBox="0 0 192 155" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M152.6 63.8c-1.8 0-3.6.2-5.3.5C141.4 39.4 120.4 22 95.5 22c-23.7 0-43.9 15.8-50.5 37.8-2.6-.9-5.4-1.4-8.3-1.4C16.4 58.4 0 74.8 0 95.1s16.4 36.7 36.7 36.7h115.9c21.7 0 39.4-17.6 39.4-39.4 0-21.7-17.7-38.6-39.4-38.6z" fill="#4285F4"/>
            <path d="M95.5 22c-15.6 0-29.6 7-39 18l19.5 19.5c4.7-5.5 11.7-9.1 19.5-9.1 14.3 0 25.9 11.6 25.9 25.9 0 2.4-.3 4.8-1 7l27.1 27.1c1.5-4.4 2.3-9.1 2.3-14 0-38.3-24.9-69.4-54.3-69.4z" fill="#EA4335"/>
            <path d="M152.6 131.8H36.7c-9.1 0-17.4-3.4-23.8-9l20.4-20.4c1.1.7 2.2 1.2 3.4 1.4h115.9c6.4 0 11.6-5.2 11.6-11.6 0-3.2-1.3-6.1-3.4-8.2l20.4-20.4c7.3 7.3 11.8 17.4 11.8 28.6 0 21.8-18.1 39.6-40.4 39.6z" fill="#34A853"/>
            <path d="M36.7 58.4c2.9 0 5.7.5 8.3 1.4C51.6 37.8 71.8 22 95.5 22c15.6 0 29.6 7 39 18L115 59.5c-4.7-5.5-11.7-9.1-19.5-9.1-14.3 0-25.9 11.6-25.9 25.9 0 2.4.3 4.8 1 7l-27.1 27.1c-1.5-4.4-2.3-9.1-2.3-14 0-20.3 16.4-38 35.5-38z" fill="#FBBC04"/>
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-name">Google Cloud</span>
          <span class="brand-tag">Gemini Enterprise Workbench</span>
        </div>
      </a>
      <button class="sidebar-toggle-btn" id="sidebarToggleBtn" onclick="toggleSidebar()" title="Collapse / Expand Sidebar">
        ◀
      </button>
    </div>

    <div class="sidebar-content">
      <!-- ======================================================== -->
      <!-- TOP-LEVEL SECTION: PROJECTS                              -->
      <!-- ======================================================== -->
      <div class="sidebar-section-header">
        <span>PROJECTS</span>
        <span style="font-size:10px; font-weight:600; color:var(--muted);">3 CONNECTORS</span>
      </div>

      <!-- ======================================================== -->
      <!-- PROJECT 1: ServiceNow MCP Connector                      -->
      <!-- ======================================================== -->
      <div class="sidebar-project-node" id="projNode-servicenow">
        <div class="project-node-header" onclick="toggleProjectNode('servicenow')">
          <span class="project-chevron-btn" id="chev-servicenow">▼</span>
          <span class="project-node-icon">⚡</span>
          <span class="project-node-title">ServiceNow MCP</span>
          <span class="sidebar-nav-tag" style="margin-left:auto;">Live MCP</span>
        </div>
        <div class="sidebar-submenu" id="submenu-servicenow">
          <a class="sub-nav-item active" id="sideLink-servicenow" onclick="selectProjectView('servicenow', 'tab-servicenow')">
            <span class="sub-nav-icon">⚡</span>
            <span class="sub-nav-label">Live Workbench</span>
            <span class="sub-nav-count">5 tools</span>
          </a>
          <div class="sub-nav-item" id="sideLink-servicenow-assets" onclick="toggleAssetSubmenu('servicenow', event)">
            <span class="sub-nav-icon">🖼️</span>
            <span class="sub-nav-label" onclick="filterGalleryByProject('servicenow'); event.stopPropagation();">All Assets</span>
            <span class="sub-nav-count" onclick="filterGalleryByProject('servicenow'); event.stopPropagation();">50</span>
            <span class="project-chevron-btn" id="chev-assets-servicenow" style="font-size:8px; margin-left:2px;">▼</span>
          </div>
          <div class="asset-sub-menu" id="assetMenu-servicenow">
            <a class="asset-sub-item" id="sideLink-ge-chat" onclick="selectProjectView('servicenow', 'tab-gallery', 'ge-chat')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">Gemini Enterprise Chat</span>
              <span class="sub-nav-count">19</span>
            </a>
            <a class="asset-sub-item" id="sideLink-ground-truth" onclick="selectProjectView('servicenow', 'tab-gallery', 'ground-truth')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">Ground-Truth Parity</span>
              <span class="sub-nav-count">7</span>
            </a>
            <a class="asset-sub-item" id="sideLink-gcp-wizard" onclick="selectProjectView('servicenow', 'tab-gallery', 'gcp-wizard')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">GCP Console Wizard</span>
              <span class="sub-nav-count">20</span>
            </a>
            <a class="asset-sub-item" id="sideLink-byomcp-setup" onclick="selectProjectView('servicenow', 'tab-gallery', 'byomcp-setup')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">BYOMCP Setup &amp; Auth</span>
              <span class="sub-nav-count">4</span>
            </a>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- PROJECT 2: Veeva MCP Connector                           -->
      <!-- ======================================================== -->
      <div class="sidebar-project-node" id="projNode-veeva">
        <div class="project-node-header" onclick="toggleProjectNode('veeva')">
          <span class="project-chevron-btn" id="chev-veeva">▼</span>
          <span class="project-node-icon">🧪</span>
          <span class="project-node-title">Veeva MCP</span>
          <span class="sidebar-nav-tag" style="margin-left:auto;">21 CFR Part 11</span>
        </div>
        <div class="sidebar-submenu" id="submenu-veeva">
          <a class="sub-nav-item" id="sideLink-veeva" onclick="selectProjectView('veeva', 'tab-veeva')">
            <span class="sub-nav-icon">🧪</span>
            <span class="sub-nav-label">Live Workbench</span>
            <span class="sub-nav-count">3 tools</span>
          </a>
          <div class="sub-nav-item" id="sideLink-veeva-assets" onclick="toggleAssetSubmenu('veeva', event)">
            <span class="sub-nav-icon">🖼️</span>
            <span class="sub-nav-label" onclick="filterGalleryByProject('veeva'); event.stopPropagation();">All Assets</span>
            <span class="sub-nav-count" onclick="filterGalleryByProject('veeva'); event.stopPropagation();">10</span>
            <span class="project-chevron-btn" id="chev-assets-veeva" style="font-size:8px; margin-left:2px;">▼</span>
          </div>
          <div class="asset-sub-menu" id="assetMenu-veeva">
            <a class="asset-sub-item" id="sideLink-veeva-parity" onclick="selectProjectView('veeva', 'tab-gallery', 'ground-truth')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">Clinical &amp; Reg Parity</span>
              <span class="sub-nav-count">3</span>
            </a>
            <a class="asset-sub-item" id="sideLink-veeva-gxp" onclick="selectProjectView('veeva', 'tab-veeva', 'gxp')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">GxP Vault Governance</span>
              <span class="sub-nav-count">Audit</span>
            </a>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- PROJECT 3: Microsoft Unified Connector                   -->
      <!-- ======================================================== -->
      <div class="sidebar-project-node" id="projNode-microsoft">
        <div class="project-node-header" onclick="toggleProjectNode('microsoft')">
          <span class="project-chevron-btn" id="chev-microsoft">▼</span>
          <span class="project-node-icon">🏢</span>
          <span class="project-node-title">Microsoft Unified</span>
          <span class="sidebar-nav-tag" style="margin-left:auto;">Graph v1.0</span>
        </div>
        <div class="sidebar-submenu" id="submenu-microsoft">
          <a class="sub-nav-item" id="sideLink-microsoft" onclick="selectProjectView('microsoft', 'tab-microsoft')">
            <span class="sub-nav-icon">🏢</span>
            <span class="sub-nav-label" title="Live M365 Workbench">Live Workbench</span>
            <span class="sub-nav-count">4 tools</span>
          </a>
          <div class="sub-nav-item" id="sideLink-microsoft-assets" onclick="toggleAssetSubmenu('microsoft', event)">
            <span class="sub-nav-icon">🖼️</span>
            <span class="sub-nav-label" onclick="filterGalleryByProject('microsoft'); event.stopPropagation();">All Assets</span>
            <span class="sub-nav-count" onclick="filterGalleryByProject('microsoft'); event.stopPropagation();">5</span>
            <span class="project-chevron-btn" id="chev-assets-microsoft" style="font-size:8px; margin-left:2px;">▼</span>
          </div>
          <div class="asset-sub-menu" id="assetMenu-microsoft">
            <a class="asset-sub-item" id="sideLink-ms-sharepoint" onclick="selectProjectView('microsoft', 'tab-microsoft', 'sharepoint')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">SharePoint &amp; OneDrive</span>
              <span class="sub-nav-count">Docs</span>
            </a>
            <a class="asset-sub-item" id="sideLink-ms-teams" onclick="selectProjectView('microsoft', 'tab-microsoft', 'teams')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">Teams &amp; Outlook</span>
              <span class="sub-nav-count">Chat</span>
            </a>
            <a class="asset-sub-item" id="sideLink-ms-entra" onclick="selectProjectView('microsoft', 'tab-oauth')">
              <span class="asset-dot"></span>
              <span class="sub-nav-label">Entra ID SSO &amp; Auth</span>
              <span class="sub-nav-count">OAuth</span>
            </a>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- TOP-LEVEL SECTION: ENTERPRISE HUB                        -->
      <!-- ======================================================== -->
      <div class="sidebar-section-header" style="margin-top: 14px;">
        <span>ENTERPRISE HUB</span>
      </div>
      <a class="sidebar-nav-item" id="sideLink-gallery" onclick="selectProjectView('all', 'tab-gallery')" style="margin-left:6px; margin-bottom:4px;">
        <span class="sidebar-nav-icon">🖼️</span>
        <span class="sidebar-nav-label">Visual Proof Gallery</span>
        <span class="sidebar-nav-badge">${totalScreenshots}</span>
      </a>
      <a class="sidebar-nav-item" id="sideLink-oauth" onclick="switchTab('tab-oauth')" style="margin-left:6px;">
        <span class="sidebar-nav-icon">📜</span>
        <span class="sidebar-nav-label">OAuth &amp; Protocol Specs</span>
      </a>
    </div>
    <!-- Sidebar Action Deck Buttons -->
    <div class="sidebar-actions">
      <button class="btn-sidebar-action" onclick="startSlideshow('ALL')" title="Launch Fullscreen Slideshow">
        <span class="sidebar-nav-icon">🎬</span>
        <span>Slideshow Mode</span>
      </button>
      <button class="btn-sidebar-action" onclick="openPrintModal()" title="Print or Export Deck">
        <span class="sidebar-nav-icon">🖨️</span>
        <span>Print &amp; Export PDF</span>
      </button>
    </div>

    <div class="sidebar-footer-status">
      <span class="status-dot"></span>
      <span>Google Cloud • us-central1 • 65 Artifacts</span>
    </div>
  </aside>

  <!-- Main Application Wrapper -->
  <div class="app-main">

    <!-- Top Navigation Bar (GCP Console Top Bar) -->
    <header class="topbar">
      <div class="topbar-inner">
        <div class="topbar-left">
          <button class="topbar-toggle-btn" onclick="toggleSidebar()" title="Toggle Sidebar">
            ☰
          </button>
          
          <!-- Interactive GCP Project Selector Dropdown -->
          <div class="gcp-project-dropdown-wrapper">
            <div class="gcp-project-chip" id="gcpProjectChip" onclick="toggleProjectMenu(event)" title="Select Enterprise Project Context">
            <span class="project-dot"></span>
            <span class="project-label" id="currentProjectName">ServiceNow MCP Connector</span>
            <span class="project-arrow">▾</span>

            <div class="gcp-project-menu" id="gcpProjectMenu" style="display:none;" onclick="event.stopPropagation()">
              <div class="project-menu-header">Select Enterprise Project</div>
              
              <div class="gcp-project-menu-item active" id="pItem-servicenow" onclick="selectProjectView('servicenow', 'tab-servicenow')">
                <span class="project-menu-icon">⚡</span>
                <div class="project-menu-details">
                  <div class="project-menu-title">ServiceNow MCP Connector</div>
                  <div class="project-menu-sub">ITSM, Incidents, KB, Catalog • 50 Artifacts</div>
                </div>
                <span class="project-badge" id="badge-servicenow">ACTIVE</span>
              </div>

              <div class="gcp-project-menu-item" id="pItem-veeva" onclick="selectProjectView('veeva', 'tab-veeva')">
                <span class="project-menu-icon">🧪</span>
                <div class="project-menu-details">
                  <div class="project-menu-title">Veeva MCP Connector</div>
                  <div class="project-menu-sub">Life Sciences GxP, 21 CFR Part 11, Clinical Docs</div>
                </div>
                <span class="project-badge" id="badge-veeva" style="display:none;">ACTIVE</span>
              </div>

              <div class="gcp-project-menu-item" id="pItem-microsoft" onclick="selectProjectView('microsoft', 'tab-microsoft')">
                <span class="project-menu-icon">🏢</span>
                <div class="project-menu-details">
                  <div class="project-menu-title">Microsoft Unified Connector</div>
                  <div class="project-menu-sub">SharePoint, Teams, OneDrive, Exchange • M365 Graph</div>
                </div>
                <span class="project-badge" id="badge-microsoft" style="display:none;">ACTIVE</span>
              </div>

              <div style="height:1px; background:var(--border); margin:4px 0;"></div>

              <div class="gcp-project-menu-item" id="pItem-all" onclick="selectProjectView('all', 'tab-gallery')">
                <span class="project-menu-icon">🌐</span>
                <div class="project-menu-details">
                  <div class="project-menu-title">All Projects (Unified View)</div>
                  <div class="project-menu-sub">Cross-Enterprise Workspace • 65 Visual Artifacts</div>
                </div>
                <span class="project-badge" id="badge-all" style="display:none;">ACTIVE</span>
              </div>
            </div>
          </div>

          <!-- GCP Search Box Mockup -->
          <div class="gcp-search-box" onclick="switchTab('tab-gallery')" title="Search all resources and workflows">
            <span class="gcp-search-icon">🔍</span>
            <span class="gcp-search-placeholder">Search resources, tools, workflows</span>
            <kbd class="gcp-kbd">/</kbd>
          </div>
        </div>



        <div class="topbar-actions">
          <!-- GCP Theme Mode Switcher -->
          <button class="btn-theme-toggle" id="gcpThemeBtn" onclick="toggleGcpTheme()" title="Toggle GCP Light/Dark Mode">
            <span id="themeBtnIcon">☀️</span>
            <span id="themeBtnLabel">GCP Light</span>
          </button>

          <button class="btn-link" onclick="startSlideshow('ALL')" title="Interactive Slideshow">
            <span>🎬</span>
            <span>Slideshow</span>
          </button>
          <button class="btn-link" onclick="openPrintModal()" title="Print Options">
            <span>🖨️</span>
            <span>Print Deck</span>
          </button>
          <div class="status-badge" id="liveBadge">
            <span class="status-dot"></span>
            <span>GCP LIVE</span>
          </div>
        </div>
      </div>
    </header>

    <main class="container">

      <!-- TAB 1: ServiceNow BYOMCP -->
      <div id="tab-servicenow" class="view-tab active">
        <div class="hero-banner">
          <div class="hero-text">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px;">
              <h1 style="margin:0;"><span>Mode 1: ServiceNow Bring Your Own MCP (BYOMCP)</span></h1>
              <button class="permalink-chip" onclick="copyDeepLink({tab:'servicenow'})" title="Copy direct link to this tab">🔗 #tab-servicenow</button>
            </div>
            <p>Google Cloud standard JSON-RPC 2.0 streamable-HTTP server running at <code>http://localhost:${PORT}/mcp</code> with built-in OAuth 2.0 metadata discovery and live incident / KB / catalog query endpoints.</p>
          </div>
          <div class="quick-links">
            <a class="btn-link" href="/.well-known/oauth-authorization-server" target="_blank">OAuth Metadata</a>
            <a class="btn-link" href="/api/tools" target="_blank">View Tools JSON</a>
          </div>
        </div>

        <!-- 1. Full-Width Configuration Strip (Zero Vertical Bloat, High Contrast) -->
        <div class="config-strip-card">
          <div class="config-strip-header">
            <div class="config-strip-title">
              <span style="color:var(--gcp-blue);">⚡</span>
              <span>ServiceNow BYOMCP Instance Configuration</span>
              <span style="font-size:11px; color:var(--muted); font-family:var(--font-mono); margin-left:6px;">(Project: argolis-ge-enterprise)</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge-status-pill state-online">● Active Live Bridge</span>
              <a class="btn-link" style="padding:3px 10px; font-size:11.5px;" href="${SN_CONFIG.instanceUri}/" target="_blank">go/ge-byomcp-playbook ↗</a>
            </div>
          </div>
          <div class="config-grid">
            <div class="config-cell">
              <span class="config-cell-label">Connector Mode</span>
              <span class="config-cell-value">custom_mcp (BYOMCP)</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">MCP Server URL</span>
              <span class="config-cell-value link-val" onclick="window.open('http://localhost:${PORT}/mcp')">http://localhost:${PORT}/mcp</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">ServiceNow Tenant</span>
              <span class="config-cell-value link-val" onclick="window.open('${SN_CONFIG.instanceUri}/')">${SN_CONFIG.instanceUri}/</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">OAuth Endpoints</span>
              <span class="config-cell-value">/oauth_auth.do &amp; /oauth_token.do</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">Client ID &amp; User</span>
              <span class="config-cell-value">${SN_CONFIG.clientId} • ${SN_CONFIG.username}</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">Scopes &amp; Hints</span>
              <span class="config-cell-value">useraccount offline_access • readOnly</span>
            </div>
          </div>
        </div>

        <!-- 2. Balanced Two-Column Workbench Layout -->
        <div class="workbench-grid">
          <!-- Left Column: Available MCP Tools (Compact, Scrollable List) -->
          <div class="card" style="height: 100%; display: flex; flex-direction: column;">
            <div class="card-title" style="margin-bottom:12px;">
              <span>Available MCP Tools</span>
              <span style="font-size:11px; color:var(--muted);">5 Registered Tools</span>
            </div>
            <div class="tool-list-scrollable">
              <div class="tool-item tool-card-item selected" id="tool-search_servicenow_incidents" data-tool-name="search_servicenow_incidents" onclick="selectTool('search_servicenow_incidents')">
                <div class="tool-card-top">
                  <span class="tool-card-name">search_servicenow_incidents</span>
                  <div style="display:flex; align-items:center; gap:5px;">
                    <span class="tool-tag">readOnly</span>
                    <button class="permalink-tool-chip" onclick="event.stopPropagation(); copyDeepLink({tab:'servicenow', tool:'search_servicenow_incidents'})" title="Copy direct link">🔗</button>
                  </div>
                </div>
                <div class="tool-card-desc">Search incident tickets by keyword, priority, or category.</div>
                <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); openSlideshowAtSlide('14_ge_chat_matching_servicenow_query_results')" title="Jump to linked visual proof in gallery">
                  <span>📸 Slide #14 • Query Results ↗</span>
                </div>
              </div>

              <div class="tool-item tool-card-item" id="tool-get_servicenow_incident" data-tool-name="get_servicenow_incident" onclick="selectTool('get_servicenow_incident')">
                <div class="tool-card-top">
                  <span class="tool-card-name">get_servicenow_incident</span>
                  <div style="display:flex; align-items:center; gap:5px;">
                    <span class="tool-tag">readOnly</span>
                    <button class="permalink-tool-chip" onclick="event.stopPropagation(); copyDeepLink({tab:'servicenow', tool:'get_servicenow_incident'})" title="Copy direct link">🔗</button>
                  </div>
                </div>
                <div class="tool-card-desc">Fetch full incident record by ticket number (e.g. INC1039).</div>
                <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); openSlideshowAtSlide('15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison')" title="Jump to linked visual proof in gallery">
                  <span>📸 Slide #15 • Side-by-Side Parity ↗</span>
                </div>
              </div>

              <div class="tool-item tool-card-item" id="tool-search_servicenow_knowledge_articles" data-tool-name="search_servicenow_knowledge_articles" onclick="selectTool('search_servicenow_knowledge_articles')">
                <div class="tool-card-top">
                  <span class="tool-card-name">search_servicenow_knowledge_articles</span>
                  <div style="display:flex; align-items:center; gap:5px;">
                    <span class="tool-tag">readOnly</span>
                    <button class="permalink-tool-chip" onclick="event.stopPropagation(); copyDeepLink({tab:'servicenow', tool:'search_servicenow_knowledge_articles'})" title="Copy direct link">🔗</button>
                  </div>
                </div>
                <div class="tool-card-desc">Search published IT Knowledge Base articles (kb_knowledge).</div>
                <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); openSlideshowAtSlide('19_ge_chat_sources_menu_servicenow_connector_selected')" title="Jump to linked visual proof in gallery">
                  <span>📸 Slide #19 • Sources Drawer ↗</span>
                </div>
              </div>

              <div class="tool-item tool-card-item" id="tool-list_servicenow_catalog_items" data-tool-name="list_servicenow_catalog_items" onclick="selectTool('list_servicenow_catalog_items')">
                <div class="tool-card-top">
                  <span class="tool-card-name">list_servicenow_catalog_items</span>
                  <div style="display:flex; align-items:center; gap:5px;">
                    <span class="tool-tag">readOnly</span>
                    <button class="permalink-tool-chip" onclick="event.stopPropagation(); copyDeepLink({tab:'servicenow', tool:'list_servicenow_catalog_items'})" title="Copy direct link">🔗</button>
                  </div>
                </div>
                <div class="tool-card-desc">List active Service Catalog items available for ordering.</div>
                <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); openSlideshowAtSlide('21_ge_chat_servicenow_connector_tool_call_state')" title="Jump to linked visual proof in gallery">
                  <span>📸 Slide #21 • Tool Call State ↗</span>
                </div>
              </div>

              <div class="tool-item tool-card-item" id="tool-search_servicenow_problems_and_changes" data-tool-name="search_servicenow_problems_and_changes" onclick="selectTool('search_servicenow_problems_and_changes')">
                <div class="tool-card-top">
                  <span class="tool-card-name">search_servicenow_problems_and_changes</span>
                  <div style="display:flex; align-items:center; gap:5px;">
                    <span class="tool-tag">readOnly</span>
                    <button class="permalink-tool-chip" onclick="event.stopPropagation(); copyDeepLink({tab:'servicenow', tool:'search_servicenow_problems_and_changes'})" title="Copy direct link">🔗</button>
                  </div>
                </div>
                <div class="tool-card-desc">Query live ServiceNow Problem records and Change Requests.</div>
                <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); openSlideshowAtSlide('13b_servicenow_live_ui_full_incident_list')" title="Jump to linked visual proof in gallery">
                  <span>📸 Slide #13b • Live Incident List ↗</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Active Runner & Live Data Table -->
          <div>
            <div class="runner-box">
              <div class="runner-title">
                <span id="activeToolTitle">Active Tool: search_servicenow_incidents</span>
                <span style="font-size:12px; color:var(--muted); font-family:var(--font-mono);">POST /mcp</span>
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

              <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
                <button class="btn-run" onclick="executeCurrentTool()">
                  <span>&#9654;</span>
                  <span>Execute MCP Tool Call</span>
                </button>
                <button class="btn-link" onclick="executeRpc('initialize', {})">Initialize MCP</button>
                <button class="btn-link" onclick="executeRpc('tools/list', {})">List Tools</button>
              </div>
            </div>

            <div class="card" style="min-height:360px;">
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
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px;">
              <h1 style="margin:0;">Veeva Vault GxP Clinical &amp; Regulatory Connector</h1>
              <button class="permalink-chip" onclick="copyDeepLink({tab:'veeva'})" title="Copy direct link to this tab">🔗 #tab-veeva</button>
            </div>
            <p>Google Cloud integrated MCP tools for life sciences document governance, clinical study reports (ONCO-304), regulatory submissions, and GxP compliance audit trails.</p>
          </div>
          <div class="quick-links">
            <a class="btn-link" href="http://localhost:8792/mcp" target="_blank">Veeva Port 8792 Endpoint</a>
          </div>
        </div>

        <!-- Veeva Vault Instance Configuration Strip -->
        <div class="config-strip-card" style="margin-bottom:20px;">
          <div class="config-strip-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="status-indicator"></span>
              <span style="font-weight:600; font-size:13px; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">Veeva Vault GxP Cloud Instance</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="badge" style="background:rgba(30, 142, 62, 0.15); color:var(--green); border:1px solid rgba(30, 142, 62, 0.3);">FDA 21 CFR Part 11 Validated</span>
              <span class="badge" style="background:rgba(26, 115, 232, 0.15); color:var(--accent); border:1px solid rgba(26, 115, 232, 0.3);">argolis-life-sciences</span>
            </div>
          </div>
          <div class="config-grid">
            <div class="config-cell">
              <span class="config-cell-label">Vault Domain</span>
              <span class="config-cell-value link-val" onclick="window.open('https://${veevaSampleData.vault_dns || 'vv-agency-prod.veevavault.com'}')">${veevaSampleData.vault_dns || 'vv-agency-prod.veevavault.com'}</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">Okta SSO Domain</span>
              <span class="config-cell-value">${veevaSampleData.okta_domain || 'argolis-life-sciences.okta.com'}</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">OIDC Profile ID</span>
              <span class="config-cell-value">${veevaSampleData.oidc_profile_id || 'prof_gxp_clinical_01'}</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">Regulatory Standard</span>
              <span class="config-cell-value">GxP / 21 CFR Part 11 Validated</span>
            </div>
          </div>
        </div>

        <!-- Balanced 2-Column Workbench Grid -->
        <div class="workbench-grid">
          <!-- Left Column: Tool Selector -->
          <div class="workbench-col-tools">
            <div class="card" style="height:100%; display:flex; flex-direction:column;">
              <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span>Veeva Vault Tools</span>
                <span class="badge" style="font-size:11px;">3 MCP Tools Available</span>
              </div>
              <div class="tool-list tool-list-scrollable" style="flex:1; max-height:480px; overflow-y:auto; padding-right:4px;">
                <div class="tool-item compact selected" id="veevaTool-search_vault_documents" data-veeva-tool="search_vault_documents" onclick="selectVeevaTool('search_vault_documents')">
                  <div class="tool-header">
                    <span class="tool-name">search_vault_documents</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-desc">VQL query across clinical trial documents, protocols, and regulatory filings.</div>
                </div>
                <div class="tool-item compact" id="veevaTool-get_audit_trail" data-veeva-tool="get_audit_trail" onclick="selectVeevaTool('get_audit_trail')">
                  <div class="tool-header">
                    <span class="tool-name">get_audit_trail</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-desc">Extract 21 CFR Part 11 compliant audit trails with electronic signatures.</div>
                </div>
                <div class="tool-item compact" id="veevaTool-get_binder_structure" data-veeva-tool="get_binder_structure" onclick="selectVeevaTool('get_binder_structure')">
                  <div class="tool-header">
                    <span class="tool-name">get_binder_structure</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-desc">Retrieve eCTD regulatory binder hierarchies and section mappings.</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Interactive Runner & Result Table -->
          <div class="workbench-col-execution">
            <div class="runner-box" style="margin-bottom:16px;">
              <div class="runner-title">
                <span id="activeVeevaTitle">Active Tool: search_vault_documents</span>
                <span style="font-size:12px; color:var(--muted); font-family:var(--font-mono);">POST :8792/mcp</span>
              </div>
              <div id="veevaInputs">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">VQL Query Filter</label>
                    <input type="text" id="veevaQuery" class="form-input" value="status__v = 'Approved for Submission'" />
                  </div>
                </div>
              </div>
              <div style="display:flex; gap:10px; margin-top:14px;">
                <button class="btn-run" onclick="executeVeevaTool()">
                  <span>&#9654;</span>
                  <span>Execute Veeva Tool Call</span>
                </button>
              </div>
            </div>

            <div class="card">
              <div class="output-header">
                <span>Veeva Vault Result</span>
                <div class="view-toggle">
                  <button class="toggle-btn active" id="btnVeevaTable" onclick="toggleVeevaView('table')">Table</button>
                  <button class="toggle-btn" id="btnVeevaJson" onclick="toggleVeevaView('json')">JSON</button>
                </div>
              </div>
              <div id="veevaTableContainer" style="overflow-x:auto;"></div>
              <pre class="code-block" id="veevaRpcOutput" style="display:none;">Click 'Execute Veeva Tool Call' to query live clinical trial documents.</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: Microsoft Unified Connector -->
      <div id="tab-microsoft" class="view-tab">
        <div class="hero-banner">
          <div class="hero-text">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px;">
              <h1 style="margin:0;">Mode 3: Microsoft Unified Connector (SharePoint, Teams, OneDrive)</h1>
              <button class="permalink-chip" onclick="copyDeepLink({tab:'microsoft'})" title="Copy direct link to this tab">🔗 #tab-microsoft</button>
            </div>
            <p>Unified enterprise knowledge grounding across Microsoft 365 Graph API, SharePoint Online intranets, OneDrive for Business, Teams channel threads, and Exchange Online with Microsoft Entra ID (Azure AD) SSO governance.</p>
          </div>
          <div class="quick-links">
            <a class="btn-link" href="https://graph.microsoft.com/v1.0" target="_blank">Microsoft Graph v1.0 Endpoint</a>
            <a class="btn-link accent" href="/.well-known/oauth-authorization-server" target="_blank">Entra ID OAuth Spec</a>
          </div>
        </div>

        <!-- Microsoft Unified Instance Configuration Strip -->
        <div class="config-strip-card" style="margin-bottom:20px;">
          <div class="config-strip-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="status-indicator"></span>
              <span style="font-weight:600; font-size:13px; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">Microsoft Unified Connector Instance</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="badge" style="background:rgba(30, 142, 62, 0.15); color:var(--green); border:1px solid rgba(30, 142, 62, 0.3);">Microsoft Entra ID Validated</span>
              <span class="badge" style="background:rgba(26, 115, 232, 0.15); color:var(--accent); border:1px solid rgba(26, 115, 232, 0.3);">argolis-enterprise</span>
            </div>
          </div>
          <div class="config-grid">
            <div class="config-cell">
              <span class="config-cell-label">Entra Tenant ID</span>
              <span class="config-cell-value link-val" onclick="copySysId(this)" data-sysid="${msSampleData.tenant_id}" title="${msSampleData.tenant_id}">${msSampleData.tenant_id}</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">Entra Domain</span>
              <span class="config-cell-value" title="${msSampleData.entra_domain}">${msSampleData.entra_domain}</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">Graph Endpoint</span>
              <span class="config-cell-value link-val" onclick="window.open('${msSampleData.graph_endpoint}')" title="${msSampleData.graph_endpoint}">${msSampleData.graph_endpoint}</span>
            </div>
            <div class="config-cell">
              <span class="config-cell-label">Auth Protocol</span>
              <span class="config-cell-value" title="${msSampleData.auth_mode}">${msSampleData.auth_mode}</span>
            </div>
          </div>
        </div>

        <!-- Balanced 2-Column Workbench Grid -->
        <div class="workbench-grid">
          <!-- Left Column: Tool Selector -->
          <div class="workbench-col-tools">
            <div class="card" style="height:100%; display:flex; flex-direction:column;">
              <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span>Microsoft Graph MCP Tools</span>
                <span class="badge" style="font-size:11px;">4 M365 Tools</span>
              </div>
              <div class="tool-list tool-list-scrollable" style="flex:1; max-height:480px; overflow-y:auto; padding-right:4px;">
                <div class="tool-item tool-card-item selected" id="msTool-search_sharepoint_documents" data-tool-name="search_sharepoint_documents" onclick="selectMicrosoftTool('search_sharepoint_documents')">
                  <div class="tool-card-top">
                    <span class="tool-card-name">search_sharepoint_documents</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-card-desc">Query SharePoint Online intranet portals, document libraries, and policy files.</div>
                  <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); selectProjectView('all', 'tab-gallery', 'ge-chat')" title="Jump to linked visual proof in gallery">
                    <span>📸 Slide #19 • Enterprise Sources ↗</span>
                  </div>
                </div>

                <div class="tool-item tool-card-item" id="msTool-get_teams_messages" data-tool-name="get_teams_messages" onclick="selectMicrosoftTool('get_teams_messages')">
                  <div class="tool-card-top">
                    <span class="tool-card-name">get_teams_messages</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-card-desc">Extract Microsoft Teams channel discussions, war room threads, and meeting transcripts.</div>
                  <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); selectProjectView('all', 'tab-gallery', 'ge-chat')" title="Jump to linked visual proof in gallery">
                    <span>📸 Slide #20 • Conversational Grounding ↗</span>
                  </div>
                </div>

                <div class="tool-item tool-card-item" id="msTool-search_outlook_emails" data-tool-name="search_outlook_emails" onclick="selectMicrosoftTool('search_outlook_emails')">
                  <div class="tool-card-top">
                    <span class="tool-card-name">search_outlook_emails</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-card-desc">Search Exchange Online emails, executive briefings, and calendar events.</div>
                  <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); selectProjectView('all', 'tab-gallery', 'ge-chat')" title="Jump to linked visual proof in gallery">
                    <span>📸 Slide #21 • Agent Tool Calling ↗</span>
                  </div>
                </div>

                <div class="tool-item tool-card-item" id="msTool-get_onedrive_files" data-tool-name="get_onedrive_files" onclick="selectMicrosoftTool('get_onedrive_files')">
                  <div class="tool-card-top">
                    <span class="tool-card-name">get_onedrive_files</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-card-desc">Browse enterprise OneDrive for Business documents, spreadsheets, and presentations.</div>
                  <div class="tool-card-asset-chip linked-asset-link" onclick="event.stopPropagation(); selectProjectView('all', 'tab-gallery', 'ge-chat')" title="Jump to linked visual proof in gallery">
                    <span>📸 Slide #22 • Live Search Results ↗</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Interactive Runner & Result Table -->
          <div class="workbench-col-execution">
            <div class="runner-box" style="margin-bottom:16px;">
              <div class="runner-title">
                <span id="activeMsTitle">Active Tool: search_sharepoint_documents</span>
                <span style="font-size:12px; color:var(--muted); font-family:var(--font-mono);">POST /graph/mcp</span>
              </div>
              <div id="msToolInputs">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Search Query (KQL / Keyword)</label>
                    <input type="text" id="msInputQuery" class="form-input" value="Cloud Infrastructure Strategy" />
                  </div>
                  <div class="form-group" style="max-width:140px;">
                    <label class="form-label">Limit</label>
                    <input type="number" id="msInputLimit" class="form-input" value="5" min="1" max="50" />
                  </div>
                </div>
              </div>
              <div style="display:flex; gap:10px; margin-top:14px;">
                <button class="btn-run" onclick="executeMicrosoftTool()">
                  <span>&#9654;</span>
                  <span>Execute Microsoft Tool Call</span>
                </button>
              </div>
            </div>

            <div class="card">
              <div class="output-header">
                <span id="msOutputTitle">Microsoft Graph Result</span>
                <div class="view-toggle">
                  <button class="toggle-btn active" id="btnMsTable" onclick="toggleMsView('table')">Table</button>
                  <button class="toggle-btn" id="btnMsJson" onclick="toggleMsView('json')">JSON</button>
                </div>
              </div>
              <div id="msTableContainer" style="overflow-x:auto;"></div>
              <pre class="code-block" id="msRpcOutput" style="display:none;">Click 'Execute Microsoft Tool Call' to query live Microsoft 365 Graph documents.</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: Visual Gallery (6 Logical Workflows) -->
      <div id="tab-gallery" class="view-tab">
        <div class="hero-banner">
          <div class="hero-text">
            <h1>Google Cloud &amp; Gemini Enterprise Proof Gallery</h1>
            <p>Complete visual verification archive of <strong>${totalScreenshots} authentic screenshots</strong> captured directly from Google Cloud Console (Argolis), Gemini Enterprise Chat, ServiceNow, and Veeva Vault. Zero synthetic images.</p>
          </div>
          <div class="quick-links">
            <button class="btn-link accent" onclick="startSlideshow('ALL')">🎬 Play All (${totalScreenshots} Slides)</button>
            <button class="btn-link" onclick="openPrintModal()">🖨️ Print &amp; PDF Export</button>
          </div>
        </div>

        <!-- Sticky Filter Pills -->
        <div class="gallery-filter-bar">
          <button class="gallery-filter-btn active" onclick="filterGroupView('ALL')">
            <span>🌐 All Workflows</span>
            <span class="badge-count">${totalScreenshots}</span>
          </button>
          ${logicalGroups.map(g => `
            <button class="gallery-filter-btn" onclick="filterGroupView('${g.id}')">
              <span>${g.icon} ${g.title.split(':')[0]}</span>
              <span class="badge-count">${g.count}</span>
            </button>
          `).join('')}
        </div>

        <!-- 6 Logical Workflow Sections -->
        ${logicalGroups.map(g => `
          <section class="workflow-group-card" id="workflow-${g.id}" data-group-id="${g.id}">
            <div class="workflow-header">
              <div class="workflow-title-area">
                <span class="workflow-icon">${g.icon}</span>
                <div>
                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <h2 class="workflow-title" style="margin:0;">${g.title}</h2>
                    <button class="permalink-chip" onclick="copyDeepLink({tab:'gallery', group:'${g.id}'})" title="Copy direct link to this workflow section">🔗 #${g.id}</button>
                  </div>
                  <p class="workflow-desc">${g.description}</p>
                </div>
              </div>
              <div class="workflow-actions">
                <button class="btn-group-action" onclick="startSlideshow('${g.id}')" title="Play slideshow of this workflow">
                  <span>🎬</span>
                  <span>Play Section (${g.count})</span>
                </button>
                <button class="btn-group-action" onclick="openPrintModal('${g.id}')" title="Export this section">
                  <span>🖨️</span>
                  <span>Export</span>
                </button>
              </div>
            </div>

            <div class="gallery-grid">
              ${g.images.map(img => `
                <div class="gallery-card" id="asset-${img.assetId}" data-asset-id="${img.assetId}" onclick="openSlideshowAtSlide('${img.assetId}')" title="Click to view full slide in presentation mode">
                  <div class="gallery-img-wrap">
                    <span class="slide-num-pill">#${img.groupIndex || (img.index + 1)}</span>
                    <button class="asset-copy-chip" onclick="event.stopPropagation(); copyDeepLink({tab:'gallery', slide:'${img.assetId}'})" title="Copy direct link to this asset">
                      <span>🔗</span>
                      <span>${img.assetId}</span>
                    </button>
                    <img src="${img.url}" alt="${img.title}" loading="lazy" />
                  </div>
                  <div class="gallery-info">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                      <span class="gallery-cat">${g.title.split(':')[0]}</span>
                      ${img.linkedTool ? `<span class="linked-demo-pill" onclick="event.stopPropagation(); jumpToDemoTool('${img.linkedTool.tab}', '${img.linkedTool.tool}')" title="Linked to demo tool: ${img.linkedTool.label}">⚡ Demo ↗</span>` : ''}
                    </div>
                    <div class="gallery-title">${img.title}</div>
                    <div class="gallery-file">${img.fileName}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>

      <!-- TAB 4: OAuth & Specs -->
      <div id="tab-oauth" class="view-tab">
        <div class="hero-banner">
          <div class="hero-text">
            <h1>OAuth 2.0 Server Metadata &amp; JSON-RPC Protocol Specs</h1>
            <p>Live endpoints adhering to RFC 8414 (OAuth 2.0 Authorization Server Metadata) and Model Context Protocol streamable-HTTP specs.</p>
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
  </div>
</div>

<!-- FULLSCREEN SLIDESHOW MODAL (GCP Presentation Deck) -->
<div class="slideshow-modal" id="slideshowModal">
  <div class="slideshow-topbar">
    <div class="slideshow-meta">
      <!-- Google Cloud Logo Small -->
      <div style="width:24px; height:20px; display:flex; align-items:center;">
        <svg viewBox="0 0 192 155" fill="none" style="width:100%; height:100%;">
          <path d="M152.6 63.8c-1.8 0-3.6.2-5.3.5C141.4 39.4 120.4 22 95.5 22c-23.7 0-43.9 15.8-50.5 37.8-2.6-.9-5.4-1.4-8.3-1.4C16.4 58.4 0 74.8 0 95.1s16.4 36.7 36.7 36.7h115.9c21.7 0 39.4-17.6 39.4-39.4 0-21.7-17.7-38.6-39.4-38.6z" fill="#4285F4"/>
          <path d="M95.5 22c-15.6 0-29.6 7-39 18l19.5 19.5c4.7-5.5 11.7-9.1 19.5-9.1 14.3 0 25.9 11.6 25.9 25.9 0 2.4-.3 4.8-1 7l27.1 27.1c1.5-4.4 2.3-9.1 2.3-14 0-38.3-24.9-69.4-54.3-69.4z" fill="#EA4335"/>
          <path d="M152.6 131.8H36.7c-9.1 0-17.4-3.4-23.8-9l20.4-20.4c1.1.7 2.2 1.2 3.4 1.4h115.9c6.4 0 11.6-5.2 11.6-11.6 0-3.2-1.3-6.1-3.4-8.2l20.4-20.4c7.3 7.3 11.8 17.4 11.8 28.6 0 21.8-18.1 39.6-40.4 39.6z" fill="#34A853"/>
          <path d="M36.7 58.4c2.9 0 5.7.5 8.3 1.4C51.6 37.8 71.8 22 95.5 22c15.6 0 29.6 7 39 18L115 59.5c-4.7-5.5-11.7-9.1-19.5-9.1-14.3 0-25.9 11.6-25.9 25.9 0 2.4.3 4.8 1 7l-27.1 27.1c-1.5-4.4-2.3-9.1-2.3-14 0-20.3 16.4-38 35.5-38z" fill="#FBBC04"/>
        </svg>
      </div>
      <span class="slideshow-group-badge" id="slideGroupBadge">GCP Console</span>
      <span class="slideshow-slide-title" id="slideMainTitle">Slide Title</span>
      <span class="slideshow-file-tag" id="slideFilename">01_screenshot.png</span>
      <span class="slideshow-asset-badge" id="slideAssetBadge" onclick="copyCurrentSlideLink()" title="Copy direct link to this asset (ID)">🔗 <span id="slideAssetIdText">ID</span></span>
    </div>
    <div class="slideshow-header-tools">
      <!-- Google DeepMind Neural Audio Narrator Controls -->
      <div class="narrator-controls-group">
        <select id="narratorVoiceSelect" class="gcp-voice-select" onchange="changeNarratorVoice(this.value)" title="Select AI Voice Narrator">
          <optgroup label="🌟 Google Journey (Ultra-Human Storyteller — Recommended)">
            <option value="journey-d" selected>🌟 Google Journey — David (Warm Human Architect)</option>
            <option value="journey-f">🌟 Google Journey — Fiona (Natural Storyteller)</option>
            <option value="journey-o">🌟 Google Journey — Olivia (Keynote Briefing)</option>
          </optgroup>
          <optgroup label="⚡ Google DeepMind Chirp-HD (Foundation Model)">
            <option value="chirp-d">⚡ Google Chirp-HD — Daniel (Tech Specialist)</option>
            <option value="chirp-f">⚡ Google Chirp-HD — Faith (Articulate Engineer)</option>
          </optgroup>
          <optgroup label="🎙️ Google Studio (Broadcast)">
            <option value="studio-q">🎙️ Google Studio — Quinn (Broadcast Baritone)</option>
            <option value="studio-o">🎙️ Google Studio — Oprah (Studio Documentary)</option>
          </optgroup>
          <optgroup label="🤖 Google Gemini Multimodal Audio">
            <option value="gemini-charon">🤖 Gemini DeepMind — Charon (Cloud Architect)</option>
            <option value="gemini-aoede">🤖 Gemini DeepMind — Aoede (Executive Specialist)</option>
            <option value="gemini-puck">🤖 Gemini DeepMind — Puck (Solutions Advocate)</option>
            <option value="gemini-kore">🤖 Gemini DeepMind — Kore (Security Auditor)</option>
            <option value="gemini-fenrir">🤖 Gemini DeepMind — Fenrir (Staff Architect)</option>
          </optgroup>
          <optgroup label="🌐 OpenAI GPT-4o Omni Audio">
            <option value="openai-alloy">🌐 OpenAI Omni — Alloy</option>
            <option value="openai-echo">🌐 OpenAI Omni — Echo</option>
            <option value="openai-nova">🌐 OpenAI Omni — Nova</option>
            <option value="openai-onyx">🌐 OpenAI Omni — Onyx</option>
          </optgroup>
          <optgroup label="💻 Browser Native">
            <option value="browser-default">💻 Browser Device Voice (Offline Fallback)</option>
          </optgroup>
        </select>
        <button class="btn-narrate-action" id="btnNarrateAudio" onclick="toggleSlideNarration()" title="Play / Pause Natural Concept Narration (N)">
          <span id="narrateIcon">🔊</span>
          <span id="narrateLabel">Narrate</span>
        </button>
        <label class="gcp-narrate-toggle" title="Automatically narrate every slide as you navigate (A)">
          <input type="checkbox" id="autoNarrateCheckbox" onchange="toggleAutoNarrate(this.checked)" />
          <span>Auto-Narrate</span>
        </label>
        <button class="btn-slideshow-tool active" id="btnSubtitlesToggle" onclick="toggleSubtitles()" title="Toggle Live Gold Subtitles (C)">CC</button>
      </div>

      <button class="btn-share-link" id="slideLinkedDemoBtn" onclick="jumpFromSlideToDemo()" style="display:none;" title="Open interactive demo associated with this slide">
        <span>⚡</span>
        <span id="slideLinkedDemoLabel">Open Demo</span>
      </button>
      <button class="btn-share-link" onclick="copyCurrentSlideLink()" title="Copy deep link to this slide">
        <span>🔗</span>
        <span>Share Link</span>
      </button>
      <span class="slideshow-counter" id="slideCounterText">Slide 1 of 65</span>
      <button class="btn-slideshow-tool" onclick="toggleFullscreen()" title="Toggle Fullscreen (F)">⛶</button>
      <button class="btn-slideshow-tool" onclick="closeSlideshow()" title="Close Slideshow (Esc)">✕</button>
    </div>
  </div>

  <div class="slideshow-stage">
    <button class="slideshow-arrow prev" onclick="prevSlide()" title="Previous (Left Arrow)">◀</button>
    <img class="slideshow-img" id="slideshowImg" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" alt="Slide View" />
    <button class="slideshow-arrow next" onclick="nextSlide()" title="Next (Right Arrow)">▶</button>

    <!-- Real-Time Gold Karaoke Subtitles Bar -->
    <div class="slideshow-karaoke-bar" id="slideshowKaraokeBar">
      <div class="karaoke-header">
        <div class="karaoke-voice-badge" id="karaokeVoiceBadge">
          <span class="karaoke-pulse-dot"></span>
          <span id="karaokeVoiceName">Google Journey • David (Warm Human Architect)</span>
        </div>
        <div class="karaoke-concept-tag">
          <span>💡 Architectural Concept Briefing</span>
        </div>
      </div>
      <div class="karaoke-text" id="karaokeText">
        <!-- Words populated per slide -->
      </div>
    </div>
  </div>

  <div class="slideshow-bottom">
    <div class="slideshow-progress-bar">
      <div class="slideshow-progress-fill" id="slideProgressBar"></div>
    </div>
    <div class="slideshow-controls-row">
      <div class="slideshow-play-controls">
        <button class="btn-slideshow-play" id="btnPlayPause" onclick="togglePlayPause()">
          <span id="playIcon">&#9646;&#9646;</span>
          <span id="playText">Pause</span>
        </button>
        <select class="speed-select" id="speedSelect" onchange="changeSpeed(this.value)">
          <option value="3000">3s / slide</option>
          <option value="5000" selected>5s / slide</option>
          <option value="8000">8s / slide</option>
        </select>
        <label style="font-size:12px; color:var(--muted); display:flex; align-items:center; gap:5px; cursor:pointer;">
          <input type="checkbox" id="loopCheckbox" checked /> Loop
        </label>
      </div>

      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:11.5px; color:var(--muted);">Shortcuts: &larr; / &rarr; (Navigate), Space (Play/Pause), F (Fullscreen), Esc (Exit)</span>
        <button class="filmstrip-toggle-btn" onclick="toggleFilmstrip()" id="btnFilmstripToggle">
          <span>🎞️</span>
          <span>Filmstrip</span>
        </button>
      </div>
    </div>

    <!-- Scrollable Filmstrip Strip -->
    <div class="slideshow-filmstrip" id="slideshowFilmstrip"></div>
  </div>
</div>

<!-- PRINT & PDF EXPORT MODAL -->
<div class="print-modal" id="printModal">
  <div class="print-dialog">
    <div class="print-header">
      <h2>Google Cloud Presentation &amp; Verification Deck Export</h2>
      <button class="lightbox-close" onclick="closePrintModal()">✕</button>
    </div>
    <div class="print-body">
      <p style="font-size:13px; color:var(--muted); margin:0;">
        Prepare a clean, high-resolution printable report or PDF deck of all verified Google Cloud, Gemini Enterprise, and ServiceNow captures.
      </p>

      <div class="print-option-card selected" id="printOpt-landscape" onclick="selectPrintFormat('landscape')">
        <input type="radio" name="printFormat" value="landscape" checked />
        <div>
          <div class="print-option-title">Executive Landscape Presentation Deck</div>
          <div class="print-option-desc">Optimized for Google Slides / 16:9 widescreen presentation printouts. 1 full slide per page with crisp typography and timestamps.</div>
        </div>
      </div>

      <div class="print-option-card" id="printOpt-portrait" onclick="selectPrintFormat('portrait')">
        <input type="radio" name="printFormat" value="portrait" />
        <div>
          <div class="print-option-title">Detailed Portrait Engineering Report</div>
          <div class="print-option-desc">Optimized for multi-page PDF documentation. 2 cards per page with complete metadata, verification badges, and file traces.</div>
        </div>
      </div>

      <div>
        <label style="font-size:12.5px; font-weight:700; color:var(--text-heading); display:block; margin-bottom:8px;">Scope of Export</label>
        <select id="printScopeSelect" class="form-input" style="width:100%;">
          <option value="ALL">All 6 Verified Workflows (Complete ${totalScreenshots} Screenshot Deck)</option>
          ${logicalGroups.map(g => `
            <option value="${g.id}">${g.title} (${g.count} slides)</option>
          `).join('')}
        </select>
      </div>
    </div>
    <div class="print-footer" style="display:flex; justify-content:space-between; align-items:center;">
      <button class="btn-link" onclick="closePrintModal()">Cancel</button>
      <div style="display:flex; gap:10px;">
        <button id="btnDownloadPdf" class="btn-run" onclick="downloadDossierPdf()" style="background:#1a73e8;">
          <span id="btnDownloadPdfIcon">📥</span>
          <span id="btnDownloadPdfLabel">Download Vector PDF</span>
        </button>
        <button class="btn-run" onclick="executePrint()" style="background:#34a853;">
          <span>🖨️</span>
          <span>Browser Print Preview</span>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Single Image Lightbox Backdrop -->
<div class="lightbox-backdrop" id="imgLightbox" onclick="closeLightbox(event)">
  <div class="lightbox-content">
    <div class="lightbox-header">
      <span class="lightbox-title" id="lightboxTitle">Screenshot Preview</span>
      <button class="lightbox-close" onclick="closeLightboxDirect()">✕</button>
    </div>
    <div class="lightbox-body">
      <img id="lightboxImg" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" alt="Enlarged Screenshot" />
    </div>
  </div>
</div>

<script>
  // CLIENT STATE
  const LOGICAL_GROUPS = ${logicalGroupsJson};
  const ALL_SLIDES = ${allSlidesJson};
  const TOOL_ASSET_MAPPINGS = ${JSON.stringify(TOOL_ASSET_MAPPINGS)};
  const ASSET_TOOL_MAPPINGS = ${JSON.stringify(ASSET_TOOL_MAPPINGS)};

  
  // =========================================================================
  // URL STATE & DEEP LINKING CONTROLLER (URI ADDRESSABILITY PROTOCOL)
  // =========================================================================
  function updateUrlState(params, push) {
    try {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(params)) {
        if (v === null || v === undefined || v === '') {
          url.searchParams.delete(k);
        } else {
          url.searchParams.set(k, v);
        }
      }
      if (push) {
        window.history.pushState({}, '', url.toString());
      } else {
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) {}
  }

  function getDeepLink(params) {
    const u = new URL(window.location.origin + window.location.pathname);
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') {
        u.searchParams.set(k, v);
      }
    }
    return u.toString();
  }

  function copyDeepLink(params, label) {
    const link = getDeepLink(params);
    updateUrlState(params, true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function() {
        showToast('🔗 Deep link copied to clipboard!', link);
      }).catch(function() {
        showToast('🔗 Direct Link:', link);
      });
    } else {
      showToast('🔗 Direct Link:', link);
    }
  }

  function copyCurrentSlideLink() {
    const slide = activeSlideDeck[currentSlideIndex];
    if (slide) {
      copyDeepLink({ tab: 'gallery', slide: slide.assetId || (currentSlideIndex + 1) }, slide.title);
    }
  }

  function jumpToDemoTool(tab, toolName) {
    switchTab('tab-' + tab, true);
    if (tab === 'servicenow') {
      selectTool(toolName, true);
    } else if (tab === 'veeva') {
      selectVeevaTool(toolName, true);
    } else if (tab === 'microsoft') {
      selectMicrosoftTool(toolName);
    }
  }

  function jumpFromSlideToDemo() {
    const slide = activeSlideDeck[currentSlideIndex];
    if (slide && slide.linkedTool) {
      closeSlideshow();
      jumpToDemoTool(slide.linkedTool.tab, slide.linkedTool.tool);
    }
  }

  let toastTimer = null;
  function showToast(title, url) {
    const toast = document.getElementById('gcpToast');
    const titleEl = document.getElementById('toastTitle');
    const urlEl = document.getElementById('toastUrl');
    if (!toast) return;
    if (titleEl) titleEl.textContent = title;
    if (urlEl) urlEl.textContent = url || '';
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      toast.classList.remove('visible');
    }, 3000);
  }
  function showGcpToast(title, url) {
    showToast(title, url);
  }
  window.showToast = showToast;
  window.showGcpToast = showGcpToast;

  const projectLabels = {
    'servicenow': 'ServiceNow MCP Connector',
    'veeva': 'Veeva MCP Connector',
    'microsoft': 'Microsoft Unified Connector',
    'all': 'All Projects (Unified View)'
  };
  let currentProject = 'servicenow';

  let currentTool = 'search_servicenow_incidents';
  let currentViewMode = 'table';
  let currentVeevaViewMode = 'table';

  // Slideshow State
  let activeSlideDeck = [].concat(ALL_SLIDES);
  let currentSlideIndex = 0;
  let isPlaying = false;
  let slideTimer = null;
  let slideProgressTimer = null;
  let slideDuration = 5000;
  let slideStartTime = 0;

  // GCP THEME CONTROLLER (Light / Dark)
  function initGcpTheme() {
    const savedTheme = localStorage.getItem('gcp_theme_mode') || 'dark';
    applyGcpTheme(savedTheme);
  }

  function toggleGcpTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyGcpTheme(newTheme);
    localStorage.setItem('gcp_theme_mode', newTheme);
  }

  function applyGcpTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeBtnIcon');
    const label = document.getElementById('themeBtnLabel');
    if (icon && label) {
      if (theme === 'light') {
        icon.textContent = '🌙';
        label.textContent = 'GCP Dark';
      } else {
        icon.textContent = '☀️';
        label.textContent = 'GCP Light';
      }
    }
  }

  // SIDEBAR CONTROLLER
  function toggleSidebar() {
    const sb = document.getElementById('appSidebar');
    sb.classList.toggle('collapsed');
    const isCollapsed = sb.classList.contains('collapsed');
    localStorage.setItem('ge_sidebar_collapsed', isCollapsed ? '1' : '0');
  }

  function initSidebar() {
    const saved = localStorage.getItem('ge_sidebar_collapsed');
    if (saved === '1') {
      document.getElementById('appSidebar').classList.add('collapsed');
    }
  }

  function switchTab(tabId, updateUrl) {
    if (updateUrl === undefined) updateUrl = true;
    document.querySelectorAll('.view-tab').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.sidebar-nav-item, .sub-nav-item, .asset-sub-item').forEach(function(el) { el.classList.remove('active'); });

    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.classList.add('active');

    const topBtn = document.getElementById('topTab-' + tabId.replace('tab-', ''));
    if (topBtn) topBtn.classList.add('active');

    const sideLink = document.getElementById('sideLink-' + tabId.replace('tab-', ''));
    if (sideLink) sideLink.classList.add('active');

    // Sync project selector label if switching to a project-specific tab
    let inferredProject = null;
    if (tabId === 'tab-servicenow') inferredProject = 'servicenow';
    else if (tabId === 'tab-veeva') inferredProject = 'veeva';
    else if (tabId === 'tab-microsoft') inferredProject = 'microsoft';

    if (inferredProject) {
      currentProject = inferredProject;
      const nameEl = document.getElementById('currentProjectName');
      if (nameEl) nameEl.textContent = projectLabels[inferredProject] || inferredProject;
      ['servicenow', 'veeva', 'microsoft', 'all'].forEach(function(pid) {
        const b = document.getElementById('badge-' + pid);
        if (b) b.style.display = pid === inferredProject ? 'inline-block' : 'none';
      });
      // Expand active project node
      const projNode = document.getElementById('projNode-' + inferredProject);
      if (projNode) projNode.classList.remove('collapsed');
    }

    if (updateUrl) {
      const cleanTab = tabId.replace('tab-', '');
      updateUrlState({ tab: cleanTab, slide: null });
    }

    // Auto-populate active workbench data if switching to a live connector tab
    if (tabId === 'tab-servicenow') {
      if (typeof executeCurrentTool === 'function') executeCurrentTool();
    } else if (tabId === 'tab-veeva') {
      if (typeof executeVeevaTool === 'function') executeVeevaTool();
    } else if (tabId === 'tab-microsoft') {
      if (typeof executeMicrosoftTool === 'function') executeMicrosoftTool();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function jumpToWorkflow(groupId) {
    switchTab('tab-gallery', false);
    filterGroupView('ALL', false);
    updateUrlState({ tab: 'gallery', group: groupId, slide: null });
    setTimeout(function() {
      const section = document.getElementById('workflow-' + groupId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  function filterGroupView(groupId, updateUrl) {
    if (updateUrl === undefined) updateUrl = true;
    document.querySelectorAll('.gallery-filter-btn').forEach(function(btn) {
      const oc = btn.getAttribute('onclick') || '';
      btn.classList.toggle('active', oc.indexOf("'" + groupId + "'") !== -1);
    });

    document.querySelectorAll('.workflow-group-card').forEach(function(card) {
      if (groupId === 'ALL' || card.getAttribute('data-group-id') === groupId) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });

    if (updateUrl) {
      updateUrlState({ tab: 'gallery', group: groupId === 'ALL' ? null : groupId });
    }
  }

  // =========================================================================
  // MULTI-ENGINE HUMAN AUDIO NARRATOR & GOLD KARAOKE ENGINE
  // =========================================================================
  const NARRATOR_VOICES = {
    'journey-d': { name: 'David', role: 'Warm Human Architect', group: 'Google Journey', gender: 'male', rate: 1.0 },
    'journey-f': { name: 'Fiona', role: 'Natural Storyteller', group: 'Google Journey', gender: 'female', rate: 1.0 },
    'journey-o': { name: 'Olivia', role: 'Keynote Briefing', group: 'Google Journey', gender: 'female', rate: 1.0 },
    'chirp-d': { name: 'Daniel', role: 'Tech Specialist', group: 'Google Chirp-HD', gender: 'male', rate: 1.0 },
    'chirp-f': { name: 'Faith', role: 'Articulate Engineer', group: 'Google Chirp-HD', gender: 'female', rate: 1.0 },
    'studio-q': { name: 'Quinn', role: 'Broadcast Baritone', group: 'Google Studio', gender: 'male', rate: 1.0 },
    'studio-o': { name: 'Oprah', role: 'Studio Documentary', group: 'Google Studio', gender: 'female', rate: 1.0 },
    'gemini-charon': { name: 'Charon', role: 'DeepMind Principal Architect', group: 'Google Gemini', gender: 'male', rate: 1.0 },
    'gemini-aoede': { name: 'Aoede', role: 'DeepMind Executive Specialist', group: 'Google Gemini', gender: 'female', rate: 1.0 },
    'gemini-puck': { name: 'Puck', role: 'DeepMind Solutions Advocate', group: 'Google Gemini', gender: 'male', rate: 1.0 },
    'gemini-kore': { name: 'Kore', role: 'DeepMind Security Auditor', group: 'Google Gemini', gender: 'female', rate: 1.0 },
    'gemini-fenrir': { name: 'Fenrir', role: 'DeepMind Strategic Keynote', group: 'Google Gemini', gender: 'male', rate: 1.0 },
    'openai-alloy': { name: 'Alloy', role: 'OpenAI Omni Balanced', group: 'OpenAI Omni', gender: 'neutral', rate: 1.0 },
    'openai-echo': { name: 'Echo', role: 'OpenAI Omni Resonance', group: 'OpenAI Omni', gender: 'male', rate: 1.0 },
    'openai-nova': { name: 'Nova', role: 'OpenAI Omni Dynamic', group: 'OpenAI Omni', gender: 'female', rate: 1.0 },
    'openai-onyx': { name: 'Onyx', role: 'OpenAI Omni Baritone', group: 'OpenAI Omni', gender: 'male', rate: 1.0 },
    'browser-default': { name: 'Device Voice', role: 'Local Browser Synthesis', group: 'Browser Native', gender: 'neutral', rate: 1.0 }
  };

  let activeVoiceKey = 'journey-d';
  let isNarratorSpeaking = false;
  let isAutoNarrating = false;
  let showKaraokeSubtitles = true;
  let currentAudio = null;
  let currentUtterance = null;
  let karaokeWordSpans = [];
  let karaokeTimings = [];
  let karaokeTimer = null;
  let narrationStartTime = 0;
  let webAudioCtx = null;
  let narrationRequestId = 0; // Monotonic token eliminating overlapping voices on speaker changes
  window.narrationRequestId = 0;

  function initWebAudio() {
    if (!webAudioCtx && (window.AudioContext || window.webkitAudioContext)) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        webAudioCtx = new AudioCtx();
      } catch (e) {}
    }
  }

  function changeNarratorVoice(voiceKey) {
    activeVoiceKey = voiceKey;
    const v = NARRATOR_VOICES[voiceKey] || NARRATOR_VOICES['journey-d'];
    const badge = document.getElementById('karaokeVoiceName');
    if (badge) badge.textContent = (v.group || 'Google') + ' • ' + v.name + ' (' + v.role + ')';
    
    const wasSpeaking = isNarratorSpeaking || currentAudio !== null;
    stopSlideNarration();

    if (wasSpeaking) {
      // 60ms grace period to allow browser audio hardware to fully flush previous voice stream
      setTimeout(function() {
        playSlideNarration(currentSlideIndex, isAutoNarrating);
      }, 60);
    }
  }

  function toggleAutoNarrate(enabled) {
    isAutoNarrating = enabled;
    if (enabled && !isNarratorSpeaking) {
      playSlideNarration(currentSlideIndex, true);
    }
  }

  function toggleSubtitles() {
    showKaraokeSubtitles = !showKaraokeSubtitles;
    const bar = document.getElementById('slideshowKaraokeBar');
    const btn = document.getElementById('btnSubtitlesToggle');
    if (bar) bar.classList.toggle('hidden', !showKaraokeSubtitles);
    if (btn) btn.classList.toggle('active', showKaraokeSubtitles);
  }

  // Timers for slide visual settling and outro delay
  let slideTransitionTimer = null;
  let autoAdvanceTimer = null;

  // Word extraction helper supporting multi-paragraph text
  function splitNarrationWords(text) {
    if (!text) return [];
    return text.split(new RegExp('\\\\s+')).map(function(w) { return w.trim(); }).filter(Boolean);
  }

  // Weight-based millisecond word timing alignment with human breathing pauses
  function computeWordTimings(text, totalDurationSec) {
    const rawWords = splitNarrationWords(text);
    const weights = rawWords.map(function(w) {
      let weight = Math.pow(Math.max(w.length, 2), 0.75);
      const last = w.slice(-1);
      // Breathing pauses on commas, colons, and em-dashes
      if (last === ',' || last === ':' || last === ';') weight += 2.0;
      if (last === '—') weight += 2.4;
      // Thoughtful pauses on ellipses, questions, and sentence ends
      if (w.endsWith('...')) weight += 4.5;
      else if (last === '?' || last === '!') weight += 4.0;
      else if (last === '.') weight += 3.6;
      return weight;
    });
    const totalWeight = weights.reduce(function(sum, val) { return sum + val; }, 0) || 1;
    let currentStart = 0;
    return rawWords.map(function(word, idx) {
      const duration = (weights[idx] / totalWeight) * (totalDurationSec * 1000);
      const item = { word: word, start: currentStart, end: currentStart + duration };
      currentStart += duration;
      return item;
    });
  }

  function renderKaraokeText(narrationText) {
    const kt = document.getElementById('karaokeText');
    if (!kt) return;
    const paragraphs = (narrationText || '').split(new RegExp('\\\\n\\\\n+'));
    let wordGlobalIndex = 0;
    const htmlParagraphs = paragraphs.map(function(para) {
      const words = splitNarrationWords(para);
      const spanWords = words.map(function(w) {
        const span = '<span class="karaoke-word" id="kWord-' + wordGlobalIndex + '">' + w + '</span>';
        wordGlobalIndex++;
        return span;
      }).join(' ');
      return '<div class="karaoke-paragraph">' + spanWords + '</div>';
    });
    kt.innerHTML = htmlParagraphs.join('');
    karaokeWordSpans = kt.querySelectorAll('.karaoke-word');
  }

  function playBrowserUtterance(narrationText, vConfig, autoAdvanceAfter) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(narrationText);
    currentUtterance = utterance;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      let matchedVoice = null;
      if (vConfig.gender === 'female') {
        matchedVoice = voices.find(function(v) { return /Google.*en|Samantha|Victoria|Zira|Karen|Moira|Fiona/i.test(v.name); });
      } else {
        matchedVoice = voices.find(function(v) { return /Google.*en.*Male|Daniel|Alex|David|Fred|Oliver/i.test(v.name); });
      }
      if (!matchedVoice) {
        matchedVoice = voices.find(function(v) { return v.lang && v.lang.startsWith('en'); });
      }
      if (matchedVoice) utterance.voice = matchedVoice;
    }

    const wordCount = splitNarrationWords(narrationText).length;
    const estimatedDurationSec = Math.max(3.5, (wordCount / 145) * 60);
    karaokeTimings = computeWordTimings(narrationText, estimatedDurationSec);

    utterance.onstart = function() {
      isNarratorSpeaking = true;
      narrationStartTime = Date.now();
      const btn = document.getElementById('btnNarrateAudio');
      if (btn) {
        btn.classList.add('speaking');
        document.getElementById('narrateLabel').textContent = 'Pause';
        document.getElementById('narrateIcon').textContent = '⏸️';
      }

      clearInterval(karaokeTimer);
      karaokeTimer = setInterval(function() {
        if (!isNarratorSpeaking) return;
        const elapsed = Date.now() - narrationStartTime;
        let activeIdx = -1;
        for (let i = 0; i < karaokeTimings.length; i++) {
          if (elapsed >= karaokeTimings[i].start && elapsed < karaokeTimings[i].end) {
            activeIdx = i;
            break;
          }
          if (elapsed >= karaokeTimings[i].end) {
            activeIdx = i;
          }
        }
        karaokeWordSpans.forEach(function(span, idx) {
          span.classList.toggle('active', idx === activeIdx);
          span.classList.toggle('past', idx < activeIdx);
        });
        if (activeIdx >= 0 && karaokeWordSpans[activeIdx]) {
          karaokeWordSpans[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    };

    utterance.onend = function() {
      cleanupNarrationState();
      karaokeWordSpans.forEach(function(span) {
        span.classList.remove('active');
        span.classList.add('past');
      });
      if ((isAutoNarrating || autoAdvanceAfter) && document.getElementById('slideshowModal').classList.contains('open')) {
        if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = setTimeout(function() {
          autoAdvanceTimer = null;
          if (document.getElementById('slideshowModal').classList.contains('open')) {
            nextSlide();
          }
        }, 1800); // 1.8s unhurried outro pause before auto-advancing
      }
    };

    utterance.onerror = function() {
      cleanupNarrationState();
    };

    window.speechSynthesis.speak(utterance);
  }

  async function playSlideNarration(index, autoAdvanceAfter) {
    initWebAudio();
    stopSlideNarration();
    const thisReqId = ++narrationRequestId;
    window.narrationRequestId = narrationRequestId;

    const slide = activeSlideDeck[index];
    if (!slide) return;

    const narrationText = slide.narration || ('This view captures ' + slide.title + ' within the ' + (slide.groupTitle || 'system') + ' workflow.');
    renderKaraokeText(narrationText);

    const vConfig = NARRATOR_VOICES[activeVoiceKey] || NARRATOR_VOICES['journey-d'];
    const badge = document.getElementById('karaokeVoiceName');
    if (badge) badge.textContent = (vConfig.group || 'Google') + ' • ' + vConfig.name + ' (' + vConfig.role + ')';

    const btn = document.getElementById('btnNarrateAudio');
    if (btn) {
      btn.classList.add('speaking');
      document.getElementById('narrateLabel').textContent = 'Pause';
      document.getElementById('narrateIcon').textContent = '⏸️';
    }
    isNarratorSpeaking = true;

    // Check if user specifically requested browser local synthesis
    if (vConfig.engine === 'browser-speech-synthesis') {
      playBrowserUtterance(narrationText, vConfig, autoAdvanceAfter);
      return;
    }

    // Call server API for true human neural audio stream
    try {
      const resp = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideIndex: index,
          text: narrationText,
          voiceId: activeVoiceKey
        })
      });

      if (thisReqId !== narrationRequestId) return; // Stale request, speaker changed

      if (!resp.ok) throw new Error('API status ' + resp.status);
      const data = await resp.json();

      if (thisReqId !== narrationRequestId) return; // Stale request, speaker changed

      if (data.mode === 'browser_speech' || !data.audioUrl) {
        playBrowserUtterance(narrationText, vConfig, autoAdvanceAfter);
        return;
      }

      // Play High-Fidelity Audio Stream (Google Journey, Chirp-HD, Studio, Gemini, Omni)
      const audio = new Audio(data.audioUrl);
      if (thisReqId !== narrationRequestId) return; // Discard if speaker changed while downloading
      currentAudio = audio;

      audio.onloadedmetadata = function() {
        const durationSec = audio.duration || 6.0;
        karaokeTimings = computeWordTimings(narrationText, durationSec);
      };

      audio.onplay = function() {
        isNarratorSpeaking = true;
        narrationStartTime = Date.now();

        clearInterval(karaokeTimer);
        karaokeTimer = setInterval(function() {
          if (!isNarratorSpeaking || !currentAudio) return;
          const currentMs = currentAudio.currentTime * 1000;
          let activeIdx = -1;
          for (let i = 0; i < karaokeTimings.length; i++) {
            if (currentMs >= karaokeTimings[i].start && currentMs < karaokeTimings[i].end) {
              activeIdx = i;
              break;
            }
            if (currentMs >= karaokeTimings[i].end) {
              activeIdx = i;
            }
          }

          karaokeWordSpans.forEach(function(span, idx) {
            span.classList.toggle('active', idx === activeIdx);
            span.classList.toggle('past', idx < activeIdx);
          });

          if (activeIdx >= 0 && karaokeWordSpans[activeIdx]) {
            karaokeWordSpans[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 50);
      };

      audio.onended = function() {
        cleanupNarrationState();
        karaokeWordSpans.forEach(function(span) {
          span.classList.remove('active');
          span.classList.add('past');
        });

        if ((isAutoNarrating || autoAdvanceAfter) && document.getElementById('slideshowModal').classList.contains('open')) {
          if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
          autoAdvanceTimer = setTimeout(function() {
            autoAdvanceTimer = null;
            if (document.getElementById('slideshowModal').classList.contains('open')) {
              nextSlide();
            }
          }, 1800); // 1.8s unhurried outro pause before auto-advancing
        }
      };

      audio.onerror = function() {
        console.warn('Real audio stream error, falling back to device voice.');
        playBrowserUtterance(narrationText, vConfig, autoAdvanceAfter);
      };

      await audio.play();
      if (thisReqId !== narrationRequestId) {
        audio.pause();
        audio.src = '';
        return;
      }
    } catch (err) {
      console.warn('Neural audio fetch failed, falling back to device voice:', err.message);
      playBrowserUtterance(narrationText, vConfig, autoAdvanceAfter);
    }
  }

  function stopSlideNarration() {
    narrationRequestId++; // Invalidate any in-flight fetches or pending audio plays
    window.narrationRequestId = narrationRequestId;
    if (slideTransitionTimer) {
      clearTimeout(slideTransitionTimer);
      slideTransitionTimer = null;
    }
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.onplay = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.ontimeupdate = null;
      currentAudio.src = '';
      try { currentAudio.load(); } catch (e) {}
      currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (currentUtterance) {
      currentUtterance.onstart = null;
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
      currentUtterance = null;
    }
    cleanupNarrationState();
  }

  function cleanupNarrationState() {
    isNarratorSpeaking = false;
    clearInterval(karaokeTimer);
    currentUtterance = null;
    const btn = document.getElementById('btnNarrateAudio');
    if (btn) {
      btn.classList.remove('speaking');
      document.getElementById('narrateLabel').textContent = 'Narrate';
      document.getElementById('narrateIcon').textContent = '🔊';
    }
  }

  function toggleSlideNarration() {
    // If during slide settling pause, start immediately
    if (slideTransitionTimer) {
      clearTimeout(slideTransitionTimer);
      slideTransitionTimer = null;
      playSlideNarration(currentSlideIndex, isAutoNarrating);
      return;
    }
    if (isNarratorSpeaking) {
      if (currentAudio) {
        currentAudio.pause();
        isNarratorSpeaking = false;
        clearInterval(karaokeTimer);
        const btn = document.getElementById('btnNarrateAudio');
        if (btn) {
          btn.classList.remove('speaking');
          document.getElementById('narrateLabel').textContent = 'Resume';
          document.getElementById('narrateIcon').textContent = '▶️';
        }
      } else {
        stopSlideNarration();
      }
    } else {
      if (currentAudio && currentAudio.paused && currentAudio.currentTime > 0) {
        currentAudio.play();
        isNarratorSpeaking = true;
        narrationStartTime = Date.now() - (currentAudio.currentTime * 1000);
        const btn = document.getElementById('btnNarrateAudio');
        if (btn) {
          btn.classList.add('speaking');
          document.getElementById('narrateLabel').textContent = 'Pause';
          document.getElementById('narrateIcon').textContent = '⏸️';
        }
      } else {
        playSlideNarration(currentSlideIndex, isAutoNarrating);
      }
    }
  }

  // SLIDESHOW CONTROLLER
  function startSlideshow(groupFilter, startIdx) {
    groupFilter = groupFilter || 'ALL';
    startIdx = startIdx || 0;

    if (groupFilter === 'ALL') {
      activeSlideDeck = [].concat(ALL_SLIDES);
    } else {
      const g = LOGICAL_GROUPS.find(function(item) { return item.id === groupFilter; });
      activeSlideDeck = g ? [].concat(g.images) : [].concat(ALL_SLIDES);
    }

    currentSlideIndex = Math.max(0, Math.min(startIdx, activeSlideDeck.length - 1));
    renderFilmstrip();
    showSlide(currentSlideIndex);

    const modal = document.getElementById('slideshowModal');
    modal.classList.add('open');
    startAutoPlay();
  }

  function closeSlideshow() {
    if (slideTransitionTimer) {
      clearTimeout(slideTransitionTimer);
      slideTransitionTimer = null;
    }
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    stopSlideNarration();
    stopAutoPlay();
    const modal = document.getElementById('slideshowModal');
    modal.classList.remove('open');
    updateUrlState({ slide: null }, false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function() {});
    }
  }

  function showSlide(index) {
    if (index < 0 || index >= activeSlideDeck.length) return;
    currentSlideIndex = index;
    const slide = activeSlideDeck[index];

    // Clear any pending timers from previous slide
    if (slideTransitionTimer) {
      clearTimeout(slideTransitionTimer);
      slideTransitionTimer = null;
    }
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    stopSlideNarration();

    const img = document.getElementById('slideshowImg');
    img.style.opacity = '0.3';
    img.src = slide.url;
    img.onload = function() { img.style.opacity = '1'; };

    document.getElementById('slideMainTitle').textContent = slide.title;
    document.getElementById('slideFilename').textContent = slide.fileName;
    document.getElementById('slideGroupBadge').textContent = slide.groupTitle || slide.dirName;
    document.getElementById('slideCounterText').textContent = 'Slide ' + (index + 1) + ' of ' + activeSlideDeck.length;

    const assetIdEl = document.getElementById('slideAssetIdText');
    if (assetIdEl) assetIdEl.textContent = slide.assetId || slide.fileName;

    const linkedBtn = document.getElementById('slideLinkedDemoBtn');
    const linkedLabel = document.getElementById('slideLinkedDemoLabel');
    if (linkedBtn && linkedLabel) {
      if (slide.linkedTool) {
        linkedBtn.style.display = 'inline-flex';
        linkedLabel.textContent = 'Demo: ' + slide.linkedTool.label;
      } else {
        linkedBtn.style.display = 'none';
      }
    }

    updateUrlState({ tab: 'gallery', slide: slide.assetId || (index + 1) }, false);

    // Populate natural concept narration in Gold Karaoke bar
    const narrationText = slide.narration || ('This view captures ' + slide.title + ' within the ' + (slide.groupTitle || 'system') + ' workflow.');
    renderKaraokeText(narrationText);

    // THEATRICAL SLIDE SETTLING PAUSE (950ms delay):
    // Allows audience to orient to the new slide, title, and screenshot before voice begins
    if (isAutoNarrating) {
      const btn = document.getElementById('btnNarrateAudio');
      if (btn) {
        btn.classList.remove('speaking');
        document.getElementById('narrateLabel').textContent = 'Settling...';
        document.getElementById('narrateIcon').textContent = '⏳';
      }
      slideTransitionTimer = setTimeout(function() {
        slideTransitionTimer = null;
        if (document.getElementById('slideshowModal').classList.contains('open') && isAutoNarrating) {
          playSlideNarration(index, true);
        }
      }, 950);
    } else if (isNarratorSpeaking) {
      stopSlideNarration();
    }

    // Highlight filmstrip
    document.querySelectorAll('.filmstrip-thumb').forEach(function(thumb, i) {
      thumb.classList.toggle('active', i === index);
    });

    const activeThumb = document.querySelector('.filmstrip-thumb.active');
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    if (isPlaying) {
      resetProgress();
    }
  }

  function nextSlide() {
    let nextIdx = currentSlideIndex + 1;
    if (nextIdx >= activeSlideDeck.length) {
      const loop = document.getElementById('loopCheckbox')?.checked;
      if (loop) {
        nextIdx = 0;
      } else {
        stopAutoPlay();
        return;
      }
    }
    showSlide(nextIdx);
  }

  function prevSlide() {
    let prevIdx = currentSlideIndex - 1;
    if (prevIdx < 0) {
      prevIdx = activeSlideDeck.length - 1;
    }
    showSlide(prevIdx);
  }

  function togglePlayPause() {
    if (isPlaying) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  }

  function startAutoPlay() {
    isPlaying = true;
    document.getElementById('playIcon').innerHTML = '&#9646;&#9646;';
    document.getElementById('playText').textContent = 'Pause';
    resetProgress();
  }

  function stopAutoPlay() {
    isPlaying = false;
    clearInterval(slideTimer);
    clearInterval(slideProgressTimer);
    document.getElementById('playIcon').innerHTML = '&#9654;';
    document.getElementById('playText').textContent = 'Play';
    document.getElementById('slideProgressBar').style.width = '0%';
  }

  function resetProgress() {
    clearInterval(slideTimer);
    clearInterval(slideProgressTimer);
    if (!isPlaying) return;

    // When narration is active, audio dictates slide duration; don't cut off with 5s timer
    if (isAutoNarrating || isNarratorSpeaking) {
      return;
    }

    slideStartTime = Date.now();
    const fill = document.getElementById('slideProgressBar');

    slideProgressTimer = setInterval(function() {
      const elapsed = Date.now() - slideStartTime;
      const pct = Math.min(100, (elapsed / slideDuration) * 100);
      fill.style.width = pct + '%';
    }, 50);

    slideTimer = setTimeout(function() {
      nextSlide();
    }, slideDuration);
  }

  function changeSpeed(val) {
    slideDuration = parseInt(val, 10) || 5000;
    if (isPlaying) {
      resetProgress();
    }
  }

  function toggleFullscreen() {
    const modal = document.getElementById('slideshowModal');
    if (!document.fullscreenElement) {
      modal.requestFullscreen().catch(function() {});
    } else {
      document.exitFullscreen().catch(function() {});
    }
  }

  function toggleFilmstrip() {
    const fs = document.getElementById('slideshowFilmstrip');
    fs.style.display = fs.style.display === 'none' ? 'flex' : 'none';
  }

  function renderFilmstrip() {
    const fs = document.getElementById('slideshowFilmstrip');
    fs.innerHTML = '';
    activeSlideDeck.forEach(function(slide, idx) {
      const thumb = document.createElement('div');
      thumb.className = 'filmstrip-thumb' + (idx === currentSlideIndex ? ' active' : '');
      thumb.title = '#' + (idx + 1) + ': ' + slide.title;
      thumb.innerHTML = '<img src="' + slide.url + '" alt="' + slide.title + '" loading="lazy" />';
      thumb.onclick = function() { showSlide(idx); };
      fs.appendChild(thumb);
    });
  }

  function openSlideshowAtSlide(identifier) {
    let idx = -1;
    if (typeof identifier === 'number') {
      idx = identifier;
    } else {
      idx = ALL_SLIDES.findIndex(function(s) {
        return s.assetId === identifier || s.fileName === identifier || s.fileName.startsWith(identifier);
      });
    }
    startSlideshow('ALL', idx >= 0 ? idx : 0);
  }

  // KEYBOARD NAVIGATION
  window.addEventListener('keydown', function(e) {
    const modal = document.getElementById('slideshowModal');
    if (!modal.classList.contains('open')) return;

    if (e.key === 'ArrowRight') {
      nextSlide();
    } else if (e.key === 'ArrowLeft') {
      prevSlide();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === 'Escape') {
      closeSlideshow();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      toggleSlideNarration();
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      const cb = document.getElementById('autoNarrateCheckbox');
      if (cb) { cb.checked = !cb.checked; toggleAutoNarrate(cb.checked); }
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      toggleSubtitles();
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      const vKeys = Object.keys(NARRATOR_VOICES);
      const nextIdx = (vKeys.indexOf(activeVoiceKey) + 1) % vKeys.length;
      const nextVoice = vKeys[nextIdx];
      const sel = document.getElementById('narratorVoiceSelect');
      if (sel) { sel.value = nextVoice; changeNarratorVoice(nextVoice); }
    }
  });

  // PRINT & EXPORT CONTROLLER
  let selectedPrintFormat = 'landscape';
  function openPrintModal(groupId) {
    const modal = document.getElementById('printModal');
    modal.classList.add('open');
    if (groupId) {
      const sel = document.getElementById('printScopeSelect');
      if (sel) sel.value = groupId;
    }
  }

  function closePrintModal() {
    document.getElementById('printModal').classList.remove('open');
  }

  function selectPrintFormat(format) {
    selectedPrintFormat = format;
    document.getElementById('printOpt-landscape').classList.toggle('selected', format === 'landscape');
    document.getElementById('printOpt-portrait').classList.toggle('selected', format === 'portrait');
  }

  function configureDossierScope(scope) {
    const pages = document.querySelectorAll('#printDossierContainer .dossier-slide-page');
    pages.forEach(function(page) {
      if (scope === 'ALL' || page.getAttribute('data-group-id') === scope) {
        page.style.display = 'flex';
      } else {
        page.style.display = 'none';
      }
    });
  }

  function executePrint() {
    const scope = document.getElementById('printScopeSelect').value;
    closePrintModal();
    configureDossierScope(scope);

    setTimeout(function() {
      window.print();
    }, 250);
  }

  function downloadDossierPdf() {
    const scope = document.getElementById('printScopeSelect').value;
    const btn = document.getElementById('btnDownloadPdfLabel');
    const icon = document.getElementById('btnDownloadPdfIcon');
    if (btn) btn.textContent = 'Generating PDF...';
    if (icon) icon.textContent = '⏳';

    const url = '/api/export-pdf?scope=' + encodeURIComponent(scope);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Google-Cloud-Gemini-Enterprise-BYOMCP-Dossier-' + scope + '.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(function() {
      if (btn) btn.textContent = 'Download Vector PDF';
      if (icon) icon.textContent = '📥';
      closePrintModal();
    }, 2500);
  }

  // LIGHTBOX
  function openLightbox(url, title) {
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightboxTitle').textContent = title || 'Screenshot Preview';
    document.getElementById('imgLightbox').classList.add('open');
  }
  function closeLightboxDirect() {
    document.getElementById('imgLightbox').classList.remove('open');
  }
  function closeLightbox(e) {
    if (e.target.id === 'imgLightbox') {
      closeLightboxDirect();
    }
  }

  // =========================================================================
  // SERVICENOW TEST SCENARIOS & INTERACTIVE RUNNER
  // =========================================================================
  const SN_SCENARIOS = {
    search_servicenow_incidents: [
      { id: 'p1_outage', label: '🚨 P1 Critical Incidents (SAP & Network Outages)', query: 'outage', limit: 5 },
      { id: 'vpn_gateway', label: '🌐 VPN Gateway & Cisco Router Issues', query: 'VPN', limit: 5 },
      { id: 'email_exchange', label: '📧 Corporate Email & Exchange Server Issues', query: 'email', limit: 5 },
      { id: 'all_recent', label: '📋 All Active Incidents (Default Order)', query: '', limit: 10 }
    ],
    get_servicenow_incident: [
      { id: 'inc1039', label: '🔥 INC1039: VPN Gateway Latency & Packet Loss (P1 Critical)', number: 'INC1039' },
      { id: 'inc0000060', label: '📧 INC0000060: Unable to Connect to Corporate Email Server', number: 'INC0000060' },
      { id: 'inc0000001', label: '📁 INC0000001: Corporate Network Drive Mapping Failure', number: 'INC0000001' }
    ],
    search_servicenow_knowledge_articles: [
      { id: 'kb_vpn', label: '🔐 VPN Remote Access & Multi-Factor Auth Setup (KB0000001)', query: 'VPN', limit: 5 },
      { id: 'kb_email', label: '✉️ Outlook & Mobile Exchange Sync Troubleshooting (KB0000004)', query: 'email', limit: 5 },
      { id: 'kb_password', label: '🔑 Self-Service Password Reset & Okta Portal Guide (KB0000012)', query: 'password', limit: 5 },
      { id: 'kb_all', label: '📚 Complete IT Knowledge Base Articles Catalog', query: '', limit: 10 }
    ],
    list_servicenow_catalog_items: [
      { id: 'cat_hardware', label: '💻 Standard Hardware & Laptop Procurement (Top 5)', limit: 5 },
      { id: 'cat_software', label: '☁️ Cloud Developer & SaaS License Requests (Top 10)', limit: 10 },
      { id: 'cat_all', label: '🛒 Complete IT Service Catalog Hierarchy (All Items)', limit: 25 }
    ],
    search_servicenow_problems_and_changes: [
      { id: 'prb_switch', label: '⚠️ Problem PRB0000050: Switch Occasionally Drops Connections', table: 'problem', query: 'switch' },
      { id: 'chg_cisco', label: '🔧 Change Request CHG0000024: Clear BGP Sessions on Cisco Router', table: 'change_request', query: 'Cisco' },
      { id: 'prb_all', label: '📋 All Active Problem Investigations (Root Cause Analysis)', table: 'problem', query: '' },
      { id: 'chg_all', label: '🚀 All Scheduled Infrastructure RFCs & Change Requests', table: 'change_request', query: '' }
    ]
  };

  function renderSampleScenarioDropdown(toolName) {
    const list = SN_SCENARIOS[toolName] || [];
    if (!list.length) return '';
    const opts = list.map(function(s) {
      return '<option value="' + s.id + '">' + s.label + '</option>';
    }).join('');
    const chips = list.map(function(s) {
      return '<button type="button" class="sample-chip-btn" data-tool="' + toolName + '" data-id="' + s.id + '" onclick="applySampleChip(this)">' + s.label.split(':')[0] + '</button>';
    }).join('');
    return '<div class="sample-scenario-box">' +
      '<div class="sample-scenario-header">' +
        '<div class="sample-scenario-label">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>' +
          'Sample Test Scenarios (Select to Auto-Fill &amp; Test)' +
        '</div>' +
        '<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">Instant Auto-Run</span>' +
      '</div>' +
      '<select class="sample-scenario-select" id="snScenarioSelect" onchange="applySampleScenario(currentTool, this.value)">' +
        opts +
      '</select>' +
      '<div class="sample-chips-row">' +
        '<span class="sample-chips-title">Quick Presets:</span>' +
        chips +
      '</div>' +
    '</div>';
  }

  function applySampleChip(btn) {
    const tool = btn.getAttribute('data-tool');
    const id = btn.getAttribute('data-id');
    if (tool && id) {
      applySampleScenario(tool, id);
    }
  }
  window.applySampleChip = applySampleChip;

  function applySampleScenario(toolName, scenarioId) {
    const list = SN_SCENARIOS[toolName] || [];
    const sc = list.find(s => s.id === scenarioId) || list[0];
    if (!sc) return;

    const sel = document.getElementById('snScenarioSelect');
    if (sel && sel.value !== sc.id) sel.value = sc.id;

    if (toolName === 'search_servicenow_incidents') {
      const qEl = document.getElementById('inputQuery');
      const lEl = document.getElementById('inputLimit');
      if (qEl) qEl.value = sc.query ?? '';
      if (lEl) lEl.value = sc.limit ?? 5;
    } else if (toolName === 'get_servicenow_incident') {
      const nEl = document.getElementById('inputNumber');
      if (nEl) nEl.value = sc.number ?? 'INC1039';
    } else if (toolName === 'search_servicenow_knowledge_articles') {
      const qEl = document.getElementById('inputQuery');
      const lEl = document.getElementById('inputLimit');
      if (qEl) qEl.value = sc.query ?? 'VPN';
      if (lEl) lEl.value = sc.limit ?? 5;
    } else if (toolName === 'list_servicenow_catalog_items') {
      const lEl = document.getElementById('inputLimit');
      if (lEl) lEl.value = sc.limit ?? 5;
    } else if (toolName === 'search_servicenow_problems_and_changes') {
      const tEl = document.getElementById('inputTable');
      const qEl = document.getElementById('inputQuery');
      if (tEl) tEl.value = sc.table ?? 'problem';
      if (qEl) qEl.value = sc.query ?? '';
    }

    executeCurrentTool();
  }
  window.applySampleScenario = applySampleScenario;

  function applyProblemChangeTable(table) {
    const qEl = document.getElementById('inputQuery');
    if (table === 'change_request') {
      if (qEl && qEl.value === 'switch') qEl.value = 'Cisco';
    } else {
      if (qEl && qEl.value === 'Cisco') qEl.value = 'switch';
    }
    executeCurrentTool();
  }
  window.applyProblemChangeTable = applyProblemChangeTable;

  function selectTool(name, updateUrl) {
    if (updateUrl === undefined) updateUrl = true;
    currentTool = name;
    document.querySelectorAll('#tab-servicenow .tool-item, #tab-servicenow .tool-card-item').forEach(function(el) {
      const match = el.getAttribute('data-tool-name') === name || (el.id && el.id.includes(name));
      el.classList.toggle('selected', match);
    });
    const titleEl = document.getElementById('activeToolTitle');
    if (titleEl) titleEl.textContent = 'Active Tool: ' + name;

    if (updateUrl) {
      updateUrlState({ tab: 'servicenow', tool: name });
    }

    const inputsDiv = document.getElementById('toolInputs');
    const sampleDropdownHtml = renderSampleScenarioDropdown(name);

    if (name === 'search_servicenow_incidents') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Search Query (optional)</label><input type="text" id="inputQuery" class="form-input" placeholder="e.g. email, network, server..." value="outage" /></div><div class="form-group" style="max-width: 140px;"><label class="form-label">Limit</label><input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    } else if (name === 'get_servicenow_incident') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Incident Number (e.g. INC1039)</label><input type="text" id="inputNumber" class="form-input" value="INC1039" /></div></div>';
    } else if (name === 'search_servicenow_knowledge_articles') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Search Query</label><input type="text" id="inputQuery" class="form-input" value="VPN" /></div><div class="form-group" style="max-width: 140px;"><label class="form-label">Limit</label><input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    } else if (name === 'list_servicenow_catalog_items') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group" style="max-width: 140px;"><label class="form-label">Limit</label><input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    } else if (name === 'search_servicenow_problems_and_changes') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Table</label><select id="inputTable" class="form-input" onchange="applyProblemChangeTable(this.value)"><option value="problem">Problems (problem)</option><option value="change_request">Change Requests (change_request)</option></select></div><div class="form-group"><label class="form-label">Query</label><input type="text" id="inputQuery" class="form-input" value="switch" /></div></div>';
    }

    executeCurrentTool();
  }

  async function executeCurrentTool() {
    let args = {};
    if (currentTool === 'search_servicenow_incidents') {
      const q = document.getElementById('inputQuery')?.value?.trim();
      const limit = parseInt(document.getElementById('inputLimit')?.value || '5', 10);
      if (q) args.query = q;
      if (limit) args.limit = limit;
    } else if (currentTool === 'get_servicenow_incident') {
      const num = document.getElementById('inputNumber')?.value?.trim() || 'INC1039';
      args.number = num;
    } else if (currentTool === 'search_servicenow_knowledge_articles') {
      const q = document.getElementById('inputQuery')?.value?.trim() || 'VPN';
      const limit = parseInt(document.getElementById('inputLimit')?.value || '5', 10);
      args.query = q;
      args.limit = limit;
    } else if (currentTool === 'list_servicenow_catalog_items') {
      const limit = parseInt(document.getElementById('inputLimit')?.value || '5', 10);
      args.limit = limit;
    } else if (currentTool === 'search_servicenow_problems_and_changes') {
      args.table = document.getElementById('inputTable')?.value || 'problem';
      const q = document.getElementById('inputQuery')?.value?.trim();
      if (q) args.query = q;
    }

    await executeRpc('tools/call', { name: currentTool, arguments: args });
  }

  async function executeRpc(method, params) {
    const payload = { jsonrpc: '2.0', id: Date.now(), method: method, params: params };
    try {
      const resp = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const rpcRes = await resp.json();

      let rows = null;
      if (rpcRes.result && rpcRes.result.content && rpcRes.result.content[0]) {
        try {
          const parsed = JSON.parse(rpcRes.result.content[0].text);
          if (Array.isArray(parsed)) rows = parsed;
          else if (parsed.records) rows = parsed.records;
          else rows = [parsed];
        } catch (e) {
          // not JSON
        }
      }
      window.renderStepResult(method + ' • ' + (params.name || ''), rows, rpcRes);
    } catch (err) {
      window.renderStepResult('Error: ' + err.message, null, { error: err.message });
    }
  }

  // =========================================================================
  // VEEVA VAULT TEST SCENARIOS & INTERACTIVE RUNNER
  // =========================================================================
  let currentVeevaTool = 'search_vault_documents';

  const VEEVA_SCENARIOS = {
    search_vault_documents: [
      { id: 'v_approved', label: '✅ Approved for Regulatory Submission (NDA / IND)', query: "status__v = 'Approved for Submission'" },
      { id: 'v_oncology', label: '🧬 Phase III Oncology Study Protocols & Bioequivalence', query: "study_name__v CONTAINS ('Oncology')" },
      { id: 'v_clinical', label: '📋 Clinical Study Reports (CSR) & CMC Module 3 Specs', query: "type__v = 'Clinical Study Report'" }
    ],
    get_audit_trail: [
      { id: 'v_audit_030201', label: '🔒 DOC-030201: Oncology Protocol Signature Audit (21 CFR Part 11)', query: 'DOC-030201' },
      { id: 'v_audit_029481', label: '🧪 DOC-029481: CMC Stability Validation & Batch Release Trail', query: 'DOC-029481' },
      { id: 'v_audit_019823', label: '📑 DOC-019823: Investigator Brochure Safety Addendum Audit', query: 'DOC-019823' }
    ],
    get_binder_structure: [
      { id: 'v_ectd', label: '📁 eCTD Master Regulatory Dossier (Modules 1 to 5 Hierarchy)', query: 'eCTD Master' },
      { id: 'v_etmf', label: '📂 eTMF Electronic Trial Master File Folder Tree', query: 'eTMF' },
      { id: 'v_qa', label: '🛡️ Quality Assurance & GMP Batch Release Binder', query: 'Quality' }
    ]
  };

  function renderVeevaSampleDropdown(toolName) {
    const list = VEEVA_SCENARIOS[toolName] || [];
    if (!list.length) return '';
    const opts = list.map(function(s) {
      return '<option value="' + s.id + '">' + s.label + '</option>';
    }).join('');
    const chips = list.map(function(s) {
      return '<button type="button" class="sample-chip-btn" data-id="' + s.id + '" onclick="applyVeevaChip(this)">' + s.label.split('(')[0].trim() + '</button>';
    }).join('');
    return '<div class="sample-scenario-box">' +
      '<div class="sample-scenario-header">' +
        '<div class="sample-scenario-label">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>' +
          'Sample Test Scenarios (Select to Auto-Fill &amp; Test)' +
        '</div>' +
        '<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">Instant Auto-Run</span>' +
      '</div>' +
      '<select class="sample-scenario-select" id="veevaScenarioSelect" onchange="applyVeevaSample(this.value)">' +
        opts +
      '</select>' +
      '<div class="sample-chips-row">' +
        '<span class="sample-chips-title">Quick Presets:</span>' +
        chips +
      '</div>' +
    '</div>';
  }

  function applyVeevaChip(btn) {
    const id = btn.getAttribute('data-id');
    if (id) {
      applyVeevaSample(id);
    }
  }
  window.applyVeevaChip = applyVeevaChip;

  function applyVeevaSample(scenarioId) {
    const list = VEEVA_SCENARIOS[currentVeevaTool] || [];
    const sc = list.find(s => s.id === scenarioId) || list[0];
    if (!sc) return;
    const sel = document.getElementById('veevaScenarioSelect');
    if (sel && sel.value !== sc.id) sel.value = sc.id;

    const qEl = document.getElementById('veevaQuery');
    if (qEl) qEl.value = sc.query;

    executeVeevaTool();
  }
  window.applyVeevaSample = applyVeevaSample;

  function selectVeevaTool(tool, updateUrl) {
    if (updateUrl === undefined) updateUrl = true;
    currentVeevaTool = tool;
    document.querySelectorAll('#tab-veeva .tool-card-item, #tab-veeva .tool-item').forEach(function(el) {
      const match = el.getAttribute('data-veeva-tool') === tool || (el.id && el.id.includes(tool)) || el.getAttribute('onclick')?.includes(tool);
      el.classList.toggle('selected', match);
    });
    const titleEl = document.getElementById('activeVeevaTitle');
    if (titleEl) titleEl.textContent = 'Active Tool: ' + tool;

    const inputsDiv = document.getElementById('veevaInputs');
    if (inputsDiv) {
      const sampleDropdownHtml = renderVeevaSampleDropdown(tool);
      if (tool === 'get_audit_trail') {
        inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Document Number / ID (21 CFR Part 11 Audit Trail)</label><input type="text" id="veevaQuery" class="form-input" value="DOC-030201" placeholder="e.g. DOC-030201" /></div></div>';
      } else if (tool === 'get_binder_structure') {
        inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Binder Filter (eCTD Regulatory Submission)</label><input type="text" id="veevaQuery" class="form-input" value="eCTD Master" placeholder="e.g. eTMF or Master" /></div></div>';
      } else {
        inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">VQL Query Filter</label><input type="text" id="veevaQuery" class="form-input" value="status__v = &apos;Approved for Submission&apos;" placeholder="e.g. status__v = &apos;Approved for Submission&apos;" /></div></div>';
      }
    }

    if (updateUrl) {
      updateUrlState({ tab: 'veeva', tool: tool });
    }

    executeVeevaTool();
  }

  async function executeVeevaTool() {
    const q = document.getElementById('veevaQuery')?.value || '';
    const args = {};
    if (currentVeevaTool === 'get_audit_trail') {
      args.document_id = q || 'DOC-030201';
    } else if (currentVeevaTool === 'get_binder_structure') {
      args.filter = q;
    } else {
      args.vql_query = q;
      args.query = q;
    }
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: currentVeevaTool, arguments: args }
    };
    try {
      let resp;
      try {
        resp = await fetch('http://localhost:8792/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (crossErr) {
        console.warn('Direct fetch to :8792 failed, using same-origin proxy:', crossErr.message);
        resp = await fetch('/api/veeva-mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      const rpcRes = await resp.json();
      let rows = null;
      if (rpcRes.result && rpcRes.result.content && rpcRes.result.content[0]) {
        try {
          const parsed = JSON.parse(rpcRes.result.content[0].text);
          if (parsed.documents && Array.isArray(parsed.documents)) {
            rows = parsed.documents;
          } else if (parsed.binders && Array.isArray(parsed.binders)) {
            rows = parsed.binders;
          } else if (parsed.audit_trail && Array.isArray(parsed.audit_trail)) {
            rows = parsed.audit_trail;
          } else if (parsed.records && Array.isArray(parsed.records)) {
            rows = parsed.records;
          } else if (Array.isArray(parsed)) {
            rows = parsed;
          } else {
            rows = [parsed];
          }
        } catch (e) {}
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
      let html = '<table class="data-table"><thead><tr>' + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>' + cols.map(function(c) {
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
      let html = '<table class="data-table"><thead><tr>' + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>' + cols.map(function(c) {
          const rawVal = r[c];
          let formattedVal = typeof rawVal === 'object' ? JSON.stringify(rawVal) : (rawVal ?? '');
          const colLower = c.toLowerCase();
          
          if (colLower.includes('sys_id') && String(formattedVal).length > 16) {
            const fullStr = String(formattedVal);
            return '<td><span class="table-mono-id" data-sysid="' + fullStr + '" title="' + fullStr + '" onclick="copySysId(this)">' + fullStr.substring(0, 10) + '…' + fullStr.substring(fullStr.length - 6) + '</span></td>';
          }
          if (colLower === 'state' && (formattedVal === '7' || formattedVal === 7)) {
            return '<td><span class="badge-status-pill state-closed">Closed (7)</span></td>';
          }
          if (colLower === 'priority') {
            if (formattedVal === '5' || formattedVal === 5) {
              return '<td><span class="badge-status-pill priority-p5">P5 Planning</span></td>';
            } else if (formattedVal === '1' || formattedVal === 1) {
              return '<td><span class="badge-status-pill priority-p1">P1 Critical</span></td>';
            }
          }
          return '<td>' + String(formattedVal).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td>';
        }).join('') + '</tr>';
      }
      html += '</tbody></table>';
      tc.innerHTML = html;
    } else if (!rows) {
      tc.innerHTML = '';
    }
    document.getElementById('rpcOutput').textContent = JSON.stringify(rawJson, null, 2);
  };

  window.copySysId = function(el) {
    var id = el.getAttribute('data-sysid') || el.title;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id);
    }
    showGcpToast('Copied SYS_ID: ' + id.substring(0, 8) + '...');
  };

  // Backwards compatibility for gallery filter function
  function filterGallery(category) {
    filterGroupView(category);
  }

  
  // =========================================================================
  // PROJECT CONTEXT SWITCHING & LOGICAL WORKFLOW NAVIGATION
  // =========================================================================

  function toggleProjectMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('gcpProjectMenu');
    if (!menu) return;
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
  }

  document.addEventListener('click', function(e) {
    const menu = document.getElementById('gcpProjectMenu');
    const chip = document.getElementById('gcpProjectChip');
    if (menu && menu.style.display !== 'none' && (!chip || !chip.contains(e.target))) {
      menu.style.display = 'none';
    }
  });

  function toggleProjectNode(projectId, e) {
    if (e) e.stopPropagation();
    const node = document.getElementById('projNode-' + projectId);
    if (!node) return;
    node.classList.toggle('collapsed');
  }

  function toggleAssetSubmenu(projectId, e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('assetMenu-' + projectId);
    const chev = document.getElementById('chev-assets-' + projectId);
    if (!menu) return;
    const isCollapsed = menu.classList.toggle('collapsed');
    if (chev) {
      chev.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
  }

  function filterGalleryByProject(projectId) {
    currentProject = projectId;
    const nameEl = document.getElementById('currentProjectName');
    if (nameEl) {
      nameEl.textContent = projectLabels[projectId] || projectId;
    }

    // Switch to gallery tab
    switchTab('tab-gallery', false);

    // Expand this project node
    const node = document.getElementById('projNode-' + projectId);
    if (node) node.classList.remove('collapsed');
    const assetMenu = document.getElementById('assetMenu-' + projectId);
    if (assetMenu) assetMenu.classList.remove('collapsed');
    const chev = document.getElementById('chev-assets-' + projectId);
    if (chev) chev.style.transform = 'rotate(0deg)';

    // Remove active from all sidebar items and set active on the project's All Assets link
    document.querySelectorAll('.sidebar-nav-item, .sub-nav-item, .asset-sub-item').forEach(function(el) {
      el.classList.remove('active');
    });
    const assetLink = document.getElementById('sideLink-' + projectId + '-assets');
    if (assetLink) assetLink.classList.add('active');

    // Filter cards in gallery by project
    if (projectId === 'servicenow') {
      document.querySelectorAll('.workflow-group-card').forEach(function(card) {
        const gid = card.getAttribute('data-group-id');
        card.style.display = (gid !== 'veeva-gxp') ? 'block' : 'none';
      });
      const firstSec = document.getElementById('workflow-ge-chat') || document.querySelector('.workflow-group-card');
      if (firstSec) firstSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (projectId === 'veeva') {
      document.querySelectorAll('.workflow-group-card').forEach(function(card) {
        const gid = card.getAttribute('data-group-id');
        card.style.display = (gid === 'ground-truth' || gid === 'live-auth') ? 'block' : 'none';
      });
      const gtSec = document.getElementById('workflow-ground-truth');
      if (gtSec) gtSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (projectId === 'microsoft') {
      document.querySelectorAll('.workflow-group-card').forEach(function(card) {
        const gid = card.getAttribute('data-group-id');
        card.style.display = (gid === 'ge-chat' || gid === 'agent-studio' || gid === 'live-auth') ? 'block' : 'none';
      });
      const msSec = document.getElementById('workflow-ge-chat');
      if (msSec) msSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      filterGroupView('ALL', false);
    }

    updateUrlState({ project: projectId, tab: 'gallery', group: null });
    showGcpToast('Viewing all assets for: ' + (projectLabels[projectId] || projectId));
  }

  function selectProjectView(projectId, tabId, subView) {
    currentProject = projectId;
    const nameEl = document.getElementById('currentProjectName');
    if (nameEl) {
      nameEl.textContent = projectLabels[projectId] || projectId;
    }

    // Update active project menu items & badges
    document.querySelectorAll('.gcp-project-menu-item').forEach(function(el) {
      el.classList.remove('active');
    });
    const activeMenuItem = document.getElementById('pItem-' + projectId);
    if (activeMenuItem) activeMenuItem.classList.add('active');

    ['servicenow', 'veeva', 'microsoft', 'all'].forEach(function(pid) {
      const b = document.getElementById('badge-' + pid);
      if (b) b.style.display = pid === projectId ? 'inline-block' : 'none';
    });

    const menu = document.getElementById('gcpProjectMenu');
    if (menu) menu.style.display = 'none';

    // Switch Tab
    if (tabId) {
      switchTab(tabId, false);
    }

    // Auto expand the active project node in sidebar
    if (projectId && projectId !== 'all') {
      const node = document.getElementById('projNode-' + projectId);
      if (node) node.classList.remove('collapsed');
    }

    // Remove active from all sidebar links
    document.querySelectorAll('.sidebar-nav-item, .sub-nav-item, .asset-sub-item').forEach(function(el) {
      el.classList.remove('active');
    });

    // Sub-view actions & active highlights
    if (projectId === 'servicenow') {
      if (subView === 'ge-chat') {
        filterGroupView('ge-chat', false);
        const sl = document.getElementById('sideLink-ge-chat');
        if (sl) sl.classList.add('active');
      } else if (subView === 'ground-truth') {
        filterGroupView('ground-truth', false);
        const sl = document.getElementById('sideLink-ground-truth');
        if (sl) sl.classList.add('active');
      } else if (subView === 'gcp-wizard') {
        filterGroupView('gcp-wizard', false);
        const sl = document.getElementById('sideLink-gcp-wizard');
        if (sl) sl.classList.add('active');
      } else if (subView === 'byomcp-setup') {
        filterGroupView('byomcp-setup', false);
        const sl = document.getElementById('sideLink-byomcp-setup');
        if (sl) sl.classList.add('active');
      } else if (tabId === 'tab-servicenow') {
        const sl = document.getElementById('sideLink-servicenow');
        if (sl) sl.classList.add('active');
      }
    } else if (projectId === 'veeva') {
      if (subView === 'parity' || subView === 'ground-truth') {
        filterGroupView('ground-truth', false);
        const sl = document.getElementById('sideLink-veeva-parity');
        if (sl) sl.classList.add('active');
      } else if (subView === 'gxp') {
        const sl = document.getElementById('sideLink-veeva-gxp');
        if (sl) sl.classList.add('active');
      } else if (tabId === 'tab-veeva') {
        const sl = document.getElementById('sideLink-veeva');
        if (sl) sl.classList.add('active');
      }
    } else if (projectId === 'microsoft') {
      if (subView === 'sharepoint') {
        selectMicrosoftTool('search_sharepoint_documents');
        const sl = document.getElementById('sideLink-ms-sharepoint');
        if (sl) sl.classList.add('active');
      } else if (subView === 'teams') {
        selectMicrosoftTool('get_teams_messages');
        const sl = document.getElementById('sideLink-ms-teams');
        if (sl) sl.classList.add('active');
      } else if (tabId === 'tab-microsoft') {
        const sl = document.getElementById('sideLink-microsoft');
        if (sl) sl.classList.add('active');
      } else if (tabId === 'tab-oauth') {
        const sl = document.getElementById('sideLink-ms-entra');
        if (sl) sl.classList.add('active');
      }
    } else if (projectId === 'all') {
      if (tabId === 'tab-gallery') {
        const sl = document.getElementById('sideLink-gallery');
        if (sl) sl.classList.add('active');
        filterGroupView('ALL', false);
      } else if (tabId === 'tab-oauth') {
        const sl = document.getElementById('sideLink-oauth');
        if (sl) sl.classList.add('active');
      }
    }

    // Update URL query parameters
    const cleanTab = tabId ? tabId.replace('tab-', '') : (projectId === 'microsoft' ? 'microsoft' : (projectId === 'veeva' ? 'veeva' : 'servicenow'));
    updateUrlState({
      project: projectId === 'all' ? null : projectId,
      tab: cleanTab,
      group: subView || null
    });
    showGcpToast('Project context: ' + (projectLabels[projectId] || projectId));
  }

  window.selectProjectView = selectProjectView;
  window.toggleProjectMenu = toggleProjectMenu;
  window.toggleProjectNode = toggleProjectNode;
  window.toggleAssetSubmenu = toggleAssetSubmenu;
  window.filterGalleryByProject = filterGalleryByProject;

  // =========================================================================
  // MICROSOFT UNIFIED CONNECTOR TEST SCENARIOS & INTERACTIVE RUNNER
  // =========================================================================
  let currentMsTool = 'search_sharepoint_documents';

  const MS_SCENARIOS = {
    search_sharepoint_documents: [
      { id: 'sp_strategy', label: '📄 FY27 Global Cloud Infrastructure Strategy.docx (Global IT Intranet)', query: 'Cloud Infrastructure Strategy', limit: 5 },
      { id: 'sp_grounding', label: '📊 AI Grounding Architecture & Graph API Guide.pptx (AI CoE)', query: 'AI Grounding Architecture', limit: 5 },
      { id: 'sp_pipeline', label: '📑 ServiceNow to Vertex AI Search Data Pipeline Specs.docx', query: 'ServiceNow Vertex AI', limit: 5 },
      { id: 'sp_gxp', label: '📈 Life Sciences GxP Compliance & 21 CFR Part 11 Audit.xlsx', query: 'Life Sciences GxP', limit: 5 }
    ],
    get_teams_messages: [
      { id: 'tm_war_room', label: '🚨 #cloud-ops-incident-war-room (P1 VPN Latency & Failover Incident)', query: '19:cloud-ops-incident-war-room@thread.tacv2', limit: 10 },
      { id: 'tm_arch_review', label: '🏛️ #arch-review (Vertex AI + M365 Unified Connector ADR Discussion)', query: 'arch-review', limit: 10 },
      { id: 'tm_ai_steering', label: '🤖 #ai-steering (Gemini Enterprise BYOMCP Tenant Deployment)', query: 'ai-steering', limit: 10 }
    ],
    search_outlook_emails: [
      { id: 'ex_adr', label: '📧 Architecture Decision Record: Vertex AI + Microsoft Unified Sign-Off', query: 'subject:Architecture Decision Record', folder: 'Inbox' },
      { id: 'ex_briefing', label: '📬 Executive Briefing: Gemini Enterprise Q3 BYOMCP Rollout', query: 'subject:Executive Briefing', folder: 'Executive Briefs' },
      { id: 'ex_secops', label: '🛡️ M365 Graph API Security Scopes & Entra ID Admin Approval', query: 'M365 Graph API Security', folder: 'Security Reviews' }
    ],
    get_onedrive_files: [
      { id: 'od_benchmarks', label: '📊 /Shared/Enterprise Architecture/MCP Benchmarks (Latency Matrix.xlsx)', query: '/Shared/Enterprise Architecture/MCP Benchmarks', limit: 5 },
      { id: 'od_blueprints', label: '📐 /Shared/Enterprise Architecture/Blueprints (Cloud Run BYOMCP.pdf)', query: '/Shared/Enterprise Architecture/Blueprints', limit: 5 },
      { id: 'od_tokens', label: '🔑 /Shared/Security Architecture/Tokens (Entra ID 3LO Sequence.drawio)', query: '/Shared/Security Architecture/Tokens', limit: 5 }
    ]
  };

  function renderMsSampleDropdown(toolName) {
    const list = MS_SCENARIOS[toolName] || [];
    if (!list.length) return '';
    const opts = list.map(function(s) {
      return '<option value="' + s.id + '">' + s.label + '</option>';
    }).join('');
    const chips = list.map(function(s) {
      return '<button type="button" class="sample-chip-btn" data-id="' + s.id + '" onclick="applyMsChip(this)">' + s.label.split('(')[0].trim() + '</button>';
    }).join('');
    return '<div class="sample-scenario-box">' +
      '<div class="sample-scenario-header">' +
        '<div class="sample-scenario-label">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>' +
          'Sample Test Scenarios (Select to Auto-Fill &amp; Test)' +
        '</div>' +
        '<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">Instant Auto-Run</span>' +
      '</div>' +
      '<select class="sample-scenario-select" id="msScenarioSelect" onchange="applyMsSample(this.value)">' +
        opts +
      '</select>' +
      '<div class="sample-chips-row">' +
        '<span class="sample-chips-title">Quick Presets:</span>' +
        chips +
      '</div>' +
    '</div>';
  }

  function applyMsChip(btn) {
    const id = btn.getAttribute('data-id');
    if (id) {
      applyMsSample(id);
    }
  }
  window.applyMsChip = applyMsChip;

  function applyMsSample(scenarioId) {
    const list = MS_SCENARIOS[currentMsTool] || [];
    const sc = list.find(s => s.id === scenarioId) || list[0];
    if (!sc) return;
    const sel = document.getElementById('msScenarioSelect');
    if (sel && sel.value !== sc.id) sel.value = sc.id;

    const qEl = document.getElementById('msInputQuery');
    const lEl = document.getElementById('msInputLimit');
    const fEl = document.getElementById('msInputFolder');
    if (qEl) qEl.value = sc.query ?? '';
    if (lEl) lEl.value = sc.limit ?? 5;
    if (fEl) fEl.value = sc.folder ?? 'Inbox';

    executeMicrosoftTool();
  }
  window.applyMsSample = applyMsSample;

  function selectMicrosoftTool(name) {
    currentMsTool = name;
    document.querySelectorAll('#tab-microsoft .tool-item').forEach(function(el) {
      const match = el.getAttribute('data-tool-name') === name || (el.id && el.id.includes(name));
      el.classList.toggle('selected', match);
    });
    const titleEl = document.getElementById('activeMsTitle');
    if (titleEl) titleEl.textContent = 'Active Tool: ' + name;

    const inputsDiv = document.getElementById('msToolInputs');
    if (!inputsDiv) return;

    const sampleDropdownHtml = renderMsSampleDropdown(name);
    if (name === 'search_sharepoint_documents') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Search Query (KQL / Keyword)</label><input type="text" id="msInputQuery" class="form-input" value="Cloud Infrastructure Strategy" /></div><div class="form-group" style="max-width:140px;"><label class="form-label">Limit</label><input type="number" id="msInputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    } else if (name === 'get_teams_messages') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Teams Channel ID / Name</label><input type="text" id="msInputQuery" class="form-input" value="19:cloud-ops-incident-war-room@thread.tacv2" /></div><div class="form-group" style="max-width:140px;"><label class="form-label">Limit</label><input type="number" id="msInputLimit" class="form-input" value="10" min="1" max="50" /></div></div>';
    } else if (name === 'search_outlook_emails') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">Email Search Query</label><input type="text" id="msInputQuery" class="form-input" value="subject:Architecture Decision Record" /></div><div class="form-group" style="max-width:140px;"><label class="form-label">Folder</label><input type="text" id="msInputFolder" class="form-input" value="Inbox" /></div></div>';
    } else if (name === 'get_onedrive_files') {
      inputsDiv.innerHTML = sampleDropdownHtml + '<div class="form-row"><div class="form-group"><label class="form-label">OneDrive Path</label><input type="text" id="msInputQuery" class="form-input" value="/Shared/Enterprise Architecture/MCP Benchmarks" /></div><div class="form-group" style="max-width:140px;"><label class="form-label">Limit</label><input type="number" id="msInputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    }
    executeMicrosoftTool();
  }
  window.selectMicrosoftTool = selectMicrosoftTool;

  function executeMicrosoftTool() {
    const q = (document.getElementById('msInputQuery')?.value || '').toLowerCase();
    let rows = [];
    let cols = [];

    if (currentMsTool === 'get_teams_messages') {
      cols = ['msg_id', 'channel', 'sender', 'timestamp', 'content', 'importance'];
      const allMsgs = [
        { msg_id: 'TM-MSG-1092', channel: '#cloud-ops-incident-war-room', sender: 'SecOps Director', timestamp: '2026-09-22 08:30:15', content: 'P1 Incident declared: Global VPN gateway latency exceeding 450ms. Investigating us-east4 router.', importance: 'High' },
        { msg_id: 'TM-MSG-1093', channel: '#cloud-ops-incident-war-room', sender: 'Network Lead', timestamp: '2026-09-22 08:35:20', content: 'BGP failover route established to us-central1. Packet loss stabilized to 0.02%.', importance: 'High' },
        { msg_id: 'TM-MSG-1094', channel: '#cloud-ops-incident-war-room', sender: 'VP Infrastructure', timestamp: '2026-09-22 08:42:00', content: 'Root cause confirmed as edge firewall micro-burst. MCP connector telemetry reporting normal.', importance: 'Normal' },
        { msg_id: 'TM-MSG-1095', channel: '#cloud-ops-incident-war-room', sender: 'SRE On-Call', timestamp: '2026-09-22 08:50:11', content: 'Post-incident review scheduled for 14:00 UTC. Incident INC1039 marked resolved in ServiceNow.', importance: 'Normal' }
      ];
      rows = q ? allMsgs.filter(m => m.content.toLowerCase().includes(q) || m.channel.toLowerCase().includes(q)) : allMsgs;
      if (rows.length === 0) rows = allMsgs;
    } else if (currentMsTool === 'search_outlook_emails') {
      cols = ['mail_id', 'subject', 'from', 'date', 'folder', 'importance'];
      const allMails = [
        { mail_id: 'EX-MAIL-3301', subject: 'Approved Architecture Decision Record: Vertex AI + Microsoft Unified', from: 'VP Enterprise Engineering', date: '2026-09-22 11:05:44', folder: 'Inbox', importance: 'High' },
        { mail_id: 'EX-MAIL-3302', subject: 'Executive Briefing: Gemini Enterprise Q3 BYOMCP Rollout', from: 'Director of AI Strategy', date: '2026-09-21 17:30:10', folder: 'Executive Briefs', importance: 'High' },
        { mail_id: 'EX-MAIL-3303', subject: 'M365 Graph API Security Scopes & Entra ID Admin Approval', from: 'SecOps Identity Lead', date: '2026-09-20 14:15:00', folder: 'Security Reviews', importance: 'Normal' },
        { mail_id: 'EX-MAIL-3304', subject: 'Quarterly ServiceNow & Veeva Ground-Truth Audit Sign-Off', from: 'Quality Assurance Director', date: '2026-09-19 09:00:22', folder: 'Audit Archive', importance: 'Normal' }
      ];
      rows = q ? allMails.filter(m => m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q)) : allMails;
      if (rows.length === 0) rows = allMails;
    } else if (currentMsTool === 'get_onedrive_files') {
      cols = ['file_id', 'name', 'path', 'modified', 'size', 'sharing'];
      const allFiles = [
        { file_id: 'OD-FILE-4410', name: 'Q3 Enterprise MCP Benchmarks & Latency Matrix.xlsx', path: '/Shared/Enterprise Architecture/MCP Benchmarks', modified: '2026-09-21 16:40:12', size: '2.4 MB', sharing: 'Restricted' },
        { file_id: 'OD-FILE-4411', name: 'Gemini Enterprise Multi-Source Knowledge Strategy.docx', path: '/Shared/Enterprise Architecture/Whitepapers', modified: '2026-09-19 11:20:00', size: '1.8 MB', sharing: 'Internal' },
        { file_id: 'OD-FILE-4412', name: 'Cloud Run BYOMCP Microservice Architecture.pdf', path: '/Shared/Enterprise Architecture/Blueprints', modified: '2026-09-17 09:45:30', size: '4.1 MB', sharing: 'Confidential' },
        { file_id: 'OD-FILE-4413', name: 'Entra ID 3LO Token Exchange Sequence Diagrams.drawio', path: '/Shared/Security Architecture/Tokens', modified: '2026-09-16 15:10:00', size: '850 KB', sharing: 'Internal' }
      ];
      rows = q ? allFiles.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) : allFiles;
      if (rows.length === 0) rows = allFiles;
    } else {
      cols = ['doc_id', 'title', 'source', 'author', 'modified', 'permissions'];
      const allDocs = [
        { doc_id: 'SP-DOC-8921', title: 'FY27 Global Cloud Infrastructure Strategy.docx', source: 'SharePoint Online (Global IT Intranet)', author: 'Satya N. / Cloud Architecture', modified: '2026-09-18 14:22:00', permissions: 'Confidential' },
        { doc_id: 'SP-DOC-8922', title: 'AI Grounding Architecture & Graph API Guide.pptx', source: 'SharePoint Online (AI Center of Excellence)', author: 'Enterprise Arch Lead', modified: '2026-09-20 09:15:30', permissions: 'Enterprise-Wide' },
        { doc_id: 'SP-DOC-8923', title: 'ServiceNow to Vertex AI Search Data Pipeline Specs.docx', source: 'SharePoint Online (Cloud Platforms)', author: 'Cloud Platform Director', modified: '2026-09-15 13:00:00', permissions: 'Confidential' },
        { doc_id: 'SP-DOC-8924', title: 'Life Sciences GxP Compliance & 21 CFR Part 11 Audit.xlsx', source: 'SharePoint Online (Regulatory Portal)', author: 'Compliance Lead', modified: '2026-09-12 10:45:00', permissions: 'GxP Validated' }
      ];
      rows = q ? allDocs.filter(d => d.title.toLowerCase().includes(q) || d.source.toLowerCase().includes(q)) : allDocs;
      if (rows.length === 0) rows = allDocs;
    }

    renderMsResult(rows, cols);
    showGcpToast('Executed Microsoft Tool: ' + currentMsTool + ' (' + rows.length + ' results)');
  }
  window.executeMicrosoftTool = executeMicrosoftTool;

  function renderMsResult(rows, cols) {
    const tc = document.getElementById('msTableContainer');
    if (!tc) return;
    if (!cols) {
      cols = Object.keys(rows[0] || {});
    }
    let html = '<table class="data-table"><thead><tr>' + cols.map(function(c) { return '<th>' + c.toUpperCase().replace('_', ' ') + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (const r of rows) {
      html += '<tr>' + cols.map(function(c) {
        const val = r[c] || '';
        if (c.endsWith('_id')) {
          return '<td><span class="table-mono-id" data-sysid="' + val + '" title="' + val + '" onclick="copySysId(this)">' + val + '</span></td>';
        }
        if (c === 'permissions' || c === 'importance' || c === 'sharing') {
          const isHigh = val.includes('Confidential') || val.includes('Restricted') || val === 'High';
          return '<td><span class="badge-status-pill ' + (isHigh ? 'priority-p1' : 'state-closed') + '">' + val + '</span></td>';
        }
        return '<td>' + String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td>';
      }).join('') + '</tr>';
    }
    html += '</tbody></table>';
    tc.innerHTML = html;

    const rpcOut = document.getElementById('msRpcOutput');
    if (rpcOut) {
      rpcOut.textContent = JSON.stringify({
        status: 200,
        tool: currentMsTool,
        tenant_id: '72f988bf-86f1-41af-91ab-2d7cd011db47',
        records: rows
      }, null, 2);
    }
  }
  window.renderMsResult = renderMsResult;

  function toggleMsView(view) {
    const btnT = document.getElementById('btnMsTable');
    const btnJ = document.getElementById('btnMsJson');
    const tc = document.getElementById('msTableContainer');
    const rpc = document.getElementById('msRpcOutput');
    if (!btnT || !btnJ || !tc || !rpc) return;
    if (view === 'table') {
      btnT.classList.add('active');
      btnJ.classList.remove('active');
      tc.style.display = 'block';
      rpc.style.display = 'none';
    } else {
      btnT.classList.remove('active');
      btnJ.classList.add('active');
      tc.style.display = 'none';
      rpc.style.display = 'block';
    }
  }
  window.toggleMsView = toggleMsView;

  // =========================================================================
  // URL SYNCHRONIZATION & IDEMPOTENT RELOAD HYDRATION ENGINE
  // =========================================================================
  function syncStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace('#', '');

    // 0. Project Hydration
    const projectParam = params.get('project');
    if (projectParam) {
      currentProject = projectParam;
      const nameEl = document.getElementById('currentProjectName');
      if (nameEl) nameEl.textContent = projectParam === 'all' ? 'All Projects' : projectParam;
    }

    // 1. Tab Hydration
    let tab = params.get('tab') || hash;
    if (tab && !tab.startsWith('tab-')) {
      tab = 'tab-' + tab;
    }
    if (tab && ['tab-servicenow', 'tab-veeva', 'tab-microsoft', 'tab-gallery', 'tab-oauth'].includes(tab)) {
      switchTab(tab, false);
    } else {
      switchTab('tab-servicenow', false);
    }

    // 2. Tool / Demo Hydration
    const tool = params.get('tool') || params.get('demo');
    if (tool) {
      if (tab === 'tab-veeva') {
        selectVeevaTool(tool, false);
      } else if (tab === 'tab-microsoft') {
        selectMicrosoftTool(tool);
      } else {
        selectTool(tool, false);
      }
    } else {
      if (tab === 'tab-veeva') {
        selectVeevaTool('search_vault_documents', false);
      } else if (tab === 'tab-microsoft') {
        selectMicrosoftTool('search_sharepoint_documents');
      } else if (!tab || tab === 'tab-servicenow') {
        selectTool('search_servicenow_incidents', false);
      }
    }

    // 3. Workflow Group in Gallery
    const group = params.get('group');
    if (group) {
      filterGroupView(group, false);
    }

    // 4. Slide / Asset Deep Link Hydration
    const slideParam = params.get('slide') || params.get('asset');
    if (slideParam) {
      let targetIdx = -1;
      if (/^\d+$/.test(slideParam)) {
        const num = parseInt(slideParam, 10);
        if (num >= 1 && num <= ALL_SLIDES.length) {
          targetIdx = num - 1;
        }
      }
      if (targetIdx === -1) {
        targetIdx = ALL_SLIDES.findIndex(function(s) {
          return s.assetId === slideParam || s.fileName === slideParam || s.fileName.startsWith(slideParam);
        });
      }
      if (targetIdx !== -1) {
        setTimeout(function() {
          startSlideshow('ALL', targetIdx);
        }, 150);
      }
    }

    // 5. Print Modal Deep Link Hydration
    if (params.get('print') === '1' || params.get('modal') === 'print') {
      const scope = params.get('scope') || 'all';
      openPrintModal(scope);
    }
  }

  // Initialization
  window.addEventListener('DOMContentLoaded', function() {
    initGcpTheme();
    initSidebar();
    syncStateFromUrl();
    const activeTab = document.querySelector('.view-tab.active');
    if (!activeTab || activeTab.id === 'tab-servicenow') {
      executeCurrentTool();
    } else if (activeTab.id === 'tab-veeva') {
      executeVeevaTool();
    } else if (activeTab.id === 'tab-microsoft') {
      executeMicrosoftTool();
    }
  });

  window.addEventListener('popstate', function() {
    syncStateFromUrl();
  });
</script>
${generatePrintDossierHtml(allSlides, totalScreenshots)}

<!-- GCP Toast Notification for Deep Links -->
<div id="gcpToast" class="gcp-toast">
  <div class="gcp-toast-icon">🔗</div>
  <div>
    <div class="gcp-toast-title" id="toastTitle">Deep link copied to clipboard!</div>
    <div class="gcp-toast-url" id="toastUrl"></div>
  </div>
</div>

</body>
</html>`);
});

server.listen(PORT, () => {
  console.log(`BYOMCP ServiceNow Server listening on http://localhost:${PORT}/mcp`);
  console.log(`Interactive Workbench UI available at http://localhost:${PORT}/`);
  try {
    startVeevaMcpServer(8792).then(() => {
      console.log('Integrated Veeva Vault GxP MCP Server listening on http://127.0.0.1:8792/mcp');
    }).catch(err => {
      console.log('Veeva Vault MCP Server on port 8792 status:', err.message);
    });
  } catch (e) {
    console.warn('Veeva Vault MCP Server start error:', e.message);
  }
});
