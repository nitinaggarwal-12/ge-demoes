import puppeteer from 'puppeteer-core';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('--- Starting Collapsible Captions & Configurable Pause E2E Test ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  // 1. Open slideshow at slide 1
  console.log('1. Loading slide 1 in presentation mode...');
  await page.goto('http://localhost:8788/?slide=1', { waitUntil: 'networkidle0' });
  await sleep(1000);

  // Verify modal is open
  const modalOpen = await page.$eval('#slideshowModal', el => el.classList.contains('open'));
  console.log('Slideshow modal open:', modalOpen);

  // 2. Verify captions are collapsed by default
  const isBarCollapsedDefault = await page.$eval('#slideshowKaraokeBar', el => el.classList.contains('collapsed'));
  const toggleLabelDefault = await page.$eval('#captionToggleLabel', el => el.textContent.trim());
  const toggleIconDefault = await page.$eval('#captionToggleIcon', el => el.textContent.trim());
  const textHeightDefault = await page.$eval('#karaokeText', el => el.clientHeight);

  console.log('Default bar collapsed:', isBarCollapsedDefault, '(Expected: true)');
  console.log('Toggle button text:', toggleLabelDefault, '(Expected: Expand)');
  console.log('Toggle button icon:', toggleIconDefault, '(Expected: ▲)');
  console.log('Karaoke text height when collapsed:', textHeightDefault, 'px (Expected: 0)');

  if (!isBarCollapsedDefault || toggleLabelDefault !== 'Expand' || textHeightDefault !== 0) {
    throw new Error('Captions are NOT collapsed by default!');
  }

  await page.screenshot({ path: 'scratch/screenshots_caption_pause/01_captions_collapsed_default.png' });
  console.log('Captured 01_captions_collapsed_default.png');

  // 3. Test Expanding Captions
  console.log('2. Clicking Expand button to reveal full captions...');
  await page.click('#btnCaptionCollapseToggle');
  await sleep(600);

  const isBarCollapsedAfterExpand = await page.$eval('#slideshowKaraokeBar', el => el.classList.contains('collapsed'));
  const toggleLabelAfterExpand = await page.$eval('#captionToggleLabel', el => el.textContent.trim());
  const toggleIconAfterExpand = await page.$eval('#captionToggleIcon', el => el.textContent.trim());
  const textHeightAfterExpand = await page.$eval('#karaokeText', el => el.clientHeight);

  console.log('Bar collapsed after click:', isBarCollapsedAfterExpand, '(Expected: false)');
  console.log('Toggle button text:', toggleLabelAfterExpand, '(Expected: Collapse)');
  console.log('Toggle button icon:', toggleIconAfterExpand, '(Expected: ▼)');
  console.log('Karaoke text height when expanded:', textHeightAfterExpand, 'px (Expected: > 0)');

  if (isBarCollapsedAfterExpand || toggleLabelAfterExpand !== 'Collapse' || textHeightAfterExpand <= 0) {
    throw new Error('Captions failed to expand properly!');
  }

  await page.screenshot({ path: 'scratch/screenshots_caption_pause/02_captions_expanded.png' });
  console.log('Captured 02_captions_expanded.png');

  // 4. Test Collapsing Captions back down
  console.log('3. Collapsing captions back down...');
  await page.click('#btnCaptionCollapseToggle');
  await sleep(600);
  const isCollapsedAgain = await page.$eval('#slideshowKaraokeBar', el => el.classList.contains('collapsed'));
  console.log('Bar collapsed again:', isCollapsedAgain, '(Expected: true)');

  // 5. Test Keyboard Shortcut 'C' to expand/collapse
  console.log('4. Testing keyboard shortcut C...');
  await page.keyboard.press('KeyC');
  await sleep(600);
  const expandedViaKey = !(await page.$eval('#slideshowKaraokeBar', el => el.classList.contains('collapsed')));
  console.log('Expanded via key C:', expandedViaKey, '(Expected: true)');

  await page.keyboard.press('KeyC');
  await sleep(600);
  const collapsedViaKey = await page.$eval('#slideshowKaraokeBar', el => el.classList.contains('collapsed'));
  console.log('Collapsed via key C:', collapsedViaKey, '(Expected: true)');

  // 6. Test Pause Duration Configuration in Topbar & Bottombar
  console.log('5. Testing Pause Duration Configuration across slides...');
  const defaultPauseVal = await page.$eval('#slidePauseDurationSelect', el => el.value);
  console.log('Default pause selector value:', defaultPauseVal, '(Expected: 1800)');

  // Select 3000ms (3.0s Relaxed)
  await page.select('#slidePauseDurationSelect', '3000');
  await sleep(500);

  const bottomPauseVal = await page.$eval('#slidePauseDurationSelectBottom', el => el.value);
  const outroDurationJs = await page.evaluate(() => window.outroPauseDuration);
  const localStorageVal = await page.evaluate(() => localStorage.getItem('ge_slideshow_pause_duration'));

  console.log('Bottom pause selector synced:', bottomPauseVal, '(Expected: 3000)');
  console.log('JS variable outroPauseDuration:', outroDurationJs, '(Expected: 3000)');
  console.log('localStorage value:', localStorageVal, '(Expected: 3000)');

  if (bottomPauseVal !== '3000' || outroDurationJs !== 3000 || localStorageVal !== '3000') {
    throw new Error('Pause duration did not synchronize across controls and storage!');
  }

  await page.screenshot({ path: 'scratch/screenshots_caption_pause/03_pause_duration_configured.png' });
  console.log('Captured 03_pause_duration_configured.png');

  // 7. Test Navigating to Next Slide preserves collapsed captions across all slides
  console.log('6. Navigating to Next Slide to verify captions remain collapsed across slides...');
  await page.click('.slideshow-arrow.next');
  await sleep(800);

  const slide2Collapsed = await page.$eval('#slideshowKaraokeBar', el => el.classList.contains('collapsed'));
  const slide2Title = await page.$eval('#slideMainTitle', el => el.textContent.trim());
  const slide2Counter = await page.$eval('#slideCounterText', el => el.textContent.trim());

  console.log('Slide 2 Title:', slide2Title);
  console.log('Slide 2 Counter:', slide2Counter);
  console.log('Slide 2 captions collapsed:', slide2Collapsed, '(Expected: true)');

  if (!slide2Collapsed) {
    throw new Error('Slide 2 captions did NOT remain collapsed by default!');
  }

  await page.screenshot({ path: 'scratch/screenshots_caption_pause/04_next_slide_captions_collapsed.png' });
  console.log('Captured 04_next_slide_captions_collapsed.png');

  // 8. Test URL hydration with pause param: ?slide=5&pause=5000
  console.log('7. Testing deep link with pause parameter: ?slide=5&pause=5000...');
  await page.goto('http://localhost:8788/?slide=5&pause=5000', { waitUntil: 'networkidle0' });
  await sleep(800);

  const hydratedPause = await page.evaluate(() => window.outroPauseDuration);
  const hydratedTopSelect = await page.$eval('#slidePauseDurationSelect', el => el.value);
  const hydratedBottomSelect = await page.$eval('#slidePauseDurationSelectBottom', el => el.value);
  const hydratedSlideCollapsed = await page.$eval('#slideshowKaraokeBar', el => el.classList.contains('collapsed'));

  console.log('Hydrated pause duration:', hydratedPause, '(Expected: 5000)');
  console.log('Hydrated top select:', hydratedTopSelect, '(Expected: 5000)');
  console.log('Hydrated bottom select:', hydratedBottomSelect, '(Expected: 5000)');
  console.log('Hydrated slide 5 captions collapsed:', hydratedSlideCollapsed, '(Expected: true)');

  if (hydratedPause !== 5000 || hydratedTopSelect !== '5000' || !hydratedSlideCollapsed) {
    throw new Error('URL pause parameter hydration failed!');
  }

  // 9. Console Error check
  if (errors.length > 0) {
    console.error('Console errors encountered:', errors);
    throw new Error(`Encountered ${errors.length} browser errors during test`);
  } else {
    console.log('SUCCESS: Zero console errors during entire E2E session.');
  }

  await browser.close();
  console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
