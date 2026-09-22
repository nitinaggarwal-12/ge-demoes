import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.resolve(__dirname, '../../data/veeva_vault_live_sample_data.json');
const VEEVA_DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const VEEVA_TOOLS = [
  {
    name: 'search_documents',
    description: 'Searches for documents in Veeva Vault using a VQL query or filter criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        vql_query: { type: 'string', description: 'VQL query string or search keyword (e.g. Study ONCO-304 or VV-DOC-004819)' },
        study: { type: 'string', description: 'Optional study identifier filter (e.g. ONCO-304)' },
        status: { type: 'string', description: 'Optional document lifecycle status filter' }
      }
    }
  },
  {
    name: 'get_document',
    description: 'Retrieves the metadata of a specific document by its document id or document number.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Document ID (e.g. 4819) or Document Number (e.g. VV-DOC-004819)' }
      },
      required: ['document_id']
    }
  },
  {
    name: 'get_document_type',
    description: 'Retrieves the details of a specific document type in Veeva Vault.',
    inputSchema: {
      type: 'object',
      properties: {
        type_name: { type: 'string', description: 'Document type API name (e.g. clinical__v, regulatory__v, quality__v)' }
      },
      required: ['type_name']
    }
  },
  {
    name: 'get_document_subtype',
    description: 'Retrieves the details of a specific document subtype.',
    inputSchema: {
      type: 'object',
      properties: {
        subtype_name: { type: 'string', description: 'Document subtype API name (e.g. clinical_study_report__v, protocol__v)' }
      },
      required: ['subtype_name']
    }
  },
  {
    name: 'get_document_versions',
    description: 'Lists all major and minor versions of a specific document in Veeva Vault.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Document ID or Document Number (e.g. VV-DOC-004819)' }
      },
      required: ['document_id']
    }
  },
  {
    name: 'get_document_version',
    description: 'Retrieves a specific version of a document using its major and minor version numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Document ID or Document Number' },
        major_version: { type: 'number', description: 'Major version number (e.g. 2)' },
        minor_version: { type: 'number', description: 'Minor version number (e.g. 0)' }
      },
      required: ['document_id', 'major_version', 'minor_version']
    }
  },
  {
    name: 'get_document_renditions',
    description: 'Lists the available renditions (e.g. viewable_rendition__v / ectd_submission_rendition__v) for a document.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Document ID or Document Number' }
      },
      required: ['document_id']
    }
  },
  {
    name: 'download_document_file',
    description: 'Downloads the source file metadata, SHA-256 checksum, and signed stream URI of a specific document.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Document ID or Document Number' }
      },
      required: ['document_id']
    }
  }
];

function findDoc(idOrNum) {
  const key = String(idOrNum || '').toLowerCase();
  return VEEVA_DATA.documents.find(
    d => String(d.id) === key || d.document_number__v.toLowerCase() === key
  ) || VEEVA_DATA.documents[0];
}

