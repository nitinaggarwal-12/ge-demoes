#!/usr/bin/env node
/**
 * TDD Piece 2 Verification Test:
 * Tests the Pre-Flight Validator, Co-Design Chatbot (including non-mutation fuzzing + mutation),
 * Checkpointed Saga Engine, Exactly-Once Outbox Deduplication, Partial Re-Run (v1.0 -> v1.1),
 * Failure Injection with Multi-Path Fallback Disclosure, Saga Rollback, and Autonomous Ticket Filing.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  createDemoSession,
  handleChatbotMessage,
  validateAndBuildPlan,
  executeApprovedPlan,
  modifySavedVersionPartial,
  rejectAndRollbackRun,
  fileEscalationOnBehalfOfUser,
} from '../../src/demo-generator/engine.mjs';

const ROOT = '/Users/nitinagga/documents/demoes-ge';

async function runPiece2Tests() {
  console.log('=== [TDD PIECE 2] Starting Pre-Flight, Chatbot, Checkpointing, Fallback & Ticket Filing E2E Tests ===');

  // 1. Create initial Demo Session
  const session = await createDemoSession({
    title: 'Merck Clinical Deviation & CAPA Triage Demo',
    prompt: 'Search ServiceNow GxP deviation incidents and create a linked CAPA ticket from Gemini Enterprise chat with inline citations.',
    connector: 'ServiceNow',
    mode: 'Mode 1: BYOMCP Server (Cloud Run / Local)',
    industry: 'Life Sciences / Pharma (GxP)',
    geAppUrl: 'https://vertexaisearch.cloud.google.com/home/cid/mmcg-did-rgpt-5872',
    gcpConsoleUrl: 'https://console.cloud.google.com/gen-app-builder/engines?project=mmcg-did-rgpt-5872',
    gcpProject: 'mmcg-did-rgpt-5872',
    region: 'global',
    authMechanism: 'Google-Signed Chrome SSO + OAuth 2.0 Client Credentials',
  });

  // Validate initial Plan v1.0
  const planV1 = await validateAndBuildPlan(session);
  assert.equal(planV1.version, 'v1.0', 'Expected initial plan version to be v1.0');
  assert.equal(planV1.steps.length, 12, 'Expected 12 end-to-end visual steps from Login (01) to Side-by-Side Verification (12)');
  assert.equal(planV1.preflight.browser.priority, 1, 'Expected Priority 1 Google-Signed Chrome in preflight');
  console.log('✅ [Test 2.1] Initial Plan v1.0 validated with 12 visual steps & Priority 1 browser.');

  // 2. Conversational & Intent Fuzzing Gate (4 Non-Mutation Cases MUST NOT bump version or mutate plan)
  const nonMutationCases = ['Hi', 'what can you do', 'thanks', 'fast'];
  for (const msg of nonMutationCases) {
    const res = await handleChatbotMessage(session, msg);
    assert.equal(res.mutatedInputs, false, `Expected "${msg}" NOT to mutate inputs`);
    assert.equal(session.currentPlan.version, 'v1.0', `Expected version to remain strictly v1.0 on "${msg}"`);
    assert.ok(res.reply && res.reply.length > 20, 'Expected friendly conversational reply');
  }
  console.log('✅ [Test 2.2] Conversational Fuzzing Gate passed (0 mutations, v1.0 unchanged across all 4 fuzz cases).');

  // 3. In-Chat Input Mutation & Re-Validation (Plan v1.0 -> Plan v1.1)
  const mutRes = await handleChatbotMessage(
    session,
    'Switch connector to Veeva Vault and add a prompt testing GxP SOP-4092 cold-chain compliance, then validate.'
  );
  assert.equal(mutRes.mutatedInputs, true, 'Expected mutation prompt to update session inputs');
  assert.equal(session.inputs.connector, 'Veeva Vault', 'Expected connector to update to Veeva Vault');
  assert.equal(session.currentPlan.version, 'v1.1', 'Expected re-validated plan version to bump to v1.1');
  console.log('✅ [Test 2.3] In-chat input mutation & re-validation verified (Plan v1.0 -> Plan v1.1 diff generated).');

  // 4. Execute Full Approved Plan (Checkpointed + Exactly-Once Deduplication)
  const runResult = await executeApprovedPlan(session, { headless: true });
  assert.equal(runResult.status, 'COMMITTED_READY_FOR_REVIEW', 'Expected full execution to succeed');
  assert.equal(runResult.completedSteps.length, 12, 'Expected all 12 steps to have checkpoints and screenshots');
  for (const step of runResult.completedSteps) {
    assert.ok(fs.existsSync(step.screenshotPath), `Missing screenshot for Step ${step.stepNumber}`);
    assert.ok(fs.existsSync(step.checkpointPath), `Missing WAL checkpoint for Step ${step.stepNumber}`);
  }
  // Verify Exactly-Once outbox deduplication on Step 10 write action
  assert.equal(runResult.outboxLedger.writeCount, 1, 'Expected Exactly-Once write count to equal 1 even when retry is simulated');
  console.log('✅ [Test 2.4] Full 12-step E2E execution, WAL checkpoints, screenshots, and Exactly-Once write deduplication verified.');

  // 5. Partial Modification Re-Run (Keep Steps 1-8 from Checkpoint, Only Re-Run Steps 9-12 -> v1.2)
  const partialRes = await modifySavedVersionPartial(session, {
    fromStep: 9,
    newPrompt: 'Query Veeva Vault SOP-4092 and create CAPA-2026-991 with multi-region EU compliance check.',
    headless: true,
  });
  assert.equal(partialRes.version, 'v1.2', 'Expected partial branch version v1.2');
  assert.equal(partialRes.reusedCheckpointsCount, 8, 'Expected Steps 1-8 to be restored directly from checkpoints without re-running');
  assert.equal(partialRes.reExecutedStepsCount, 4, 'Expected only Steps 9-12 to be re-executed');
  console.log('✅ [Test 2.5] Partial modification (v1.1 -> v1.2) reused Steps 1-8 checkpoints and re-ran only Steps 9-12.');

  // 6. Simulated Failure Injection + Multi-Path Goal-Seeking Fallback Disclosure + Progressive Screenshot Trail
  const failFallbackRes = await executeApprovedPlan(session, {
    headless: true,
    simulateStepFailure: {
      stepNumber: 4,
      errorCode: 'HTTP_403_1P_CONNECTOR_NOT_ALLOWLISTED',
      errorMessage: '1st-Party Connector requires project allowlisting in mmcg-did-rgpt-5872 (CB b/505111548).',
      allowAlternativeFallback: true,
    },
  });
  assert.equal(failFallbackRes.status, 'GOAL_ACHIEVED_VIA_ALTERNATIVE_PATH', 'Expected engine to achieve goal via Path B (BYOMCP)');
  const step4Trace = failFallbackRes.completedSteps.find((s) => s.stepNumber === 4);
  assert.ok(step4Trace.failureScreenshotPath && fs.existsSync(step4Trace.failureScreenshotPath), 'Expected failure screenshot at Step 4');
  assert.equal(step4Trace.attempts.length, 2, 'Expected Attempt 1 (Failed 1P) + Attempt 2 (Succeeded BYOMCP Fallback)');
  assert.equal(step4Trace.attempts[0].outcome, 'FAILED', 'Expected Attempt 1 outcome to be transparently logged as FAILED');
  assert.equal(step4Trace.attempts[1].outcome, 'SUCCEEDED_VIA_FALLBACK', 'Expected Attempt 2 outcome to be logged as SUCCEEDED_VIA_FALLBACK');
  console.log('✅ [Test 2.6] Failure screenshot capture + Multi-Path Goal-Seeking Fallback (Path A -> Path B) with honest disclosure verified.');

  // 7. Autonomous Ticket Filing on Behalf of User + Visual Confirmation Receipt
  const ticketReceipt = await fileEscalationOnBehalfOfUser(session, {
    stepNumber: 4,
    issueType: 'CR_LINKED_TO_CB',
    matchedCbId: 'b/505111548',
    customerName: 'Merck & Co., Inc.',
    headless: true,
  });
  assert.ok(ticketReceipt.createdIssueId.startsWith('b/'), 'Expected minted Buganizer ID');
  assert.ok(fs.existsSync(ticketReceipt.formPreviewScreenshot), 'Missing pre-submit ticket form screenshot');
  assert.ok(fs.existsSync(ticketReceipt.confirmationScreenshot), 'Missing live filed ticket confirmation screenshot');
  console.log(`✅ [Test 2.7] Autonomous Ticket Filing on behalf of user verified -> Created ${ticketReceipt.createdIssueId} with 2 visual confirmation screenshots.`);

  // 8. Saga Compensating Rollback on Reject
  const rollbackRes = await rejectAndRollbackRun(session);
  assert.equal(rollbackRes.status, 'ROLLED_BACK_CLEAN', 'Expected Saga rollback to clean up ephemeral resources');
  assert.ok(rollbackRes.compensatedSteps.length > 0, 'Expected compensating undo transactions to execute');
  console.log('✅ [Test 2.8] Saga compensating rollback on Reject verified.');

  console.log('🎉 === [TDD PIECE 2] ALL TESTS PASSED 100% ===\n');
}

runPiece2Tests().catch((err) => {
  console.error('❌ [TDD PIECE 2 FAILED]:', err);
  process.exit(1);
});
