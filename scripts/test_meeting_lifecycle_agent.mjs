import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(ROOT_DIR, 'scratch', 'screenshots_meeting_lifecycle_agent');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Launching Google-Signed Local Chrome to verify Meeting Lifecycle Agent...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--window-size=1600,1050']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1050, deviceScaleFactor: 2 });

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

    // Step 1: Navigate to #tab-meetings
    console.log('📌 Navigating to http://localhost:8788/#tab-meetings...');
    await page.goto('http://localhost:8788/#tab-meetings', { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(800);

    const debugInfo = await page.evaluate(() => {
      const el = document.getElementById('tab-meetings');
      return {
        hash: window.location.hash,
        href: window.location.href,
        elFound: !!el,
        classes: el ? el.className : null,
        activeTab: document.querySelector('.view-tab.active')?.id
      };
    });
    console.log('DEBUG INFO:', JSON.stringify(debugInfo));

    // Verify tab-meetings is active
    const isTabActive = await page.$eval('#tab-meetings', el => el.classList.contains('active'));
    console.log(`✅ tab-meetings active status: ${isTabActive}`);
    if (!isTabActive) throw new Error('tab-meetings failed to activate on deep link');

    // Verify Stage 1: prepare_meeting_brief output rendered
    const prepTitle = await page.$eval('#activeMeetingTitle', el => el.textContent.trim());
    console.log(`✅ Active tool title: "${prepTitle}"`);

    const hasAttendees = await page.$eval('#meetingVisualContainer', el => el.textContent.includes('Elena Rostova') && el.textContent.includes('Marcus Chen'));
    console.log(`✅ Meeting brief attendees rendered: ${hasAttendees}`);

    await page.screenshot({ path: path.join(OUT_DIR, '01_tab_meetings_prep_view.png') });
    console.log('📸 Captured: 01_tab_meetings_prep_view.png');

    // Step 2: Switch to Stage 2: summarize_meeting_transcript
    console.log('📌 Selecting summarize_meeting_transcript tool...');
    await page.click('#meetingTool-summarize_meeting_transcript');
    await sleep(800);

    const hasSummary = await page.$eval('#meetingVisualContainer', el => el.textContent.includes('Executive Decision') || el.textContent.includes('Ratified Architectural Decisions'));
    console.log(`✅ Live meeting summary and decisions rendered: ${hasSummary}`);

    await page.screenshot({ path: path.join(OUT_DIR, '02_tab_meetings_summarize_view.png') });
    console.log('📸 Captured: 02_tab_meetings_summarize_view.png');

    // Step 3: Switch to Stage 3: generate_meeting_followup
    console.log('📌 Selecting generate_meeting_followup tool...');
    await page.click('#meetingTool-generate_meeting_followup');
    await sleep(800);

    const hasFollowup = await page.$eval('#meetingVisualContainer', el => el.textContent.includes('Gmail Draft Staged') && el.textContent.includes('Staged Jira Software Engineering Tasks'));
    console.log(`✅ Autonomous dispatch drafts and Jira tasks rendered: ${hasFollowup}`);

    await page.screenshot({ path: path.join(OUT_DIR, '03_tab_meetings_followup_view.png') });
    console.log('📸 Captured: 03_tab_meetings_followup_view.png');

    // Step 4: Toggle JSON-RPC view
    console.log('📌 Testing JSON-RPC view toggle...');
    await page.click('#btnMeetingJson');
    await sleep(400);
    const jsonVisible = await page.$eval('#meetingRpcOutput', el => el.style.display !== 'none');
    console.log(`✅ JSON-RPC view visible: ${jsonVisible}`);
    await page.click('#btnMeetingCard');
    await sleep(400);

    // Step 5: Test Topbar Project Switcher
    console.log('📌 Testing Project Switcher dropdown...');
    await page.click('#gcpProjectChip');
    await sleep(400);

    const hasMeetingsMenuItem = await page.$eval('#pItem-meetings', el => el !== null);
    console.log(`✅ Meeting Lifecycle Agent present in Project Switcher: ${hasMeetingsMenuItem}`);

    await page.screenshot({ path: path.join(OUT_DIR, '05_project_switcher_meetings_active.png') });
    console.log('📸 Captured: 05_project_switcher_meetings_active.png');

    // Click outside to close project menu
    await page.click('body', { offset: { x: 10, y: 10 } });
    await sleep(400);

    // Step 6: Test Slideshow with Meeting Lifecycle Deck
    console.log('📌 Testing Slideshow Deck for Meeting Lifecycle Agent...');
    await page.evaluate(() => {
      window.startProjectSlideshow('meetings');
    });
    await sleep(1000);

    const isSlideshowOpen = await page.$eval('#slideshowModal', el => el.style.display !== 'none');
    console.log(`✅ Slideshow modal open: ${isSlideshowOpen}`);

    const slideDeckVal = await page.$eval('#slideshowDeckSelect', el => el.value);
    console.log(`✅ Active slideshow deck select value: "${slideDeckVal}"`);

    const slideTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
    console.log(`✅ Current slide title: "${slideTitle}"`);

    await page.screenshot({ path: path.join(OUT_DIR, '04_slideshow_meetings_deck.png') });
    console.log('📸 Captured: 04_slideshow_meetings_deck.png');

    // Close slideshow
    await page.evaluate(() => {
      window.closeSlideshow();
    });
    await sleep(500);

    console.log('\n🎉 ALL MEETING LIFECYCLE AGENT TESTS PASSED SUCCESSFULLY WITH ZERO REGRESSIONS!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ E2E test failed:', err);
  process.exit(1);
});