function executeTool(name, args = {}) {
  switch (name) {
    case 'search_documents':
    case 'search_vault_documents':
    case 'veeva_search_documents': {
      const rawQ = String(args.vql_query || args.query || args.study || args.filter || '').trim();
      let matches = VEEVA_DATA.documents;
      if (rawQ) {
        const statusMatch = rawQ.match(/status__v\s*=\s*['"]?([^'"]+)['"]?/i);
        if (statusMatch) {
          const targetStatus = statusMatch[1].toLowerCase();
          matches = matches.filter(d => {
            const st = (d.status__v || '').toLowerCase();
            return st.includes(targetStatus) || targetStatus.includes(st) || (targetStatus.includes('approved') && st.includes('approved'));
          });
        } else {
          const cleanQ = rawQ.replace(/select|from|documents|where|and|status__v|=/gi, ' ').trim().toLowerCase();
          if (cleanQ) {
            const terms = cleanQ.split(/\s+/).filter(Boolean);
            matches = matches.filter(d => {
              const str = JSON.stringify(d).toLowerCase();
              return terms.some(t => str.includes(t));
            });
          }
        }
      }
      if (matches.length === 0) {
        matches = VEEVA_DATA.documents;
      }
      return {
        responseStatus: 'SUCCESS',
        vault_dns: VEEVA_DATA.vault_instance.vault_dns,
        total_records: matches.length,
        documents: matches.map(d => ({
          id: d.id,
          document_number__v: d.document_number__v,
          name__v: d.name__v,
          type__v: d.type__v,
          subtype__v: d.subtype__v,
          status__v: d.status__v,
          major_version_number__v: d.major_version_number__v,
          minor_version_number__v: d.minor_version_number__v,
          owner__v: d.owner__v,
          version_modified_date__v: d.version_modified_date__v
        }))
      };
    }
    case 'get_audit_trail': {
      const docId = args.document_id || (VEEVA_DATA.documents[0] && VEEVA_DATA.documents[0].document_number__v) || 'DOC-030201';
      return {
        responseStatus: 'SUCCESS',
        document_number__v: docId,
        compliance: '21 CFR Part 11 / Annex 11 Validated Electronic Records',
        total_records: 4,
        audit_trail: [
          {
            timestamp: '2026-08-29T16:05:19.000Z',
            event_type: 'Electronic Signature Applied',
            user_name: 'connectorsuserqa@dexxxxte.com',
            full_name: 'Super Admin QA Lead',
            action: 'Document Approval & Release',
            signature_meaning: 'I approve this document for regulatory submission (FDA 21 CFR Part 11.50)',
            signature_hash: 'sha256:8b4f1c9938e21a6d70bc29d47a4691a0c7e2b109e9f90c37bbdae284a1e948c2',
            audit_id: 'AUD-8821941'
          },
          {
            timestamp: '2026-08-25T11:40:02.000Z',
            event_type: 'Status Change',
            user_name: 'connectorsuserqa@dexxxxte.com',
            full_name: 'Super Admin QA Lead',
            action: 'State change from Draft to Steady State',
            signature_meaning: 'Lifecycle Transition Verification',
            signature_hash: 'sha256:7a3d2e1189c42b5a61ef38c56d3580b1b6d1a098d8e81b26aacad173f0d837b1',
            audit_id: 'AUD-8821940'
          },
          {
            timestamp: '2026-08-21T09:15:44.000Z',
            event_type: 'Version Creation',
            user_name: 'connectorsuserqa@dexxxxte.com',
            full_name: 'Super Admin QA Lead',
            action: 'Increment minor version 0.1 -> 0.2',
            signature_meaning: 'Version Increment Checkpoint',
            signature_hash: 'sha256:6e2c1d0078b31a4f50de27b45c2470a0a5c0f087c7d70a1599bac062e0c726a0',
            audit_id: 'AUD-8821939'
          },
          {
            timestamp: '2026-08-18T14:22:10.000Z',
            event_type: 'Initial Ingestion',
            user_name: 'connectorsuserqa@dexxxxte.com',
            full_name: 'Super Admin QA Lead',
            action: 'Document Upload & Check-in via Vertex AI Search BYOMCP',
            signature_meaning: 'Source Ingestion Verification',
            signature_hash: 'sha256:5d1b0c9967a2093e40cd16a34b136f9094b0e076b6c6090488a9bf51d0b6159f',
            audit_id: 'AUD-8821938'
          }
        ]
      };
    }
    case 'get_binder_structure': {
      return {
        responseStatus: 'SUCCESS',
        total_records: VEEVA_DATA.binders.length,
        binders: VEEVA_DATA.binders.map(b => ({
          id: b.id,
          binder_number__v: b.binder_number__v,
          name__v: b.name__v,
          major_version_number__v: b.major_version_number__v,
          minor_version_number__v: b.minor_version_number__v,
          status__v: b.status__v,
          export_path: b.name__v.includes('Export Path') ? b.name__v.split('Export Path ')[1]?.replace(')', '') : 'N/A'
        }))
      };
    }
    case 'get_document': {
      const doc = findDoc(args.document_id);
      return { responseStatus: 'SUCCESS', document: doc };
    }
    case 'get_document_type': {
      const t = (VEEVA_DATA.document_types || []).find(x => x.name === args.type_name) || { name: args.type_name || 'central_trial_documents__c' };
      return { responseStatus: 'SUCCESS', document_type: t };
    }
    case 'get_document_subtype': {
      return {
        responseStatus: 'SUCCESS',
        subtype: args.subtype_name || 'clinical_study_report__v',
        lifecycle: 'Clinical Document Lifecycle',
        cfr_part_11_electronic_signatures_required: true
      };
    }
    case 'get_document_versions': {
      const doc = findDoc(args.document_id);
      return {
        responseStatus: 'SUCCESS',
        document_number__v: doc.document_number__v,
        versions: [
          { major_version_number__v: doc.major_version_number__v, minor_version_number__v: doc.minor_version_number__v, status__v: doc.status__v, version_modified_date__v: doc.version_modified_date__v }
        ]
      };
    }
    case 'get_document_version': {
      const doc = findDoc(args.document_id);
      return { responseStatus: 'SUCCESS', document_number__v: doc.document_number__v, version_detail: doc };
    }
    case 'get_document_renditions': {
      const doc = findDoc(args.document_id);
      return {
        responseStatus: 'SUCCESS',
        document_number__v: doc.document_number__v,
        renditions: [
          { rendition_type__v: 'viewable_rendition__v', format__v: 'application/pdf', status__v: 'Ready' }
        ]
      };
    }
    case 'download_document_file': {
      const doc = findDoc(args.document_id);
      return {
        responseStatus: 'SUCCESS',
        document_number__v: doc.document_number__v,
        file_name__v: doc.document_number__v + '.pdf',
        file_size_bytes__v: 248102,
        sha256_checksum__v: 'sha256:8b4f1c9938e21a6d70bc29d47a4691a0c7e2b109e9f90c37bbdae284a1e948c2',
        download_uri: `https://sbxxxxal.veevavault.com/api/v24.2/objects/documents/${doc.id}/file`
      };
    }
    default:
      return {
        responseStatus: 'FAILURE',
        error_type: 'INVALID_TOOL',
        message: `Unknown Veeva MCP tool: ${name}. Supported tools: search_vault_documents, get_audit_trail, get_binder_structure, get_document, get_document_versions, download_document_file.`
      };
  }
}

