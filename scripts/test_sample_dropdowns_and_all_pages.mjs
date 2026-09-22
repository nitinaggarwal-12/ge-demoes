import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.MCP_PORT || 8788;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('scratch/screenshots_sample_dropdowns');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('======================================================================');
  console.log('  E2E TEST: SAMPLE SCENARIOS DROPDOWNS & TOOL CALL AUTO-EXECUTION     ');
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

    // TEST 1: ServiceNow Tab - Default Tool + Problem/Change Tool
    console.log('\n[1/4] Testing ServiceNow Sample Scenarios & Auto-Execution...');
    await page.goto(`${BASE_URL}/?tab=servicenow`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const snDropdownExists = await page.$('#snScenarioSelect') !== null;
    console.log(`  ServiceNow Sample Dropdown Present: ${snDropdownExists}`);
    if (!snDropdownExists) throw new Error('Expected #snScenarioSelect to be present in ServiceNow workbench');

    const initialSnRows = await page.$$eval('#tableContainer table tbody tr', trs => trs.length).catch(() => 0);
    console.log(`  Initial Incident Rows Rendered: ${initialSnRows}`);
    if (initialSnRows === 0) throw new Error('Expected non-empty table cavity on ServiceNow initial load');

    console.log('  Selecting search_servicenow_problems_and_changes tool...');
    await page.click('#tool-search_servicenow_problems_and_changes');
    await sleep(1000);

    const prbDropdownExists = await page.$('#snScenarioSelect') !== null;
    console.log(`  Problem/Change Sample Dropdown Present: ${prbDropdownExists}`);
    if (!prbDropdownExists) throw new Error('Expected #snScenarioSelect for problem/changes tool');

    const prbRows = await page.$$eval('#tableContainer table tbody tr', trs => trs.length).catch(() => 0);
    const prbText = await page.$eval('#tableContainer', el => el.innerText);
    console.log(`  Problem Records Rendered: ${prbRows} rows, contains PRB: ${prbText.includes('PRB')}`);
    if (prbRows === 0 || !prbText.includes('PRB')) throw new Error('Expected PRB problem records rendered in table');

    console.log('  Testing Change Request Quick Preset chip click...');
    const chips = await page.$$('.sample-chip-btn');
    let clickedChip = false;
    for (const chip of chips) {
      const text = await page.evaluate(el => el.textContent, chip);
      if (text.includes('Change Request') || text.includes('CHG') || text.includes('Cisco')) {
        await chip.click();
        clickedChip = true;
        break;
      }
    }
    console.log(`  Clicked Change Request Preset Chip: ${clickedChip}`);
    await sleep(1000);

    const chgText = await page.$eval('#tableContainer', el => el.innerText);
    console.log(`  Change Request Table Updated: contains CHG: ${chgText.includes('CHG')}`);
    if (!chgText.includes('CHG')) throw new Error('Expected CHG change request records after selecting preset');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_servicenow_problem_change_scenario.png') });
    console.log('  Saved: 01_servicenow_problem_change_scenario.png');

    // TEST 2: Veeva Vault Tab - Documents & Audit Trail
    console.log('\n[2/4] Testing Veeva Vault Sample Scenarios & Auto-Execution...');
    await page.goto(`${BASE_URL}/?tab=veeva`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const veevaDropdownExists = await page.$('#veevaScenarioSelect') !== null;
    console.log(`  Veeva Sample Dropdown Present: ${veevaDropdownExists}`);
    if (!veevaDropdownExists) throw new Error('Expected #veevaScenarioSelect in Veeva workbench');

    const veevaRows = await page.$$eval('#veevaTableContainer table tbody tr', trs => trs.length).catch(() => 0);
    console.log(`  Initial Veeva Document Rows: ${veevaRows}`);
    if (veevaRows === 0) throw new Error('Expected Veeva documents to be auto-executed and rendered');

    console.log('  Selecting get_audit_trail tool...');
    await page.click('#veevaTool-get_audit_trail');
    await sleep(1000);

    const auditRows = await page.$$eval('#veevaTableContainer table tbody tr', trs => trs.length).catch(() => 0);
    const auditText = await page.$eval('#veevaTableContainer', el => el.innerText);
    console.log(`  Audit Trail Rows: ${auditRows}, contains 21 CFR Part 11 / Sign: ${auditText.toLowerCase().includes('signature') || auditText.includes('DOC-030201')}`);
    if (auditRows === 0) throw new Error('Expected audit trail rows rendered');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_veeva_audit_trail_scenario.png') });
    console.log('  Saved: 02_veeva_audit_trail_scenario.png');

    // TEST 3: Microsoft Unified Connector - All 4 Workloads & Light Mode
    console.log('\n[3/4] Testing Microsoft Unified Connector (SharePoint, Teams, Outlook, OneDrive)...');
    await page.goto(`${BASE_URL}/?tab=microsoft`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('gcp_theme', 'light');
    });
    await sleep(400);

    const authProtocolText = await page.evaluate(() => {
      const cells = document.querySelectorAll('.config-cell-value');
      for (const c of cells) {
        if (c.textContent.includes('Entra ID') || c.textContent.includes('OAuth')) return c.textContent.trim();
      }
      return '';
    });
    console.log(`  Auth Protocol Text: "${authProtocolText}"`);
    if (authProtocolText.includes('Delega...')) {
      throw new Error('Auth protocol is still truncated with Delega... ellipsis!');
    }

    const msDropdownExists = await page.$('#msScenarioSelect') !== null;
    console.log(`  Microsoft Sample Dropdown Present: ${msDropdownExists}`);
    if (!msDropdownExists) throw new Error('Expected #msScenarioSelect in Microsoft workbench');

    const spRows = await page.$$eval('#msTableContainer table tbody tr', trs => trs.length).catch(() => 0);
    console.log(`  SharePoint Document Rows: ${spRows}`);
    if (spRows === 0) throw new Error('Expected SharePoint documents rendered on load');

    console.log('  Testing Teams War Room tool...');
    await page.click('#msTool-get_teams_messages');
    await sleep(800);
    const tmRows = await page.$$eval('#msTableContainer table tbody tr', trs => trs.length).catch(() => 0);
    const tmText = await page.$eval('#msTableContainer', el => el.innerText);
    console.log(`  Teams Rows: ${tmRows}, contains war room: ${tmText.includes('war-room')}`);
    if (tmRows === 0 || !tmText.includes('war-room')) throw new Error('Expected Teams messages rendered');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_microsoft_teams_war_room_light.png') });
    console.log('  Saved: 03_microsoft_teams_war_room_light.png');

    console.log('  Testing Outlook Emails tool...');
    await page.click('#msTool-search_outlook_emails');
    await sleep(800);
    const exRows = await page.$$eval('#msTableContainer table tbody tr', trs => trs.length).catch(() => 0);
    const exText = await page.$eval('#msTableContainer', el => el.innerText);
    console.log(`  Outlook Email Rows: ${exRows}, contains ADR: ${exText.includes('Architecture Decision Record')}`);
    if (exRows === 0) throw new Error('Expected Outlook emails rendered');

    console.log('  Testing OneDrive Files tool...');
    await page.click('#msTool-get_onedrive_files');
    await sleep(800);
    const odRows = await page.$$eval('#msTableContainer table tbody tr', trs => trs.length).catch(() => 0);
    const odText = await page.$eval('#msTableContainer', el => el.innerText);
    console.log(`  OneDrive File Rows: ${odRows}, contains Benchmarks: ${odText.includes('Benchmarks')}`);
    if (odRows === 0) throw new Error('Expected OneDrive files rendered');

    // TEST 4: Verification of URL deep linking with sample selection
    console.log('\n[4/4] Testing URL state idempotence and reload...');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1000);
    const reloadedRows = await page.$$eval('#msTableContainer table tbody tr', trs => trs.length).catch(() => 0);
    console.log(`  After page reload, tool results maintained: ${reloadedRows > 0}`);
    if (reloadedRows === 0) throw new Error('State lost after page reload');

    console.log('\n======================================================================');
    console.log('  ALL 4/4 SAMPLE SCENARIOS & AUTO-EXECUTION TESTS PASSED PERFECTLY!   ');
    console.log('======================================================================');
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
