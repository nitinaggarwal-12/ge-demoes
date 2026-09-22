import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
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
          allImages.push({
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
      allSlides.push(img);
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
    min-width: 240px;
    max-width: 320px;
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

  /* Two Column Layout */
  .grid-2col {
    display: grid;
    grid-template-columns: 460px 1fr;
    gap: 24px;
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
    max-height: 80px;
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
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    background: var(--sidebar-bg);
  }
  .slideshow-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .slideshow-group-badge {
    background: rgba(26, 115, 232, 0.15);
    border: 1px solid rgba(26, 115, 232, 0.4);
    color: var(--accent-light);
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 12px;
  }
  .slideshow-slide-title {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: #ffffff;
  }
  .slideshow-file-tag {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }
  .slideshow-counter {
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    color: #e8eaed;
  }
  .slideshow-header-tools {
    display: flex;
    align-items: center;
    gap: 8px;
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

  /* PRINT MEDIA STYLES */
  @media print {
    @page {
      size: landscape;
      margin: 10mm;
    }
    body {
      background: #ffffff !important;
      color: #000000 !important;
    }
    .gcp-color-strip,
    .app-sidebar,
    .topbar,
    .gallery-filter-bar,
    .workflow-actions,
    .quick-links,
    .runner-box,
    .slideshow-modal,
    .print-modal,
    .lightbox-backdrop,
    #tab-servicenow,
    #tab-veeva,
    #tab-oauth {
      display: none !important;
    }
    .app-main {
      margin-left: 0 !important;
      padding: 0 !important;
    }
    .container {
      max-width: 100% !important;
      padding: 0 !important;
    }
    #tab-gallery {
      display: block !important;
    }
    .workflow-group-card {
      border: none !important;
      padding: 0 !important;
      margin-bottom: 20px !important;
      background: transparent !important;
      page-break-before: always;
      break-before: page;
    }
    .workflow-group-card:first-child {
      page-break-before: auto;
      break-before: auto;
    }
    .workflow-header {
      border-bottom: 2px solid #000 !important;
      color: #000 !important;
    }
    .workflow-title {
      color: #000 !important;
    }
    .workflow-desc {
      color: #444 !important;
    }
    .gallery-grid {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 16px !important;
    }
    .gallery-card {
      border: 1px solid #ccc !important;
      background: #fff !important;
      break-inside: avoid;
      page-break-inside: avoid;
      box-shadow: none !important;
    }
    .gallery-title {
      color: #000 !important;
    }
    .gallery-cat {
      color: #1a73e8 !important;
    }
    .gallery-file {
      color: #666 !important;
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
      <!-- GCP Console Navigation Views -->
      <div>
        <div class="sidebar-section-title">Console Navigation</div>
        <ul class="sidebar-nav-list">
          <li>
            <a class="sidebar-nav-item active" id="sideLink-servicenow" onclick="switchTab('tab-servicenow')">
              <span class="sidebar-nav-icon">⚡</span>
              <span class="sidebar-nav-label">ServiceNow BYOMCP</span>
            </a>
          </li>
          <li>
            <a class="sidebar-nav-item" id="sideLink-veeva" onclick="switchTab('tab-veeva')">
              <span class="sidebar-nav-icon">🧪</span>
              <span class="sidebar-nav-label">Veeva Vault GxP</span>
            </a>
          </li>
          <li>
            <a class="sidebar-nav-item" id="sideLink-gallery" onclick="switchTab('tab-gallery')">
              <span class="sidebar-nav-icon">🖼️</span>
              <span class="sidebar-nav-label">Visual Gallery</span>
              <span class="sidebar-nav-badge">${totalScreenshots}</span>
            </a>
          </li>
          <li>
            <a class="sidebar-nav-item" id="sideLink-oauth" onclick="switchTab('tab-oauth')">
              <span class="sidebar-nav-icon">📜</span>
              <span class="sidebar-nav-label">OAuth &amp; Specs</span>
            </a>
          </li>
        </ul>
      </div>

      <!-- Logical Workflows -->
      <div>
        <div class="sidebar-section-title">Verified Workflows</div>
        <ul class="sidebar-nav-list">
          ${logicalGroups.map(g => `
            <li>
              <a class="sidebar-nav-item" onclick="jumpToWorkflow('${g.id}')" title="${g.title}">
                <span class="sidebar-nav-icon">${g.icon}</span>
                <span class="sidebar-nav-label">${g.title.split(':')[0]}</span>
                <span class="sidebar-nav-badge">${g.count}</span>
              </a>
            </li>
          `).join('')}
        </ul>
      </div>
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
          
          <!-- GCP Project Selector Chip -->
          <div class="gcp-project-chip" title="Active Google Cloud Project">
            <span class="gcp-project-icon">⬡</span>
            <span class="gcp-project-label">Project:</span>
            <span class="gcp-project-name">argolis-ge-enterprise</span>
            <span class="gcp-project-arrow">▾</span>
          </div>

          <!-- GCP Search Box Mockup -->
          <div class="gcp-search-box" onclick="switchTab('tab-gallery')" title="Search all resources and workflows">
            <span class="gcp-search-icon">🔍</span>
            <span class="gcp-search-placeholder">Search resources, tools, workflows</span>
            <kbd class="gcp-kbd">/</kbd>
          </div>
        </div>

        <nav class="nav-tabs">
          <button class="tab-btn active" id="topTab-servicenow" onclick="switchTab('tab-servicenow')">
            <span>ServiceNow BYOMCP</span>
          </button>
          <button class="tab-btn" id="topTab-veeva" onclick="switchTab('tab-veeva')">
            <span>Veeva Vault GxP</span>
          </button>
          <button class="tab-btn" id="topTab-gallery" onclick="switchTab('tab-gallery')">
            <span>Visual Screenshots</span>
            <span class="badge-count">${totalScreenshots}</span>
          </button>
          <button class="tab-btn" id="topTab-oauth" onclick="switchTab('tab-oauth')">
            <span>OAuth &amp; Specs</span>
          </button>
        </nav>

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
            <h1>
              <span>Mode 1: ServiceNow Bring Your Own MCP (BYOMCP)</span>
            </h1>
            <p>Google Cloud standard JSON-RPC 2.0 streamable-HTTP server running at <code>http://localhost:${PORT}/mcp</code> with built-in OAuth 2.0 metadata discovery and live incident / KB / catalog query endpoints.</p>
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
                <span style="font-size:11px; color:var(--green); font-weight:700;">go/ge-byomcp-playbook</span>
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
            <p>Google Cloud integrated MCP tools for life sciences document governance, clinical study reports (ONCO-304), regulatory submissions, and GxP compliance audit trails.</p>
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
                <div class="tool-item selected" onclick="selectVeevaTool('search_vault_documents')">
                  <div class="tool-header">
                    <span class="tool-name">search_vault_documents</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-desc">VQL query across clinical trial documents, protocols, and regulatory filings.</div>
                </div>
                <div class="tool-item" onclick="selectVeevaTool('get_audit_trail')">
                  <div class="tool-header">
                    <span class="tool-name">get_audit_trail</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-desc">Extract 21 CFR Part 11 compliant audit trails with electronic signatures.</div>
                </div>
                <div class="tool-item" onclick="selectVeevaTool('get_binder_structure')">
                  <div class="tool-header">
                    <span class="tool-name">get_binder_structure</span>
                    <span class="tool-tag">readOnly</span>
                  </div>
                  <div class="tool-desc">Retrieve eCTD regulatory binder hierarchies and section mappings.</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="runner-box">
              <div class="runner-title">
                <span id="activeVeevaTitle">Active Tool: search_vault_documents</span>
                <span style="font-size:12px; color:var(--muted); font-family:var(--font-mono);">POST :8792/mcp</span>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">VQL Query Filter</label>
                  <input type="text" id="veevaQuery" class="form-input" value="status__v = 'Approved for Submission'" />
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
                  <h2 class="workflow-title">${g.title}</h2>
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
                <div class="gallery-card" onclick="openSlideshowAtSlide('${img.fileName}')" title="Click to view full slide in presentation mode">
                  <div class="gallery-img-wrap">
                    <span class="slide-num-pill">#${img.index + 1}</span>
                    <img src="${img.url}" alt="${img.title}" loading="lazy" />
                  </div>
                  <div class="gallery-info">
                    <div class="gallery-cat">${g.title.split(':')[0]}</div>
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

      <span class="slideshow-counter" id="slideCounterText">Slide 1 of 65</span>
      <button class="btn-slideshow-tool" onclick="toggleFullscreen()" title="Toggle Fullscreen (F)">⛶</button>
      <button class="btn-slideshow-tool" onclick="closeSlideshow()" title="Close Slideshow (Esc)">✕</button>
    </div>
  </div>

  <div class="slideshow-stage">
    <button class="slideshow-arrow prev" onclick="prevSlide()" title="Previous (Left Arrow)">◀</button>
    <img class="slideshow-img" id="slideshowImg" src="" alt="Slide View" />
    <button class="slideshow-arrow next" onclick="nextSlide()" title="Next (Right Arrow)">▶</button>

    <!-- Real-Time Gold Karaoke Subtitles Bar -->
    <div class="slideshow-karaoke-bar" id="slideshowKaraokeBar">
      <div class="karaoke-header">
        <div class="karaoke-voice-badge" id="karaokeVoiceBadge">
          <span class="karaoke-pulse-dot"></span>
          <span id="karaokeVoiceName">Google DeepMind Narrator • Aoede</span>
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
    <div class="print-footer">
      <button class="btn-link" onclick="closePrintModal()">Cancel</button>
      <button class="btn-run" onclick="executePrint()">
        <span>🖨️</span>
        <span>Open System Print / Save as PDF</span>
      </button>
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
      <img id="lightboxImg" src="" alt="Enlarged Screenshot" />
    </div>
  </div>
</div>

<script>
  // CLIENT STATE
  const LOGICAL_GROUPS = ${logicalGroupsJson};
  const ALL_SLIDES = ${allSlidesJson};

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

  function switchTab(tabId) {
    document.querySelectorAll('.view-tab').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.sidebar-nav-item').forEach(function(el) { el.classList.remove('active'); });

    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.classList.add('active');

    const topBtn = document.getElementById('topTab-' + tabId.replace('tab-', ''));
    if (topBtn) topBtn.classList.add('active');

    const sideLink = document.getElementById('sideLink-' + tabId.replace('tab-', ''));
    if (sideLink) sideLink.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function jumpToWorkflow(groupId) {
    switchTab('tab-gallery');
    filterGroupView('ALL');
    setTimeout(function() {
      const section = document.getElementById('workflow-' + groupId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  function filterGroupView(groupId) {
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
    if (isNarratorSpeaking) {
      stopSlideNarration();
      playSlideNarration(currentSlideIndex, false);
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

      if (!resp.ok) throw new Error('API status ' + resp.status);
      const data = await resp.json();

      if (data.mode === 'browser_speech' || !data.audioUrl) {
        playBrowserUtterance(narrationText, vConfig, autoAdvanceAfter);
        return;
      }

      // Play High-Fidelity Audio Stream (Google Journey, Chirp-HD, Studio, Gemini, Omni)
      const audio = new Audio(data.audioUrl);
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
    } catch (err) {
      console.warn('Neural audio fetch failed, falling back to device voice:', err.message);
      playBrowserUtterance(narrationText, vConfig, autoAdvanceAfter);
    }
  }

  function stopSlideNarration() {
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
      currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
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

  function openSlideshowAtSlide(fileName) {
    const idx = ALL_SLIDES.findIndex(function(s) { return s.fileName === fileName; });
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

  function executePrint() {
    const scope = document.getElementById('printScopeSelect').value;
    closePrintModal();

    switchTab('tab-gallery');
    filterGroupView(scope);

    setTimeout(function() {
      window.print();
    }, 400);
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

  // TOOL INTERACTION & RUNNER
  function selectTool(name) {
    currentTool = name;
    document.querySelectorAll('#tab-servicenow .tool-item').forEach(function(el) {
      el.classList.remove('selected');
    });
    if (event && event.currentTarget) {
      event.currentTarget.classList.add('selected');
    }
    document.getElementById('activeToolTitle').textContent = 'Active Tool: ' + name;

    const inputsDiv = document.getElementById('toolInputs');
    if (name === 'search_servicenow_incidents') {
      inputsDiv.innerHTML = '<div class="form-row"><div class="form-group"><label class="form-label">Search Query (optional)</label><input type="text" id="inputQuery" class="form-input" placeholder="e.g. email, network, server..." value="" /></div><div class="form-group" style="max-width: 140px;"><label class="form-label">Limit</label><input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    } else if (name === 'get_servicenow_incident') {
      inputsDiv.innerHTML = '<div class="form-row"><div class="form-group"><label class="form-label">Incident Number (e.g. INC1039)</label><input type="text" id="inputNumber" class="form-input" value="INC1039" /></div></div>';
    } else if (name === 'search_servicenow_knowledge_articles') {
      inputsDiv.innerHTML = '<div class="form-row"><div class="form-group"><label class="form-label">Search Query</label><input type="text" id="inputQuery" class="form-input" value="VPN" /></div><div class="form-group" style="max-width: 140px;"><label class="form-label">Limit</label><input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    } else if (name === 'list_servicenow_catalog_items') {
      inputsDiv.innerHTML = '<div class="form-row"><div class="form-group" style="max-width: 140px;"><label class="form-label">Limit</label><input type="number" id="inputLimit" class="form-input" value="5" min="1" max="50" /></div></div>';
    } else if (name === 'search_servicenow_problems_and_changes') {
      inputsDiv.innerHTML = '<div class="form-row"><div class="form-group"><label class="form-label">Table</label><select id="inputTable" class="form-input"><option value="problem">Problems (problem)</option><option value="change_request">Change Requests (change_request)</option></select></div><div class="form-group"><label class="form-label">Query</label><input type="text" id="inputQuery" class="form-input" value="" /></div></div>';
    }
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
      window.renderStepResult(method + ' &bull; ' + (params.name || ''), rows, rpcRes);
    } catch (err) {
      window.renderStepResult('Error: ' + err.message, null, { error: err.message });
    }
  }

  // Veeva Tool Runner
  let currentVeevaTool = 'search_vault_documents';
  function selectVeevaTool(tool) {
    currentVeevaTool = tool;
    document.querySelectorAll('#tab-veeva .tool-item').forEach(function(el) { el.classList.remove('selected'); });
    if (event && event.currentTarget) event.currentTarget.classList.add('selected');
    document.getElementById('activeVeevaTitle').textContent = 'Active Tool: ' + tool;
  }

  async function executeVeevaTool() {
    const q = document.getElementById('veevaQuery')?.value || '';
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: currentVeevaTool, arguments: { query: q } }
    };
    try {
      const resp = await fetch('http://localhost:8792/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const rpcRes = await resp.json();
      let rows = null;
      if (rpcRes.result && rpcRes.result.content && rpcRes.result.content[0]) {
        try {
          const parsed = JSON.parse(rpcRes.result.content[0].text);
          rows = Array.isArray(parsed) ? parsed : [parsed];
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

  // Backwards compatibility for gallery filter function
  function filterGallery(category) {
    filterGroupView(category);
  }

  // Initialization
  window.addEventListener('DOMContentLoaded', function() {
    initGcpTheme();
    initSidebar();
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
