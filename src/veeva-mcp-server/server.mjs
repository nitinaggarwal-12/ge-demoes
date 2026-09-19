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
    case 'search_documents': {
      const q = String(args.vql_query || args.study || '').toLowerCase();
      const matches = q
        ? VEEVA_DATA.documents.filter(d => JSON.stringify(d).toLowerCase().includes(q))
        : VEEVA_DATA.documents;
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
          version_label: d.version_label,
          study__v: d.study__v,
          ectd_module__c: d.ectd_module__c,
          cfr_part_11_compliant__v: d.cfr_part_11_compliant__v
        }))
      };
    }
    case 'get_document': {
      const doc = findDoc(args.document_id);
      return { responseStatus: 'SUCCESS', document: doc };
    }
    case 'get_document_type': {
      const t = VEEVA_DATA.document_types.find(x => x.name === args.type_name) || VEEVA_DATA.document_types[0];
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
        versions: doc.versions
      };
    }
    case 'get_document_version': {
      const doc = findDoc(args.document_id);
      const v = doc.versions.find(
        ver => ver.major_version_number__v === Number(args.major_version) &&
               ver.minor_version_number__v === Number(args.minor_version)
      ) || doc.versions[0];
      return { responseStatus: 'SUCCESS', document_number__v: doc.document_number__v, version_detail: v };
    }
    case 'get_document_renditions': {
      const doc = findDoc(args.document_id);
      return {
        responseStatus: 'SUCCESS',
        document_number__v: doc.document_number__v,
        renditions: doc.renditions
      };
    }
    case 'download_document_file': {
      const doc = findDoc(args.document_id);
      return {
        responseStatus: 'SUCCESS',
        document_number__v: doc.document_number__v,
        file_name__v: doc.file_name__v,
        file_size_bytes__v: doc.file_size_bytes__v,
        sha256_checksum__v: doc.sha256_checksum__v,
        download_uri: doc.renditions[0].download_uri
      };
    }
    default:
      throw new Error(`Unknown Veeva MCP tool: ${name}`);
  }
}

export function startVeevaMcpServer(port = 8792) {
  const server = http.createServer((req, res) => {
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
          vaultIds: [{ id: 98412, name: VEEVA_DATA.vault_instance.vault_name, url: VEEVA_DATA.vault_instance.domain_url }],
          oauth_profile_id: profileId,
          federated_token_ttl_seconds: 3600
        }));
        return;
      }

      if (req.url.startsWith('/mcp')) {
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
      }

      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', service: 'veeva-vault-gxp-mcp-server', vault_dns: VEEVA_DATA.vault_instance.vault_dns }));
    });
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8792);
  startVeevaMcpServer(port).then(() => {
    console.log(`Veeva Vault GxP MCP Server listening on http://127.0.0.1:${port}/mcp`);
  });
}
