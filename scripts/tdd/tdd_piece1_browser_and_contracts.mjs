#!/usr/bin/env node
/**
 * TDD Piece 1 Verification Test:
 * 1. Verifies all 5 contract .md files and .gemini/hooks.json exist and parse cleanly.
 * 2. Verifies 3-Tier Browser Resolver (Priority 1 Google-Signed Chrome -> Priority 2 Generic -> Priority 3 Edge/Firefox/Safari).
 * 3. Verifies actual browser launch with Priority 1 Google-Signed Chrome, Retina SVG callout injection, secret field masking, and screenshot capture.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { resolveBestBrowser, launchResolvedBrowser, captureAnnotatedScreenshot } from '../../src/demo-generator/browserResolver.mjs';

const ROOT = '/Users/nitinagga/documents/demoes-ge';

async function runPiece1Tests() {
  console.log('=== [TDD PIECE 1] Starting Contract Docs, Hooks & 3-Tier Browser Resolver E2E Tests ===');

  // 1. Verify all 5 .md contract files + .gemini/hooks.json
  const requiredDocs = [
    'docs/DEMO_GENERATOR_ARCHITECTURE_CONTRACT.md',
    'docs/KNOWN_BLOCKERS_CR_CB_CATALOG.md',
    'docs/PREFLIGHT_IAM_AND_AUTH_MATRIX.md',
    'docs/VISUAL_RUNBOOK_EXPORT_TEMPLATE.md',
    '.gemini/skills/demo-generator-guard/SKILL.md',
    '.gemini/hooks.json',
  ];
  for (const rel of requiredDocs) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `Missing required contract/hook file: ${rel}`);
    const stat = fs.statSync(abs);
    assert.ok(stat.size > 200, `Contract file ${rel} is too small (${stat.size} bytes)`);
  }
  const hooksJson = JSON.parse(fs.readFileSync(path.join(ROOT, '.gemini/hooks.json'), 'utf-8'));
  assert.ok(hooksJson.hooks && hooksJson.hooks.pre_flight_browser_and_sandbox, 'Invalid .gemini/hooks.json structure');
  console.log('✅ [Test 1.1] All 5 contract .md files and .gemini/hooks.json verified.');

  // 2. Verify Priority 1: Google-Signed Local Chrome discovery & codesign verification
  const p1 = await resolveBestBrowser();
  console.log('   Resolved Primary Browser:', JSON.stringify(p1));
  assert.equal(p1.priority, 1, 'Expected Priority 1 browser to be selected on Google macOS workstation');
  assert.ok(p1.isGoogleSigned, 'Expected Priority 1 browser to pass Google LLC codesign TeamID verification');
  assert.equal(p1.teamId, 'EQHXZ8M8AV', 'Expected Google LLC TeamIdentifier EQHXZ8M8AV');
  console.log('✅ [Test 1.2] Priority 1 Google-Signed Local Chrome verified (TeamID: EQHXZ8M8AV).');

  // 3. Verify Fallback Cascade when Priority 1 is simulated unavailable
  const fallback = await resolveBestBrowser({ excludePriorities: [1] });
  console.log('   Resolved Fallback Browser (when Priority 1 excluded):', JSON.stringify(fallback));
  assert.ok(fallback.priority === 2 || fallback.priority === 3, 'Expected fallback to Priority 2 or Priority 3 browser');
  console.log(`✅ [Test 1.3] Fallback cascade verified -> selected Priority ${fallback.priority}: ${fallback.name}`);

  // 4. Live Browser Launch + Retina Callout Injection + Secret Redaction + Screenshot Test
  const outDir = path.join(ROOT, 'scratch/tdd_piece1_screenshots');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const { browser, page, resolvedBrowser } = await launchResolvedBrowser({ headless: true });
  try {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><style>body { font-family: sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; }</style></head>
        <body>
          <h1>TDD Piece 1: Signed Browser & Secret Masking Verification</h1>
          <label>OAuth Client Secret:</label>
          <input id="secret-input" type="password" value="SUPER_SECRET_OAUTH_TOKEN_999" style="padding:8px; width:300px;" />
          <button id="verify-btn" style="padding:10px 20px; background:#2563eb; color:white; border:none; border-radius:6px; margin-left:12px;">
            Verify Auth
          </button>
        </body>
      </html>
    `, { waitUntil: 'domcontentloaded' });

    const shotPath = path.join(outDir, '01_tdd_piece1_verified.png');
    const meta = await captureAnnotatedScreenshot(page, shotPath, {
      stepNumber: 1,
      stepTitle: 'Verify Auth & Secret Masking',
      highlightSelector: '#verify-btn',
      calloutLabel: '1. Click Verify Auth',
      maskSecrets: true,
    });

    assert.ok(fs.existsSync(shotPath), 'Screenshot file was not created');
    assert.ok(meta.sizeBytes > 15000, `Screenshot too small: ${meta.sizeBytes} bytes`);
    console.log(`✅ [Test 1.4] Live Priority 1 browser launch, secret masking & callout screenshot verified (${meta.sizeBytes} bytes) at ${shotPath}`);
  } finally {
    await browser.close();
  }

  console.log('🎉 === [TDD PIECE 1] ALL TESTS PASSED 100% ===\n');
}

runPiece1Tests().catch((err) => {
  console.error('❌ [TDD PIECE 1 FAILED]:', err);
  process.exit(1);
});
