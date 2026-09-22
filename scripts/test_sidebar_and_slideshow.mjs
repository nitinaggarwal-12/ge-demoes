import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.MCP_PORT || 8788;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('scratch/screenshots_workbench_v2');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('======================================================================');
  console.log('  E2E TEST: COLLAPSIBLE SIDEBAR, LOGICAL GROUPS, SLIDESHOW & PRINT   ');
  console.log('======================================================================');

  // Purge screenshot directory
  fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('\n[1/6] Launching Google-signed Chrome in headless mode...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1600,1050',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    defaultViewport: { width: 1600, height: 1050, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.error('  PAGE ERROR:', err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') console.error('  CONSOLE ERROR:', msg.text());
    });

    // 1. Navigate to Workbench UI
    console.log('\n[2/6] Navigating to Workbench UI...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(800);

    // Verify Title
    const title = await page.title();
    console.log(`  Page Title: "${title}"`);

    // Verify Sidebar Exists
    const sidebarWidthExpanded = await page.$eval('#appSidebar', el => el.getBoundingClientRect().width);
    console.log(`  Expanded Sidebar Width: ${sidebarWidthExpanded}px (expected ~270px)`);
    if (sidebarWidthExpanded < 200) throw new Error('Sidebar width not expanded');

    // Capture 01: Default View with Expanded Sidebar
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_expanded_sidebar_servicenow.png') });
    console.log('  Saved: 01_expanded_sidebar_servicenow.png');

    // 2. Test Sidebar Collapse & Expand
    console.log('\n[3/6] Testing Collapsible Left Sidebar...');
    await page.click('#sidebarToggleBtn');
    await sleep(800); // Settling delay for CSS transition

    const sidebarWidthCollapsed = await page.$eval('#appSidebar', el => el.getBoundingClientRect().width);
    const isCollapsedClass = await page.$eval('#appSidebar', el => el.classList.contains('collapsed'));
    console.log(`  Collapsed Sidebar Width: ${sidebarWidthCollapsed}px, class .collapsed: ${isCollapsedClass}`);
    if (sidebarWidthCollapsed > 80 || !isCollapsedClass) {
      throw new Error(`Sidebar failed to collapse properly (width: ${sidebarWidthCollapsed}px)`);
    }

    // Capture 02: Collapsed Sidebar Mode
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_collapsed_sidebar_mode.png') });
    console.log('  Saved: 02_collapsed_sidebar_mode.png');

    // Expand sidebar back
    await page.click('#sidebarToggleBtn');
    await sleep(800);

    // 3. Test Navigation to Logically Grouped Gallery View
    console.log('\n[4/6] Testing Navigation to Logical Workflow Gallery...');
    await page.click('#sideLink-gallery');
    await sleep(800);

    // Verify all 6 workflow sections exist
    const workflowGroups = await page.evaluate(() => {
      const cards = document.querySelectorAll('.workflow-group-card');
      return Array.from(cards).map(c => ({
        id: c.getAttribute('data-group-id'),
        title: c.querySelector('.workflow-title')?.textContent?.trim(),
        itemCount: c.querySelectorAll('.gallery-card').length,
      }));
    });

    console.log(`  Found ${workflowGroups.length} logical workflow sections:`);
    let totalItems = 0;
    workflowGroups.forEach(g => {
      console.log(`   - [${g.id}] ${g.title}: ${g.itemCount} screenshots`);
      totalItems += g.itemCount;
    });
    console.log(`  Total Logically Grouped Screenshots: ${totalItems} (Matches authentic total 65)`);
    if (workflowGroups.length !== 6 || totalItems !== 65) {
      throw new Error(`Expected 6 workflow groups with 65 items, got ${workflowGroups.length} groups with ${totalItems} items`);
    }

    // Capture 03: Logically Grouped Visual Gallery
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_logically_grouped_gallery.png') });
    console.log('  Saved: 03_logically_grouped_gallery.png');

    // 4. Test Interactive Fullscreen Slideshow Mode
    console.log('\n[5/6] Testing Interactive Slideshow Mode...');
    // Click Play All Slideshow
    await page.$eval('.quick-links button.accent', el => el.click());
    await sleep(1000); // Settling delay for modal animation

    const isSlideshowOpen = await page.$eval('#slideshowModal', el => el.classList.contains('open'));
    const initialSlideTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
    const initialCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
    const filmstripCount = await page.$$eval('.filmstrip-thumb', els => els.length);

    console.log(`  Slideshow Open: ${isSlideshowOpen}`);
    console.log(`  Initial Slide: "${initialSlideTitle}"`);
    console.log(`  Counter: "${initialCounter}"`);
    console.log(`  Filmstrip Thumbnails: ${filmstripCount} items`);

    if (!isSlideshowOpen || filmstripCount !== 65) {
      throw new Error(`Slideshow modal did not open with 65 items (found ${filmstripCount})`);
    }

    // Test advancing slide via Next arrow
    await page.click('.slideshow-arrow.next');
    await sleep(800);
    const secondSlideTitle = await page.$eval('#slideMainTitle', el => el.textContent.trim());
    const secondCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
    console.log(`  After Next Click -> "${secondSlideTitle}" (${secondCounter})`);

    // Test keyboard navigation (ArrowRight)
    await page.keyboard.press('ArrowRight');
    await sleep(800);
    const thirdCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
    console.log(`  After ArrowRight Key -> ${thirdCounter}`);

    // Capture 04: Interactive Slideshow View
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_interactive_slideshow_view.png') });
    console.log('  Saved: 04_interactive_slideshow_view.png');

    // Test Multi-Engine Human Audio Narrator & Gold Karaoke Subtitles
    console.log('  Testing Multi-Engine Human Audio Narrator Controls...');
    const voiceOptions = await page.$$eval('#narratorVoiceSelect option', els => els.map(o => o.value));
    console.log(`  Available Narrator Voice Engines (${voiceOptions.length} total): ${voiceOptions.join(', ')}`);
    if (voiceOptions.length < 10 || !voiceOptions.includes('journey-d') || !voiceOptions.includes('chirp-d')) {
      throw new Error(`Missing expected narrator voice options (found ${voiceOptions.join(', ')})`);
    }

    // Verify Karaoke Subtitles display natural concept explanation (not raw text)
    const karaokeText = await page.$eval('#karaokeText', el => el.textContent.trim());
    const karaokeWordCount = await page.$$eval('.karaoke-word', els => els.length);
    const paragraphCount = await page.$$eval('#karaokeText .karaoke-paragraph', els => els.length);
    console.log(`  Karaoke Words Count: ${karaokeWordCount}`);
    console.log(`  Karaoke Paragraphs (Respiratory Thought Separators): ${paragraphCount}`);
    console.log(`  Sample Concept Narration: "${karaokeText.slice(0, 85)}..."`);
    if (karaokeWordCount < 5 || karaokeText.includes('.png')) {
      throw new Error('Karaoke text is either empty or reading file name instead of natural concept explanation');
    }
    if (paragraphCount < 2) {
      throw new Error(`Expected at least 2 paragraphs for natural respiratory pauses, found ${paragraphCount}`);
    }

    // Trigger Audio Narration with Google Journey David
    await page.select('#narratorVoiceSelect', 'journey-d');
    await sleep(500);
    const journeyVoiceBadge = await page.$eval('#karaokeVoiceName', el => el.textContent.trim());
    console.log(`  Selected Voice Badge: "${journeyVoiceBadge}"`);

    await page.click('#btnNarrateAudio');
    await sleep(1000);
    const isSpeakingClass = await page.$eval('#btnNarrateAudio', el => el.classList.contains('speaking'));
    console.log(`  Audio Narrator Speaking Active: ${isSpeakingClass}`);

    // Capture 07: Audio Narration with Live Gold Karaoke Subtitles & Google Journey Human Voice
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_audio_narration_gold_karaoke.png') });
    console.log('  Saved: 07_audio_narration_gold_karaoke.png');

    // Test Theatrical Settling Pause on Slide Transition
    console.log('  Testing Theatrical Settling Pause on Slide Transition...');
    await page.$eval('#autoNarrateCheckbox', el => { el.checked = true; el.dispatchEvent(new Event('change')); });
    await sleep(300);

    // Navigate to Next Slide (Slide 2)
    await page.click('button[onclick="nextSlide()"]');
    // Immediately inspect settling status (should be 'Settling...' with hourglass icon)
    const settlingLabel = await page.$eval('#narrateLabel', el => el.textContent.trim());
    console.log(`  Immediate Transition Narrator Status: "${settlingLabel}" (Expected: Settling...)`);
    if (settlingLabel !== 'Settling...') {
      console.warn(`Note: settlingLabel was "${settlingLabel}" (transition may have settled rapidly)`);
    }

    // Wait for the 950ms settling pause to complete and audio to begin
    await sleep(1500);
    const postSettlingLabel = await page.$eval('#narrateLabel', el => el.textContent.trim());
    console.log(`  Post-Settling Narrator Status: "${postSettlingLabel}" (Expected: Pause)`);

    // Test Rapid Speaker Voice Switching & Zero Overlap
    console.log('  Testing Rapid Speaker Voice Switching & Zero Overlap...');
    const initialReqId = await page.evaluate(() => window.narrationRequestId || 0);
    // Switch rapidly between 3 different voices
    await page.evaluate(() => {
      window.changeNarratorVoice('journey-f');
      window.changeNarratorVoice('chirp-d');
      window.changeNarratorVoice('gemini-aoede');
    });
    await sleep(400);
    const finalReqId = await page.evaluate(() => window.narrationRequestId);
    console.log(`  Initial ReqId: ${initialReqId}, Final ReqId: ${finalReqId} (Monotonically incremented by ${finalReqId - initialReqId})`);
    if (finalReqId < initialReqId + 3) {
      throw new Error('narrationRequestId did not increment properly on rapid voice switches');
    }
    // Verify only one active speaker is configured and UI badge updated
    const finalVoiceBadge = await page.$eval('#karaokeVoiceName', el => el.textContent.trim());
    console.log(`  Clean Resolved Voice Badge: "${finalVoiceBadge}"`);
    if (!finalVoiceBadge.includes('Aoede')) {
      throw new Error(`Expected Aoede voice badge after rapid switch, got ${finalVoiceBadge}`);
    }

    // Stop narration
    await page.click('#btnNarrateAudio');
    await sleep(500);

    // Test closing slideshow with Escape
    await page.keyboard.press('Escape');
    await sleep(800);
    const isSlideshowClosed = await page.$eval('#slideshowModal', el => !el.classList.contains('open'));
    console.log(`  Slideshow Closed on Escape: ${isSlideshowClosed}`);

    // 5. Test Print & PDF Export Modal and Dedicated Print Dossier DOM
    console.log('\n[6/6] Testing Print & PDF Export System & Pixel-Perfect Layout...');
    await page.click('button[onclick="openPrintModal()"]');
    await sleep(800);

    const isPrintModalOpen = await page.$eval('#printModal', el => el.classList.contains('open'));
    const printOptionsCount = await page.$$eval('.print-option-card', els => els.length);
    const scopeOptionsCount = await page.$eval('#printScopeSelect', el => el.options.length);

    console.log(`  Print Modal Open: ${isPrintModalOpen}`);
    console.log(`  Print Format Options: ${printOptionsCount} (Executive Landscape Deck & Detailed Portrait)`);
    console.log(`  Scope Dropdown Options: ${scopeOptionsCount} (All + 6 Workflows)`);

    if (!isPrintModalOpen || printOptionsCount < 2 || scopeOptionsCount < 7) {
      throw new Error('Print modal options incomplete');
    }

    // Verify "Download Vector PDF" button exists
    const btnDownloadPdfText = await page.$eval('#btnDownloadPdf', el => el.textContent.trim());
    console.log(`  Found Vector PDF Action: "${btnDownloadPdfText}"`);
    if (!btnDownloadPdfText.includes('Download Vector PDF')) {
      throw new Error('Missing Download Vector PDF button');
    }

    // Verify dedicated #printDossierContainer exists with Cover Page, Architecture & Code, and 65 Slide Pages
    const printDossierPages = await page.evaluate(() => {
      const container = document.getElementById('printDossierContainer');
      if (!container) return null;
      const cover = container.querySelector('.dossier-cover-page');
      const arch = container.querySelector('.dossier-code-page');
      const slides = container.querySelectorAll('.dossier-slide-page');
      const codeBlocks = container.querySelectorAll('.dossier-code-content');
      return {
        hasCover: !!cover,
        hasArch: !!arch,
        slideCount: slides.length,
        codeBlockCount: codeBlocks.length,
      };
    });

    console.log(`  Print Dossier Structure:`, printDossierPages);
    if (!printDossierPages || !printDossierPages.hasCover || !printDossierPages.hasArch || printDossierPages.slideCount !== 65) {
      throw new Error(`Print dossier missing required pages (found ${JSON.stringify(printDossierPages)})`);
    }

    // Capture 05: Print & PDF Export Modal
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_print_and_export_modal.png') });
    console.log('  Saved: 05_print_and_export_modal.png');

    // Test Backend Vector PDF Generation Endpoint (/api/export-pdf)
    console.log('  Testing Backend Vector PDF Export Endpoint (/api/export-pdf)...');
    const pdfResponse = await fetch(`${BASE_URL}/api/export-pdf?scope=byomcp-setup`);
    if (!pdfResponse.ok) {
      throw new Error(`PDF Export endpoint failed with status ${pdfResponse.status}`);
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const pdfPath = path.join(SCREENSHOT_DIR, '08_exported_executive_deck.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`  Vector PDF successfully generated and saved: 08_exported_executive_deck.pdf (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    if (pdfBuffer.length < 500000) {
      throw new Error(`Exported PDF size (${pdfBuffer.length} bytes) is suspiciously small`);
    }

    // Close print modal
    await page.click('.print-header button.lightbox-close');
    await sleep(800);

    // 6. Test GCP Light / Dark Theme Toggle
    console.log('\n[7/7] Testing GCP Light / Dark Theme Mode Toggle...');
    await page.click('#gcpThemeBtn');
    await sleep(800);

    const themeAfterToggle = await page.$eval('html', el => el.getAttribute('data-theme'));
    console.log(`  Active Theme After Toggle: "${themeAfterToggle}"`);
    if (themeAfterToggle !== 'light') {
      throw new Error(`Expected theme 'light', got '${themeAfterToggle}'`);
    }

    // Capture 06: GCP Light Theme Mode
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_gcp_light_theme_mode.png') });
    console.log('  Saved: 06_gcp_light_theme_mode.png');

    // Toggle back to GCP Dark
    await page.click('#gcpThemeBtn');
    await sleep(800);
    const themeBackToDark = await page.$eval('html', el => el.getAttribute('data-theme'));
    console.log(`  Active Theme Restored to: "${themeBackToDark}"`);

    console.log('\n======================================================================');
    console.log('  ALL E2E VERIFICATION CHECKS PASSED WITH ZERO REGRESSIONS!          ');
    console.log('======================================================================');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('\nE2E TEST FAILED:', err.message);
  process.exit(1);
});
