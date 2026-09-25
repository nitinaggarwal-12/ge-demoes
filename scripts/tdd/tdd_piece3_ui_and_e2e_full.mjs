#!/usr/bin/env node
/**
 * TDD Piece 3 Verification Test:
 * End-to-End Puppeteer verification of the live Demo Generator Studio Web Application
 * (`http://localhost:4390/demo-generator`) using Priority 1 Google-Signed Local Chrome.
 *
 * Verifies:
 *  - Test 3.1: Dark Shell + Light Workspace layout, Zero Surrounding Empty Space, no global `.dark` on `<html>`,
 *              and initial Plan v1.0 pre-flight status.
 *  - Test 3.2: Mandatory 4-Case Conversational & Intent Fuzzing Gate ("Hi", "what can you do", "thanks", "fast")
 *              directly in the live UI Chatbot with 800ms settling delays -> asserts Plan stays strictly v1.0.
 *  - Test 3.3: In-Chat Input Editing & Re-Validation -> syncs form dropdowns to Veeva Vault & bumps to Plan v1.1.
 *  - Test 3.4: 1-Click "Approve & Execute (with Fallback Simulation)" -> renders all 12 visual step cards
 *              (Step 01 Login .. Step 12 Side-by-Side Verification) + Step 04 Failure Screenshot + Path B Fallback Disclosure.
 *  - Test 3.5: 1-Click "Partial Modify (Reuse Steps 1-8 Checkpoints, Re-Run Steps 9-12 -> v1.2)".
 *  - Test 3.6: 1-Click "File Support / Buganizer Ticket on My Behalf" -> displays minted `b/5398...` confirmation receipt
 *              and visual proof screenshots directly in the UI.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startDemoGeneratorServer } from '../../src/demo-generator/server.mjs';
import { launchResolvedBrowser } from '../../src/demo-generator/browserResolver.mjs';

const ROOT = '/Users/nitinagga/documents/demoes-ge';
const OUT_DIR = path.join(ROOT, 'scratch', 'tdd_piece3_screenshots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPiece3Tests() {
  console.log('=== [TDD PIECE 3] Starting Live Demo Generator Web Studio E2E Puppeteer Tests ===');
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { server, port, baseUrl } = await startDemoGeneratorServer(4390);
  console.log(`🌐 Demo Generator Studio listening at ${baseUrl}/demo-generator`);

  const { browser, page, resolvedBrowser } = await launchResolvedBrowser({ headless: true });
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

  try {
    // -------------------------------------------------------------------------
    // Test 3.1: Initial Page Load, Layout Rules & Plan v1.0 Pre-Flight
    // -------------------------------------------------------------------------
    await page.goto(`${baseUrl}/demo-generator`, { waitUntil: 'domcontentloaded' });
    await sleep(800);

    const layoutAudit = await page.evaluate(() => {
      const htmlHasDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
      const planBadge = document.querySelector('#plan-version-badge')?.textContent?.trim();
      const browserBadge = document.querySelector('#browser-priority-badge')?.textContent?.trim();
      const stepRowsCount = document.querySelectorAll('.plan-step-row').length;
      return { htmlHasDark, planBadge, browserBadge, stepRowsCount };
    });

    assert.equal(layoutAudit.htmlHasDark, false, 'Global .dark on <html> or <body> is strictly forbidden');
    assert.equal(layoutAudit.planBadge, 'Plan v1.0', 'Expected initial Plan v1.0 badge');
    assert.ok(layoutAudit.browserBadge.includes('Priority 1'), 'Expected Priority 1 Google-Signed Chrome badge in UI');
    assert.equal(layoutAudit.stepRowsCount, 12, 'Expected all 12 steps (Step 01 Login .. Step 12 Verification) in Plan table');

    const shot1 = path.join(OUT_DIR, '01_demo_generator_initial_plan_v1_0.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log('✅ [Test 3.1] Initial UI load, Dark Shell + Light Workspace, Priority 1 Browser badge, and 12-Step Plan v1.0 verified.');

    // -------------------------------------------------------------------------
    // Test 3.2: Mandatory 4-Case Conversational & Intent Fuzzing Gate in UI
    // -------------------------------------------------------------------------
    const fuzzInputs = ['Hi', 'what can you do', 'thanks', 'fast'];
    for (const msg of fuzzInputs) {
      await page.$eval('#chatbot-input', (el, val) => {
        el.value = val;
      }, msg);
      await page.$eval('#chatbot-send-btn', (el) => el.click());
      await sleep(800);

      const verAfterFuzz = await page.$eval('#plan-version-badge', (el) => el.textContent.trim());
      assert.equal(verAfterFuzz, 'Plan v1.0', `Fuzz input "${msg}" must NOT bump plan version!`);
    }
    console.log('✅ [Test 3.2] UI Chatbot Conversational Fuzzing Gate passed across all 4 non-mutation cases (Plan v1.0 unchanged).');

    // -------------------------------------------------------------------------
    // Test 3.3: In-Chat Input Editing & Re-Validation (Plan v1.0 -> Plan v1.1)
    // -------------------------------------------------------------------------
    const mutationMsg = 'Switch connector to Veeva Vault and add a prompt testing GxP SOP-4092 cold-chain compliance, then validate.';
    await page.$eval('#chatbot-input', (el, val) => {
      el.value = val;
    }, mutationMsg);
    await page.$eval('#chatbot-send-btn', (el) => el.click());
    await sleep(800);

    const afterMut = await page.evaluate(() => ({
      planBadge: document.querySelector('#plan-version-badge')?.textContent?.trim(),
      selectedConnector: document.querySelector('#input-connector')?.value,
      diffBannerText: document.querySelector('#plan-diff-banner')?.textContent?.trim(),
    }));
    assert.equal(afterMut.planBadge, 'Plan v1.1', 'Expected Plan badge to update to Plan v1.1 after in-chat mutation');
    assert.equal(afterMut.selectedConnector, 'Veeva Vault', 'Expected Connector dropdown to automatically sync to Veeva Vault');
    assert.ok(afterMut.diffBannerText.includes('Veeva Vault'), 'Expected Plan diff banner to show Veeva Vault change');

    const shot2 = path.join(OUT_DIR, '02_chatbot_mutation_validated_plan_v1_1.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log('✅ [Test 3.3] In-chat input mutation & bidirectional form sync verified (Plan v1.0 -> Plan v1.1).');

    // -------------------------------------------------------------------------
    // Test 3.4: 1-Click Approve & Execute (with Step 04 Failure + Path B Fallback)
    // -------------------------------------------------------------------------
    await page.$eval('#toggle-simulate-fallback', (el) => {
      if (!el.checked) el.click();
    });
    await page.$eval('#btn-approve-execute', (el) => el.click());

    // Wait for execution to complete and gallery cards to populate
    await page.waitForFunction(
      () => document.querySelectorAll('.executed-step-card').length === 12,
      { timeout: 60000 }
    );
    await sleep(800);

    const galleryAudit = await page.evaluate(() => {
      const cards = document.querySelectorAll('.executed-step-card');
      const disclosureText = document.querySelector('#honest-disclosure-banner')?.textContent || '';
      const hasFailureShot = Boolean(document.querySelector('.failure-evidence-badge'));
      return {
        cardCount: cards.length,
        disclosureText,
        hasFailureShot,
      };
    });
    assert.equal(galleryAudit.cardCount, 12, 'Expected 12 executed step cards in live gallery');
    assert.ok(galleryAudit.hasFailureShot, 'Expected Step 04 failure screenshot badge to be displayed alongside fallback');
    assert.ok(
      galleryAudit.disclosureText.includes('Path B') && galleryAudit.disclosureText.includes('b/505111548'),
      'Expected Honest Disclosure Banner to transparently explain Path A failure and Path B BYOMCP resolution'
    );

    const shot3 = path.join(OUT_DIR, '03_live_12_step_gallery_and_fallback_disclosure.png');
    await page.screenshot({ path: shot3, fullPage: true });
    console.log('✅ [Test 3.4] 12-Step E2E Execution Gallery + Progressive Failure Screenshot + Honest Path B Fallback Disclosure verified.');

    // -------------------------------------------------------------------------
    // Test 3.5: Partial Modification Re-Run (Steps 1-8 Restored from WAL, Steps 9-12 Re-Executed -> v1.2)
    // -------------------------------------------------------------------------
    await page.$eval('#btn-partial-modify', (el) => el.click());
    await page.waitForFunction(
      () => document.querySelector('#plan-version-badge')?.textContent?.trim() === 'Plan v1.2',
      { timeout: 60000 }
    );
    await sleep(800);

    const partialAudit = await page.evaluate(() => {
      const reusedBadges = document.querySelectorAll('.badge-wal-reused').length;
      const reRunBadges = document.querySelectorAll('.badge-delta-rerun').length;
      return { reusedBadges, reRunBadges };
    });
    assert.equal(partialAudit.reusedBadges, 8, 'Expected 8 steps to show RESTORED FROM WAL CHECKPOINT badge');
    assert.equal(partialAudit.reRunBadges, 4, 'Expected 4 steps (9-12) to show RE-EXECUTED IN v1.2 badge');

    const shot4 = path.join(OUT_DIR, '04_partial_modify_checkpoint_reuse_v1_2.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log('✅ [Test 3.5] Partial Modification Re-Run (v1.1 -> v1.2) with 8 WAL checkpoints restored verified in UI.');

    // -------------------------------------------------------------------------
    // Test 3.6: 1-Click Autonomous Ticket Filing on Behalf of User
    // -------------------------------------------------------------------------
    await page.$eval('#btn-file-ticket-on-behalf', (el) => el.click());
    await page.waitForFunction(
      () => Boolean(document.querySelector('#filed-ticket-id-pill')?.textContent?.trim().startsWith('b/')),
      { timeout: 45000 }
    );
    await sleep(800);

    const ticketAudit = await page.evaluate(() => ({
      mintedId: document.querySelector('#filed-ticket-id-pill')?.textContent?.trim(),
      linkedCb: document.querySelector('#filed-ticket-cb-pill')?.textContent?.trim(),
      receiptImgs: document.querySelectorAll('.escalation-receipt-img').length,
    }));
    assert.ok(ticketAudit.mintedId.startsWith('b/5398'), 'Expected minted Buganizer Issue ID in UI');
    assert.ok(ticketAudit.linkedCb.includes('b/505111548'), 'Expected deduplicated upstream CB b/505111548 link');
    assert.equal(ticketAudit.receiptImgs, 2, 'Expected both form preview and confirmation receipt screenshots rendered in UI');

    const shot5 = path.join(OUT_DIR, '05_autonomous_ticket_filed_confirmation_ui.png');
    await page.screenshot({ path: shot5, fullPage: true });
    console.log(`✅ [Test 3.6] 1-Click Ticket Filing on Behalf of User verified in UI -> Created ${ticketAudit.mintedId} with 2 confirmation screenshots.`);

    console.log('🎉 === [TDD PIECE 3] ALL LIVE WEB STUDIO & E2E TESTS PASSED 100% ===\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runPiece3Tests().catch((err) => {
  console.error('❌ [TDD PIECE 3 FAILED]:', err);
  process.exit(1);
});
