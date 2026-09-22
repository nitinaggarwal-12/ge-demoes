import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.MCP_PORT || 8788;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('scratch/screenshots_ui_audit');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function audit() {
  console.log('======================================================================');
  console.log('        COMPREHENSIVE UI PAGE-BY-PAGE AUDIT & P0 IDENTIFICATION       ');
  console.log('======================================================================');

  fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1600,1050',
    ],
    defaultViewport: { width: 1600, height: 1050, deviceScaleFactor: 2 },
  });

  const issues = [];

  try {
    const page = await browser.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('  [CONSOLE ERROR]', msg.text());
        issues.push({ type: 'CONSOLE_ERROR', detail: msg.text() });
      }
    });
    page.on('pageerror', err => {
      console.error('  [PAGE ERROR]', err.message);
      issues.push({ type: 'PAGE_ERROR', detail: err.message });
    });

    // Helper to check broken images on current page
    async function checkBrokenImages(context) {
      const broken = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.filter(img => {
          if (!img.src || img.src.startsWith('data:')) return false;
          return img.complete && img.naturalWidth === 0;
        }).map(img => img.src);
      });
      if (broken.length > 0) {
        issues.push({ type: 'BROKEN_IMAGES', context, count: broken.length, urls: broken.slice(0, 3) });
      }
    }

    // Helper to check horizontal overflow on container
    async function checkHorizontalOverflow(context) {
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      if (overflow) {
        issues.push({ type: 'HORIZONTAL_OVERFLOW', context, scrollWidth: overflow });
      }
    }

    // 1. Audit Tab: ServiceNow BYOMCP (Dark Mode)
    console.log('\n[1/8] Auditing Tab 1: ServiceNow BYOMCP (Dark Mode)...');
    await page.goto(`${BASE_URL}/?tab=servicenow`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await checkBrokenImages('tab-servicenow-dark');
    await checkHorizontalOverflow('tab-servicenow-dark');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_tab_servicenow_dark.png') });
    console.log('  Captured: 01_tab_servicenow_dark.png');

    // Test tool execution inside ServiceNow
    await page.click('button[onclick="executeCurrentTool()"]');
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_tab_servicenow_executed.png') });
    console.log('  Captured: 02_tab_servicenow_executed.png');

    // Toggle JSON View
    await page.click('#btnViewJson');
    await sleep(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_tab_servicenow_json_view.png') });
    console.log('  Captured: 03_tab_servicenow_json_view.png');
    await page.click('#btnViewTable');
    await sleep(400);

    // 2. Audit Tab: Veeva Vault GxP (Dark Mode)
    console.log('\n[2/8] Auditing Tab 2: Veeva Vault GxP (Dark Mode)...');
    await page.goto(`${BASE_URL}/?tab=veeva`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await checkBrokenImages('tab-veeva-dark');
    await checkHorizontalOverflow('tab-veeva-dark');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_tab_veeva_dark.png') });
    console.log('  Captured: 04_tab_veeva_dark.png');

    // Execute Veeva Tool Call
    await page.click('button[onclick="executeVeevaTool()"]');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_tab_veeva_executed.png') });
    console.log('  Captured: 05_tab_veeva_executed.png');

    // Toggle Veeva JSON View
    await page.click('#btnVeevaJson');
    await sleep(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_tab_veeva_json_view.png') });
    console.log('  Captured: 06_tab_veeva_json_view.png');
    await page.click('#btnVeevaTable');
    await sleep(400);

    // 2b. Audit Tab: Microsoft Unified Connector (Dark Mode)
    console.log('\n[2b/8] Auditing Tab: Microsoft Unified Connector (Dark Mode)...');
    await page.goto(`${BASE_URL}/?tab=microsoft`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await checkBrokenImages('tab-microsoft-dark');
    await checkHorizontalOverflow('tab-microsoft-dark');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06b_tab_microsoft_dark.png') });
    console.log('  Captured: 06b_tab_microsoft_dark.png');

    // Execute Microsoft Tool Call
    await page.$eval('#tab-microsoft .btn-run', el => el.click());
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06c_tab_microsoft_executed.png') });
    console.log('  Captured: 06c_tab_microsoft_executed.png');

    // 3. Audit Tab: Visual Gallery (All Workflows)
    console.log('\n[3/8] Auditing Tab 3: Visual Gallery (All 6 Workflows)...');
    await page.goto(`${BASE_URL}/?tab=gallery`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await checkBrokenImages('tab-gallery-all');
    await checkHorizontalOverflow('tab-gallery-all');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_tab_gallery_all.png') });
    console.log('  Captured: 07_tab_gallery_all.png');

    // Test Ground-Truth filtered gallery view
    await page.goto(`${BASE_URL}/?tab=gallery&group=ground-truth`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_tab_gallery_ground_truth.png') });
    console.log('  Captured: 08_tab_gallery_ground_truth.png');

    // 4. Audit Tab: OAuth & Specs
    console.log('\n[4/8] Auditing Tab 4: OAuth & Specs...');
    await page.goto(`${BASE_URL}/?tab=oauth`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await checkBrokenImages('tab-oauth');
    await checkHorizontalOverflow('tab-oauth');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_tab_oauth_specs.png') });
    console.log('  Captured: 09_tab_oauth_specs.png');

    // 5. Audit Slideshow Modal & Audio Player
    console.log('\n[5/8] Auditing Slideshow Modal, Audio Bar & Karaoke Subtitles...');
    await page.goto(`${BASE_URL}/?slide=15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison`, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await checkBrokenImages('slideshow-modal');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_slideshow_modal_default.png') });
    console.log('  Captured: 10_slideshow_modal_default.png');

    // Start Audio Narration
    await page.click('#btnNarrateAudio');
    await sleep(1200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_slideshow_modal_speaking.png') });
    console.log('  Captured: 11_slideshow_modal_speaking.png');
    await page.click('#btnNarrateAudio');
    await sleep(400);

    // Close Slideshow
    await page.keyboard.press('Escape');
    await sleep(600);

    // 6. Audit Print & PDF Export Modal
    console.log('\n[6/8] Auditing Print & PDF Export Modal...');
    await page.click('button[onclick="openPrintModal()"]');
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_print_modal.png') });
    console.log('  Captured: 12_print_modal.png');
    await page.click('.print-header button.lightbox-close');
    await sleep(600);

    // 7. Audit GCP Light Theme Mode across tabs
    console.log('\n[7/8] Auditing GCP Light Mode Theme across Tabs...');
    await page.click('#gcpThemeBtn');
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_servicenow_light_mode.png') });
    console.log('  Captured: 13_servicenow_light_mode.png');

    await page.goto(`${BASE_URL}/?tab=veeva`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_veeva_light_mode.png') });
    console.log('  Captured: 14_veeva_light_mode.png');

    await page.goto(`${BASE_URL}/?tab=gallery`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_gallery_light_mode.png') });
    console.log('  Captured: 15_gallery_light_mode.png');

    await page.goto(`${BASE_URL}/?tab=oauth`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_oauth_light_mode.png') });
    console.log('  Captured: 16_oauth_light_mode.png');

    // Switch back to Dark mode
    await page.click('#gcpThemeBtn');
    await sleep(500);

    // 8. Collapsed Sidebar Mode Audit
    console.log('\n[8/8] Auditing Collapsed Sidebar View...');
    await page.goto(`${BASE_URL}/?tab=servicenow`, { waitUntil: 'networkidle2' });
    await page.click('#sidebarToggleBtn');
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_collapsed_sidebar_view.png') });
    console.log('  Captured: 17_collapsed_sidebar_view.png');

    console.log('\n======================================================================');
    console.log(`  AUDIT COMPLETE: ${issues.length} ISSUES/WARNINGS DETECTED            `);
    console.log('======================================================================');
    issues.forEach((iss, i) => {
      console.log(`  Issue #${i + 1}: [${iss.type}]`, JSON.stringify(iss));
    });

  } finally {
    await browser.close();
  }
}

audit().catch(err => {
  console.error('\nAUDIT FAILED:', err.message);
  process.exit(1);
});
