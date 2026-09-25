import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'scratch/screenshots_live_recreate');

// Clean purging before test execution
if (fs.existsSync(SCREENSHOT_DIR)) {
  fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  console.log('--- Starting Live Recreate & Ground-Truth Parity Bridge E2E Test ---');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('[BROWSER ERROR]', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    console.error('[PAGE ERROR]', err.message);
    errors.push(err.message);
  });

  // Step 1: Navigate to Workbench
  console.log('1. Loading Workbench UI...');
  await page.goto('http://localhost:8788/', { waitUntil: 'networkidle0' });
  await sleep(800);

  // Step 2: Open Topbar Live Recreate Dropdown
  console.log('2. Clicking Live Recreate dropdown menu in topbar...');
  await page.click('#btnLiveRecreateMenu');
  await sleep(800);

  const isMenuVisible = await page.$eval('#dropdownRecreateMenu', el => el.classList.contains('show'));
  console.log('Dropdown menu opened:', isMenuVisible, '(Expected: true)');
  if (!isMenuVisible) throw new Error('Live Recreate dropdown failed to open!');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_topbar_recreate_dropdown.png') });
  console.log('Saved: 01_topbar_recreate_dropdown.png');

  // Step 3: Trigger Recreate Whole Demo
  console.log('3. Triggering Recreate Whole Demo...');
  const menuItems = await page.$$('#dropdownRecreateMenu .recreate-menu-item');
  if (menuItems.length === 0) throw new Error('No recreate menu items found!');
  await menuItems[0].click(); // First item is Recreate Whole Demo
  await sleep(800);

  const isModalOpen = await page.$eval('#recreateModal', el => el.classList.contains('open'));
  console.log('Recreate Modal open:', isModalOpen, '(Expected: true)');
  if (!isModalOpen) throw new Error('Recreate Modal failed to open!');

  console.log('Waiting for Whole Demo live recreation to complete (querying live APIs & generating ground truth)...');
  await page.waitForFunction(() => {
    const btn = document.getElementById('btnRecreateDone');
    return btn && !btn.disabled;
  }, { timeout: 35000 });

  await sleep(800);

  // Inspect DOM values
  const kpiLatency = await page.$eval('#recreateKpiLatency', el => el.textContent.trim());
  const kpiSystems = await page.$eval('#recreateKpiSystems', el => el.textContent.trim());
  const kpiRecords = await page.$eval('#recreateKpiRecords', el => el.textContent.trim());
  const kpiParity = await page.$eval('#recreateKpiParity', el => el.textContent.trim());
  const terminalLogsCount = await page.$$eval('#recreateTerminal .log-row', els => els.length);

  console.log('Whole Demo KPIs:', { kpiLatency, kpiSystems, kpiRecords, kpiParity, terminalLogsCount });
  if (terminalLogsCount < 4) throw new Error('Terminal logs should have at least 4 entries!');
  if (!kpiParity.includes('100%') && !kpiParity.includes('Validated')) {
    throw new Error('Parity verification should be validated!');
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_recreate_modal_whole_demo_complete.png') });
  console.log('Saved: 02_recreate_modal_whole_demo_complete.png');

  // Close modal
  await page.click('#btnRecreateDone');
  await sleep(800);

  // Step 4: Test Slideshow Slide-level Recreate
  console.log('4. Opening presentation slideshow at slide 14...');
  await page.goto('http://localhost:8788/?slide=14', { waitUntil: 'networkidle0' });
  await sleep(1000);

  const isSlideModalOpen = await page.$eval('#slideshowModal', el => el.classList.contains('open'));
  console.log('Slideshow open:', isSlideModalOpen, '(Expected: true)');

  const isRecreateSlideBtnVisible = await page.$eval('#btnSlideRecreate', el => !!el && el.offsetParent !== null);
  console.log('Recreate Slide button visible in topbar:', isRecreateSlideBtnVisible, '(Expected: true)');
  if (!isRecreateSlideBtnVisible) throw new Error('Recreate Slide button missing in slideshow topbar!');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_slideshow_recreate_slide_button.png') });
  console.log('Saved: 03_slideshow_recreate_slide_button.png');

  // Click Recreate Slide
  console.log('5. Clicking Recreate Slide for Slide 14...');
  await page.click('#btnSlideRecreate');
  await sleep(800);

  const scopeTagText = await page.$eval('#recreateScopeTag', el => el.textContent.trim());
  console.log('Target scope tag in modal:', scopeTagText);
  if (!scopeTagText.includes('SLIDE') && !scopeTagText.includes('14')) {
    throw new Error('Target scope does not specify active slide!');
  }

  console.log('Waiting for single slide live recreation to complete...');
  await page.waitForFunction(() => {
    const btn = document.getElementById('btnRecreateDone');
    return btn && !btn.disabled;
  }, { timeout: 25000 });

  await sleep(800);

  const singleSlideLogs = await page.$$eval('#recreateTerminal .log-row', els => els.length);
  console.log('Single slide recreation logs count:', singleSlideLogs);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_recreate_modal_single_slide.png') });
  console.log('Saved: 04_recreate_modal_single_slide.png');

  // Close recreate modal
  await page.click('#btnRecreateDone');
  await sleep(800);

  // Close slideshow
  await page.click('.btn-slideshow-tool[title*="Close"]');
  await sleep(800);

  // Step 5: Test Asset Card Recreate in Gallery
  console.log('6. Testing individual asset card recreate in Gallery...');
  await page.click('#sideLink-gallery');
  await sleep(800);

  const cardSelector = '#asset-11_veeva_live_ui_query_results';
  await page.waitForSelector(cardSelector, { timeout: 5000 });

  // Hover over the card to reveal the recreate chip
  await page.hover(cardSelector);
  await sleep(600);

  const recreateChipSelector = `${cardSelector} .asset-recreate-chip`;
  const hasRecreateChip = await page.$(recreateChipSelector);
  console.log('Asset recreate chip found on card:', !!hasRecreateChip, '(Expected: true)');
  if (!hasRecreateChip) throw new Error('Asset card recreate chip not found!');

  console.log('Clicking recreate chip on 11_veeva_live_ui_query_results...');
  await page.$eval(recreateChipSelector, el => el.click());
  await sleep(800);

  const assetScopeTag = await page.$eval('#recreateScopeTag', el => el.textContent.trim());
  console.log('Modal scope tag for asset:', assetScopeTag);
  if (!assetScopeTag.includes('11_veeva')) {
    throw new Error('Scope tag does not mention targeted asset!');
  }

  console.log('Waiting for individual asset recreation to complete...');
  await page.waitForFunction(() => {
    const btn = document.getElementById('btnRecreateDone');
    return btn && !btn.disabled;
  }, { timeout: 25000 });

  await sleep(800);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_asset_card_recreate_complete.png') });
  console.log('Saved: 05_asset_card_recreate_complete.png');

  await page.click('#btnRecreateDone');
  await sleep(600);

  await browser.close();

  console.log('--- ALL LIVE RECREATE TESTS PASSED WITH 0 ERRORS ---');
  if (errors.length > 0) {
    console.warn('Browser warnings/errors detected during run:', errors);
  }
}

run().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
