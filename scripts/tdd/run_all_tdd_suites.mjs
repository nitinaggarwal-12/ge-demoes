#!/usr/bin/env node
/**
 * Master TDD Verification Suite Runner:
 * Executes all 3 TDD pieces sequentially and verifies 100% exit code 0 across:
 *  - Piece 1: 3-Tier Browser Priority Resolver (Google-Signed Chrome P1 -> Generic Chrome P2 -> Edge/Firefox/Safari P3) & Architecture Contracts
 *  - Piece 2: Pre-Flight Validator, Co-Design Chatbot Fuzzing & Mutation, Checkpointed Saga Engine, Exactly-Once Outbox, Partial Re-Run, Multi-Path Fallback & Ticket Filing
 *  - Piece 3: Live Demo Generator Studio Web UI (`http://127.0.0.1:4390/demo-generator`) Full E2E Puppeteer Verification
 */
import { execSync } from 'node:child_process';

const suites = [
  'scripts/tdd/tdd_piece1_browser_and_contracts.mjs',
  'scripts/tdd/tdd_piece2_checkpoint_and_fallback.mjs',
  'scripts/tdd/tdd_piece3_ui_and_e2e_full.mjs',
];

console.log('================================================================================');
console.log('🚀 RUNNING FULL 3-STAGE TDD VERIFICATION SUITE FOR GEMINI ENTERPRISE DEMO STUDIO');
console.log('================================================================================\n');

for (const script of suites) {
  console.log(`▶️ Executing: node ${script}`);
  execSync(`node ${script}`, {
    cwd: '/Users/nitinagga/documents/demoes-ge',
    stdio: 'inherit',
  });
}

console.log('================================================================================');
console.log('✅ ALL 3 TDD SUITES (PIECE 1 + PIECE 2 + PIECE 3) PASSED 100% ZERO DEFECTS!');
console.log('================================================================================');
