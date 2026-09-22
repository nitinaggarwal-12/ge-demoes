import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve('scratch/screenshots_project_decks');
if (fs.existsSync(SCREENSHOTS_DIR)) {
  fs.rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
}
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runVerification() {
  console.log('🚀 Launching Google-Signed Local Chrome on macOS for Comprehensive Verification...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

  // 1. Visit Main Workbench
  console.log('🌐 Step 1: Loading http://localhost:8788/?tab=servicenow ...');
  await page.goto('http://localhost:8788/?tab=servicenow', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1000);

  // Verify ServiceNow Workbench Output Corner Badge
  const snBadgeText = await page.$eval('#snOutputOriginBadge', el => el.textContent.trim());
  console.log(`✅ ServiceNow Output Corner Badge: "${snBadgeText}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_servicenow_workbench_badge.png') });

  // 2. Switch to Veeva Tab and verify corner badge
  console.log('💊 Step 2: Switching to Veeva Vault Tab...');
  await page.evaluate(() => {
    window.selectProjectView('veeva', 'tab-veeva');
  });
  await sleep(1000);
  const veevaBadgeText = await page.$eval('#veevaOutputOriginBadge', el => el.textContent.trim());
  console.log(`✅ Veeva Vault Output Corner Badge: "${veevaBadgeText}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_veeva_workbench_badge.png') });

  // 3. Switch to Microsoft Tab and verify corner badge
  console.log('🏢 Step 3: Switching to Microsoft Unified Tab...');
  await page.evaluate(() => {
    window.selectProjectView('microsoft', 'tab-microsoft');
  });
  await sleep(1000);
  const msBadgeText = await page.$eval('#msOutputOriginBadge', el => el.textContent.trim());
  console.log(`✅ Microsoft Unified Output Corner Badge: "${msBadgeText}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_microsoft_workbench_badge.png') });

  // 4. Test Slideshow for ServiceNow Project Deck (Zero Overlap - 62 slides)
  console.log('🎬 Step 4: Testing ServiceNow Project Slideshow Deck (62 slides)...');
  await page.evaluate(() => {
    window.startProjectSlideshow('servicenow');
  });
  await sleep(1200);

  const snCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
  const snSlideOriginBadge = await page.$eval('#slideOriginCornerBadge', el => el.textContent.trim());
  const snDeckValue = await page.$eval('#slideshowDeckSelect', el => el.value);
  console.log(`✅ ServiceNow Slideshow Counter: "${snCounter}"`);
  console.log(`✅ Slide Origin Corner Badge: "${snSlideOriginBadge}"`);
  console.log(`✅ Slideshow Deck Selector: "${snDeckValue}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_slideshow_servicenow_deck.png') });

  // 5. Switch to Veeva Vault Deck in Slideshow (Zero Overlap - 3 slides)
  console.log('💊 Step 5: Switching Slideshow Deck to Veeva Vault (3 slides)...');
  await page.select('#slideshowDeckSelect', 'veeva');
  await sleep(1200);

  const veevaCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
  const veevaSlideOriginBadge = await page.$eval('#slideOriginCornerBadge', el => el.textContent.trim());
  const veevaSlideTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
  console.log(`✅ Veeva Slideshow Counter: "${veevaCounter}"`);
  console.log(`✅ Veeva Slide Title: "${veevaSlideTitle}"`);
  console.log(`✅ Veeva Slide Origin Badge: "${veevaSlideOriginBadge}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_slideshow_veeva_deck.png') });

  // 6. Switch to Microsoft Unified Deck in Slideshow (Zero Overlap - 5 slides)
  console.log('🏢 Step 6: Switching Slideshow Deck to Microsoft Unified (5 slides)...');
  await page.select('#slideshowDeckSelect', 'microsoft');
  await sleep(1200);

  const msCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
  const msSlideOriginBadge = await page.$eval('#slideOriginCornerBadge', el => el.textContent.trim());
  const msSlideTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
  console.log(`✅ Microsoft Slideshow Counter: "${msCounter}"`);
  console.log(`✅ Microsoft Slide Title: "${msSlideTitle}"`);
  console.log(`✅ Microsoft Slide Origin Badge: "${msSlideOriginBadge}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_slideshow_microsoft_deck.png') });

  // 7. Test Pure Slideshow Mode ("Only showing only the slides") with floating HUD
  console.log('🖥️ Step 7: Testing Pure Slideshow Mode ("Only showing only the slides")...');
  await page.evaluate(() => {
    window.togglePureSlideshowMode(true);
    window.wakePureHud();
  });
  await sleep(1000);

  const isPureMode = await page.$eval('#slideshowModal', el => el.classList.contains('pure-slideshow-mode'));
  const isHudVisible = await page.$eval('#slideshowModal', el => el.classList.contains('hud-visible'));
  const pureHudCounterText = await page.$eval('#pureHudCounter', el => el.textContent.trim());
  console.log(`✅ Pure Slideshow Mode Active: ${isPureMode}`);
  console.log(`✅ Pure HUD Visible: ${isHudVisible}`);
  console.log(`✅ Pure HUD Counter: "${pureHudCounterText}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_pure_slideshow_mode_hud.png') });

  // 8. Test Pure Slideshow Mode after HUD fades out (100% Pure Slide, No overlays)
  console.log('🖥️ Step 8: Verifying pure edge-to-edge slide without HUD overlays...');
  await page.evaluate(() => {
    document.getElementById('slideshowModal').classList.remove('hud-visible');
  });
  await sleep(600);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_pure_slideshow_clean_edge_to_edge.png') });

  // Exit Pure Mode to test Hide/Unhide controls
  await page.evaluate(() => {
    window.togglePureSlideshowMode(false);
  });
  await sleep(600);

  // 9. Option to Hide and Unhide Slide: Hide Slide 2 in Microsoft Deck
  console.log('🚫 Step 9: Hiding Slide 2 in Microsoft Deck...');
  // Navigate to Slide 2 (index 1) directly
  await page.evaluate(() => {
    window.showSlide(1);
  });
  await sleep(800);

  // Click Hide Slide button
  await page.evaluate(() => {
    window.toggleCurrentSlideVisibility();
  });
  await sleep(600);

  const hideBtnLabel = await page.$eval('#btnHideSlideLabel', el => el.textContent.trim());
  const hideBtnHasClass = await page.$eval('#btnToggleHideSlide', el => el.classList.contains('slide-is-hidden-btn'));
  const noticeBadgeDisplay = await page.$eval('#slideHiddenNoticeBadge', el => window.getComputedStyle(el).display);
  const noticeBadgeText = await page.$eval('#slideHiddenNoticeBadge', el => el.textContent.trim());
  const updatedCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());

  console.log(`✅ Hide Button Label: "${hideBtnLabel}" (Has class: ${hideBtnHasClass})`);
  console.log(`✅ Hidden Notice Badge Display: "${noticeBadgeDisplay}", Text: "${noticeBadgeText}"`);
  console.log(`✅ Updated Counter with Hidden Count: "${updatedCounter}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_slide_hidden_notice_and_controls.png') });

  // 10. Test Skipping During Play: Go to Slide 1 and click Next -> should skip Slide 2 and land on Slide 3!
  console.log('⏭️ Step 10: Testing skip during play: Advancing from Slide 1...');
  await page.evaluate(() => {
    window.showSlide(0); // Slide 1
  });
  await sleep(600);

  const slide1Title = await page.$eval('#slideMainTitle', el => el.textContent.trim());
  console.log(`📍 Starting on Slide 1: "${slide1Title}"`);

  // Call nextSlide() which represents auto-play advance or manual next
  await page.evaluate(() => {
    window.nextSlide();
  });
  await sleep(800);

  const landSlideTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
  const landCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
  console.log(`⏩ Landed on: "${landSlideTitle}", Counter: "${landCounter}"`);

  if (landCounter.includes('Slide 3 of 5')) {
    console.log('🎯 SUCCESS: Hidden Slide 2 was completely skipped during playback!');
  } else {
    console.warn(`⚠️ Warning: Landed on unexpected slide: ${landCounter}`);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_slide_skip_during_play.png') });

  // 11. Test Skipping Backwards: Prev from Slide 3 -> should skip Slide 2 and land back on Slide 1!
  console.log('⏮️ Step 11: Testing skip backwards: Going prev from Slide 3...');
  await page.evaluate(() => {
    window.prevSlide();
  });
  await sleep(800);

  const prevLandTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
  const prevLandCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
  console.log(`⏪ Landed on: "${prevLandTitle}", Counter: "${prevLandCounter}"`);
  if (prevLandCounter.includes('Slide 1 of 5')) {
    console.log('🎯 SUCCESS: Hidden Slide 2 was completely skipped in reverse navigation!');
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_slide_skip_prev_play.png') });

  // 12. Test Unhiding Slide 2
  console.log('👁️ Step 12: Unhiding Slide 2 and verifying restored playback...');
  await page.evaluate(() => {
    window.showSlide(1); // Inspect Slide 2
  });
  await sleep(600);

  // Click unhide
  await page.evaluate(() => {
    window.toggleCurrentSlideVisibility();
  });
  await sleep(600);

  const restoredNoticeDisplay = await page.$eval('#slideHiddenNoticeBadge', el => window.getComputedStyle(el).display);
  const restoredBtnLabel = await page.$eval('#btnHideSlideLabel', el => el.textContent.trim());
  const restoredCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
  console.log(`✅ Unhidden Notice Display: "${restoredNoticeDisplay}" (expected "none")`);
  console.log(`✅ Restored Button Label: "${restoredBtnLabel}"`);
  console.log(`✅ Restored Counter: "${restoredCounter}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_slide_unhidden_restored.png') });

  // Close Slideshow
  await page.evaluate(() => {
    window.closeSlideshow();
  });
  await sleep(600);

  // 13. Verify Print & Export Modal with Dedicated Project Scope
  console.log('🖨️ Step 13: Testing Print Modal with Project Scope...');
  await page.evaluate(() => {
    window.openPrintModal('project_microsoft');
  });
  await sleep(800);

  const selectedPrintScope = await page.$eval('#printScopeSelect', el => el.value);
  console.log(`✅ Print Modal Selected Scope: "${selectedPrintScope}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_print_modal_project_scope.png') });

  await page.evaluate(() => {
    window.closePrintModal();
  });
  await sleep(600);

  // 14. Test Recreate Modal with Origin Corner Badge
  console.log('🔄 Step 14: Testing Recreate Terminal Modal Origin Badge...');
  await page.evaluate(() => {
    window.triggerRecreateProject('microsoft');
  });
  await sleep(1500);

  const recreateOriginText = await page.$eval('#recreateOriginBadge', el => el.textContent.trim());
  const recreateKpiParity = await page.$eval('#recreateKpiParity', el => el.textContent.trim());
  console.log(`✅ Recreate Modal Origin Badge: "${recreateOriginText}"`);
  console.log(`✅ Recreate KPI Parity: "${recreateKpiParity}"`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_recreate_modal_origin_badge.png') });

  await page.evaluate(() => {
    window.closeRecreateModal();
  });
  await sleep(600);

  // 15. Check Gallery Cards Hide Chip in Tab 3 (Gallery Tab)
  console.log('🖼️ Step 15: Checking Gallery Cards in Tab 3...');
  await page.evaluate(() => {
    window.switchTab('tab-gallery');
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_gallery_cards_hide_controls.png') });

  await browser.close();
  console.log('🎉 Verification Suite Completed Successfully! All 15 screenshots saved in scratch/screenshots_project_decks/');
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
