import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.MCP_PORT || 8788;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('scratch/screenshots_collapsible_nav');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('======================================================================');
  console.log('  E2E TEST: HIERARCHICAL COLLAPSIBLE SIDEBAR & ALL ASSETS FILTERING   ');
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

  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.error('  PAGE ERROR:', err.message));

    // 1. Initial Load: ServiceNow Tab
    console.log('\n[1/6] Loading Home (ServiceNow Tab) with Default Expanded Tree...');
    await page.goto(`${BASE_URL}/?tab=servicenow`, { waitUntil: 'networkidle2' });
    await sleep(800);

    const isSnExpanded = await page.$eval('#projNode-servicenow', el => !el.classList.contains('collapsed'));
    console.log(`  ServiceNow Node Expanded: ${isSnExpanded}`);
    if (!isSnExpanded) throw new Error('Expected ServiceNow project node to be expanded by default');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_tree_default_expanded.png') });
    console.log('  Saved: 01_tree_default_expanded.png');

    // 2. Collapse ServiceNow Node via Header Click
    console.log('\n[2/6] Toggling ServiceNow Project Node Collapse...');
    await page.$eval('#projNode-servicenow .project-node-header', el => el.click());
    await sleep(500);

    const isSnCollapsed = await page.$eval('#projNode-servicenow', el => el.classList.contains('collapsed'));
    console.log(`  ServiceNow Node Collapsed: ${isSnCollapsed}`);
    if (!isSnCollapsed) throw new Error('Expected ServiceNow project node to be collapsed after clicking header');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_servicenow_node_collapsed.png') });
    console.log('  Saved: 02_servicenow_node_collapsed.png');

    // Re-expand ServiceNow
    await page.$eval('#projNode-servicenow .project-node-header', el => el.click());
    await sleep(500);

    // 3. Toggle All Assets Submenu Collapse
    console.log('\n[3/6] Toggling ServiceNow "All Assets" Nested Submenu...');
    await page.$eval('#chev-assets-servicenow', el => el.click());
    await sleep(500);

    const isAssetMenuCollapsed = await page.$eval('#assetMenu-servicenow', el => el.classList.contains('collapsed'));
    console.log(`  ServiceNow Asset Submenu Collapsed: ${isAssetMenuCollapsed}`);
    if (!isAssetMenuCollapsed) throw new Error('Expected ServiceNow asset submenu to be collapsed after chevron click');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_asset_submenu_collapsed.png') });
    console.log('  Saved: 03_asset_submenu_collapsed.png');

    // Re-expand Asset Submenu
    await page.$eval('#chev-assets-servicenow', el => el.click());
    await sleep(500);

    // 4. Click "All Assets" under Veeva -> Navigates to Gallery & Filters Veeva
    console.log('\n[4/6] Clicking "All Assets" under Veeva Project...');
    await page.$eval('#sideLink-veeva-assets .sub-nav-label', el => el.click());
    await sleep(800);

    const isGalleryActive = await page.$eval('#tab-gallery', el => el.classList.contains('active'));
    const isVeevaAssetsActive = await page.$eval('#sideLink-veeva-assets', el => el.classList.contains('active'));
    const isGtCardVisible = await page.$eval('#workflow-ground-truth', el => el.style.display !== 'none');
    console.log(`  Gallery Tab Active: ${isGalleryActive}, Veeva Assets Active: ${isVeevaAssetsActive}, GT Card Visible: ${isGtCardVisible}`);
    if (!isGalleryActive || !isVeevaAssetsActive || !isGtCardVisible) {
      throw new Error('Veeva All Assets link failed to filter gallery appropriately');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_veeva_all_assets_gallery.png') });
    console.log('  Saved: 04_veeva_all_assets_gallery.png');

    // 5. Click "Live Workbench" under Microsoft -> Navigates to Microsoft Tab & Expands Node
    console.log('\n[5/6] Clicking "Live Workbench" under Microsoft Unified...');
    await page.$eval('#sideLink-microsoft', el => el.click());
    await sleep(800);

    const isMsTabActive = await page.$eval('#tab-microsoft', el => el.classList.contains('active'));
    const isMsNodeExpanded = await page.$eval('#projNode-microsoft', el => !el.classList.contains('collapsed'));
    const isMsLiveActive = await page.$eval('#sideLink-microsoft', el => el.classList.contains('active'));
    console.log(`  Microsoft Tab Active: ${isMsTabActive}, Node Expanded: ${isMsNodeExpanded}, Link Active: ${isMsLiveActive}`);
    if (!isMsTabActive || !isMsNodeExpanded || !isMsLiveActive) {
      throw new Error('Microsoft Live Workbench click failed to activate tab or expand node');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_microsoft_workbench_navigated.png') });
    console.log('  Saved: 05_microsoft_workbench_navigated.png');

    // 6. Click "All Assets" under Microsoft -> Navigates to Gallery
    console.log('\n[6/6] Clicking "All Assets" under Microsoft Unified...');
    await page.$eval('#sideLink-microsoft-assets .sub-nav-label', el => el.click());
    await sleep(800);

    const isMsAssetsActive = await page.$eval('#sideLink-microsoft-assets', el => el.classList.contains('active'));
    console.log(`  Microsoft Assets Active: ${isMsAssetsActive}`);
    if (!isMsAssetsActive) {
      throw new Error('Microsoft All Assets link failed to set active state');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_microsoft_all_assets_gallery.png') });
    console.log('  Saved: 06_microsoft_all_assets_gallery.png');

    console.log('\n======================================================================');
    console.log('  ALL COLLAPSIBLE HIERARCHY & NAVIGATION CHECKS PASSED SUCCESSFULLY!  ');
    console.log('======================================================================');

  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
});
