import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.MCP_PORT || 8788;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('scratch/screenshots_unique_links');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('======================================================================');
  console.log('  E2E TEST: UNIQUE DEEP LINKS, ASSET IDS, & BIDIRECTIONAL MAPPINGS   ');
  console.log('======================================================================');

  fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('\n[1/7] Launching Google Chrome...');
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

  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.error('  PAGE ERROR:', err.message));

    // TEST 1: Deep link to Veeva Tab (?tab=veeva)
    console.log('\n[2/7] Testing Deep Link to Veeva Vault Tab (?tab=veeva)...');
    await page.goto(`${BASE_URL}/?tab=veeva`, { waitUntil: 'networkidle2' });
    await sleep(800);

    const isVeevaActive = await page.$eval('#tab-veeva', el => el.classList.contains('active'));
    const isServiceNowInactive = await page.$eval('#tab-servicenow', el => !el.classList.contains('active'));
    console.log(`  Tab Veeva Active: ${isVeevaActive}, ServiceNow Inactive: ${isServiceNowInactive}`);
    if (!isVeevaActive || !isServiceNowInactive) {
      throw new Error('Deep link ?tab=veeva failed to activate Veeva tab');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_deep_link_tab_veeva.png') });
    console.log('  Saved: 01_deep_link_tab_veeva.png');

    // TEST 2: Deep link to Tool Demo (?tab=servicenow&tool=get_servicenow_incident)
    console.log('\n[3/7] Testing Deep Link to ServiceNow Tool (?tab=servicenow&tool=get_servicenow_incident)...');
    await page.goto(`${BASE_URL}/?tab=servicenow&tool=get_servicenow_incident`, { waitUntil: 'networkidle2' });
    await sleep(800);

    const isToolSelected = await page.$eval('#tool-get_servicenow_incident', el => el.classList.contains('selected'));
    const toolTitle = await page.$eval('#activeToolTitle', el => el.textContent.trim());
    console.log(`  Tool Selected: ${isToolSelected}, Title: "${toolTitle}"`);
    if (!isToolSelected || !toolTitle.includes('get_servicenow_incident')) {
      throw new Error('Deep link ?tool=get_servicenow_incident failed to select tool');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_deep_link_tool_selected.png') });
    console.log('  Saved: 02_deep_link_tool_selected.png');

    // TEST 3: Deep link to Gallery Workflow Group (?tab=gallery&group=ground-truth)
    console.log('\n[4/7] Testing Deep Link to Gallery Workflow Group (?tab=gallery&group=ground-truth)...');
    await page.goto(`${BASE_URL}/?tab=gallery&group=ground-truth`, { waitUntil: 'networkidle2' });
    await sleep(800);

    const isGalleryActive = await page.$eval('#tab-gallery', el => el.classList.contains('active'));
    const groundTruthDisplay = await page.$eval('#workflow-ground-truth', el => el.style.display);
    const gcpWizardDisplay = await page.$eval('#workflow-gcp-wizard', el => el.style.display);
    console.log(`  Gallery Tab Active: ${isGalleryActive}, Ground Truth Display: "${groundTruthDisplay}", GCP Wizard Display: "${gcpWizardDisplay}"`);
    if (!isGalleryActive || groundTruthDisplay === 'none' || gcpWizardDisplay !== 'none') {
      throw new Error('Deep link ?group=ground-truth failed to filter gallery sections properly');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_deep_link_workflow_ground_truth.png') });
    console.log('  Saved: 03_deep_link_workflow_ground_truth.png');

    // TEST 4: Deep link to Underlying Asset / Slide (?slide=15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison)
    console.log('\n[5/7] Testing Deep Link directly to Asset / Slide (?slide=15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison)...');
    await page.goto(`${BASE_URL}/?slide=15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const isModalOpen = await page.$eval('#slideshowModal', el => el.classList.contains('open'));
    const slideAssetId = await page.$eval('#slideAssetIdText', el => el.textContent.trim());
    const slideTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
    console.log(`  Slideshow Open: ${isModalOpen}`);
    console.log(`  Slide Asset ID: "${slideAssetId}"`);
    console.log(`  Slide Title: "${slideTitle}"`);

    if (!isModalOpen || slideAssetId !== '15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison') {
      throw new Error(`Deep link failed to open slideshow to asset 15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison (got ${slideAssetId})`);
    }

    // Verify linked demo button is visible and links to get_servicenow_incident
    const isLinkedDemoVisible = await page.$eval('#slideLinkedDemoBtn', el => el.style.display !== 'none');
    const linkedDemoText = await page.$eval('#slideLinkedDemoLabel', el => el.textContent.trim());
    console.log(`  Linked Demo Button Visible: ${isLinkedDemoVisible}, Label: "${linkedDemoText}"`);
    if (!isLinkedDemoVisible || !linkedDemoText.includes('get_servicenow_incident')) {
      throw new Error(`Expected linked demo button for get_servicenow_incident, got "${linkedDemoText}"`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_deep_link_asset_slideshow.png') });
    console.log('  Saved: 04_deep_link_asset_slideshow.png');

    // TEST 5: Bidirectional Jump (Slide -> Demo Tool)
    console.log('\n[6/7] Testing Bidirectional Jump: Slide -> Demo Tool...');
    await page.click('#slideLinkedDemoBtn');
    await sleep(800);

    const isSlideshowClosed = await page.$eval('#slideshowModal', el => !el.classList.contains('open'));
    const isNowServiceNowActive = await page.$eval('#tab-servicenow', el => el.classList.contains('active'));
    const isGetIncidentSelected = await page.$eval('#tool-get_servicenow_incident', el => el.classList.contains('selected'));
    console.log(`  Slideshow Closed: ${isSlideshowClosed}, Tab ServiceNow: ${isNowServiceNowActive}, Tool Selected: ${isGetIncidentSelected}`);
    if (!isSlideshowClosed || !isNowServiceNowActive || !isGetIncidentSelected) {
      throw new Error('Bidirectional jump from slide to demo tool failed');
    }

    // Now test Jump from Demo Tool back to Asset (Demo Tool -> Slide)
    console.log('  Testing Bidirectional Jump: Demo Tool -> Slide...');
    await page.click('#tool-get_servicenow_incident .linked-asset-link');
    await sleep(800);

    const isSlideshowReopened = await page.$eval('#slideshowModal', el => el.classList.contains('open'));
    const reopenedAssetId = await page.$eval('#slideAssetIdText', el => el.textContent.trim());
    console.log(`  Slideshow Re-opened: ${isSlideshowReopened}, Asset ID: "${reopenedAssetId}"`);
    if (!isSlideshowReopened || reopenedAssetId !== '15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison') {
      throw new Error('Bidirectional jump from demo tool to slide failed');
    }

    // TEST 6: Idempotent Reload Quality Gate
    console.log('\n[7/7] Testing Mandatory URI Addressability & Idempotent Reload Quality Gate...');
    console.log('  Executing page.reload()...');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1200);

    const isModalOpenAfterReload = await page.$eval('#slideshowModal', el => el.classList.contains('open'));
    const assetIdAfterReload = await page.$eval('#slideAssetIdText', el => el.textContent.trim());
    const currentUrl = page.url();
    console.log(`  Current URL after reload: ${currentUrl}`);
    console.log(`  Slideshow Open after reload: ${isModalOpenAfterReload}`);
    console.log(`  Asset ID after reload: "${assetIdAfterReload}"`);

    if (!isModalOpenAfterReload || !assetIdAfterReload.includes('15_servicenow')) {
      throw new Error(`Idempotent reload failed: state did not survive page.reload() (modal: ${isModalOpenAfterReload}, asset: ${assetIdAfterReload})`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_idempotent_reload_verified.png') });
    console.log('  Saved: 05_idempotent_reload_verified.png');

    console.log('\n======================================================================');
    console.log('  ALL UNIQUE LINKS, ASSET IDS & IDEMPOTENT RELOAD CHECKS PASSED!     ');
    console.log('======================================================================');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
});