export function startVeevaMcpServer(port = 8792) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, x-goog-user-project');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.url.startsWith('/oauth/token')) {
        res.writeHead(200);
        res.end(JSON.stringify({
          token_type: 'Bearer',
          access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.okta_oidc_step1_token_98xxxx4a',
          refresh_token: 'okta_refresh_token_4fxxxx91',
          scope: 'openid profile email offline_access',
          expires_in: 3600
        }));
        return;
      }

      if (req.url.startsWith('/auth/oauth/session/')) {
        const profileId = req.url.split('/').pop();
        res.writeHead(200);
        res.end(JSON.stringify({
          responseStatus: 'SUCCESS',
          sessionId: '7fxxxx3e',
          userId: 120491,
          vaultIds: [{ id: 98412, name: VEEVA_DATA.vault_instance.vault_name || 'sbxxxxal', url: VEEVA_DATA.vault_instance.domain_url || 'https://sbxxxxal.veevavault.com' }],
          oauth_profile_id: profileId,
          federated_token_ttl_seconds: 3600
        }));
        return;
      }

      if (req.url.startsWith('/mcp')) {
        try {
          const payload = JSON.parse(body || '{}');
          if (payload.method === 'initialize') {
            res.writeHead(200);
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: payload.id,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: { name: 'veeva-vault-gxp-mcp-server', version: '2.0.0' },
                capabilities: { tools: {} }
              }
            }));
            return;
          }
          if (payload.method === 'tools/list') {
            res.writeHead(200);
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: payload.id,
              result: { tools: VEEVA_TOOLS }
            }));
            return;
          }
          if (payload.method === 'tools/call') {
            const out = executeTool(payload.params?.name, payload.params?.arguments);
            res.writeHead(200);
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: payload.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(out, null, 2) }]
              }
            }));
            return;
          }
        } catch (mcpErr) {
          res.writeHead(200);
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'Internal JSON-RPC error: ' + mcpErr.message }
          }));
          return;
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', service: 'veeva-vault-gxp-mcp-server', vault_dns: VEEVA_DATA.vault_instance.vault_dns }));
    });
  });

  return new Promise(resolve => {
    server.listen(port, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8792);
  startVeevaMcpServer(port).then(() => {
    console.log(`Veeva Vault GxP MCP Server listening on http://127.0.0.1:${port}/mcp`);
  });
}
