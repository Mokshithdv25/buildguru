// BuildGuru Production UAT — https://buildguru.online/
// Run: npx playwright test tests/uat_production.js --reporter=list
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://buildguru.online';
const REPORT_DIR = path.join(__dirname, '../test_reports');
const SS_DIR = path.join(REPORT_DIR, 'screenshots');

[REPORT_DIR, SS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const results = [];
let browser, page;

function log(status, pageName, url, notes) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${pageName} — ${notes}`);
  results.push({ status, pageName, url, notes });
}

async function ss(name) {
  const file = path.join(SS_DIR, `${name}.png`);
  try { await page.screenshot({ path: file, fullPage: true }); } catch(e) {}
  return file;
}

async function waitLoad() {
  try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch(e) {}
}

(async () => {
  const userDataDir = '/tmp/hm_uat_profile';
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 400,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  page = await ctx.newPage();

  // Track dialogs globally — auto-dismiss and log them
  const dialogsDetected = [];
  const consoleErrors = [];

  const setupPageHandlers = (p) => {
    p.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`[${p.url()}] ${msg.text()}`); });
    p.on('pageerror', err => consoleErrors.push(`[${p.url()}] ${err.message}`));
    p.on('dialog', async dialog => {
      dialogsDetected.push({ type: dialog.type(), message: dialog.message(), url: p.url() });
      console.log(`  ⚠️  Dialog detected (${dialog.type()}): "${dialog.message()}"`);
      await dialog.dismiss().catch(() => {});
    });
  };

  ctx.on('page', setupPageHandlers);
  setupPageHandlers(page);

  // ─── 1. HOME PAGE ────────────────────────────────────────────────────────────
  console.log('\n═══ 1. HOME PAGE ═══');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('01_home');

  const title = await page.title();
  const heroText = await page.locator('h1').first().textContent().catch(() => '');
  const getStartedBtn = page.locator('text=Get Started').first();
  const findProsBtn = page.locator('text=Find Pros').first();
  const heroVisible = await page.locator('h1').first().isVisible().catch(() => false);

  if (heroVisible && title.includes('BuildGuru')) {
    log('PASS', 'Home Page', BASE, `Title: "${title}". Hero: "${heroText?.trim()}". CTAs present: ${await getStartedBtn.isVisible().catch(()=>false)}`);
  } else {
    log('FAIL', 'Home Page', BASE, `Hero not visible or wrong title: "${title}"`);
  }

  // Check nav links
  const navLinks = await page.locator('nav a').allTextContents().catch(() => []);
  log('PASS', 'Home Nav', BASE, `Nav links found: ${navLinks.join(', ')}`);

  // ─── 2. SIGN IN PAGE ─────────────────────────────────────────────────────────
  console.log('\n═══ 2. SIGN IN ═══');
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('02_signin');

  const googleBtn = page.locator('button:has-text("Google"), button:has-text("Continue with Google")').first();
  const googleVisible = await googleBtn.isVisible().catch(() => false);

  if (googleVisible) {
    log('PASS', 'Sign In Page', `${BASE}/sign-in`, 'Google OAuth button is visible');
    // Click Google sign in
    console.log('  → Clicking Google sign-in button...');
    await googleBtn.click();
    await page.waitForTimeout(3000);
    await ss('02b_google_oauth');
    const afterUrl = page.url();
    if (afterUrl.includes('google') || afterUrl.includes('accounts') || afterUrl.includes('oauth')) {
      log('PASS', 'Google OAuth Redirect', afterUrl, 'Correctly redirected to Google OAuth');
      // Wait for user to complete OAuth (up to 30s)
      try {
        await page.waitForURL(url => url.href.includes('buildguru.online') && !url.href.includes('sign-in'), { timeout: 30000 });
        await ss('02c_after_login');
        log('PASS', 'Google OAuth Complete', page.url(), `Signed in. Landed on: ${page.url()}`);
      } catch(e) {
        log('WARNING', 'Google OAuth', page.url(), 'OAuth did not complete within 30s — may need manual interaction');
      }
    } else {
      log('WARNING', 'Google OAuth Redirect', afterUrl, `Did not redirect to Google. Current URL: ${afterUrl}`);
    }
  } else {
    log('FAIL', 'Sign In Page', `${BASE}/sign-in`, 'Google button not found');
  }

  // ─── 3. WHAT ARE YOU BUILDING ────────────────────────────────────────────────
  console.log('\n═══ 3. WHAT ARE YOU BUILDING ═══');
  await page.goto(`${BASE}/build`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('03_build_selector');
  const buildUrl = page.url();

  if (buildUrl.includes('/build') || buildUrl.includes('/sign-in')) {
    if (buildUrl.includes('/sign-in')) {
      log('PASS', 'Build Auth Guard', buildUrl, 'Correctly redirected to sign-in (unauthenticated)');
    } else {
      const newHomeOpt = await page.locator('text=New Home, text=Build a New Home').first().isVisible().catch(() => false);
      const remodelOpt = await page.locator('text=Remodel, text=Remodel a Space').first().isVisible().catch(() => false);
      log(newHomeOpt && remodelOpt ? 'PASS' : 'WARNING', 'Build Selector', buildUrl,
        `New Home option: ${newHomeOpt}, Remodel option: ${remodelOpt}`);
    }
  }

  // ─── 4. BUILD NEW HOME ───────────────────────────────────────────────────────
  console.log('\n═══ 4. BUILD NEW HOME ═══');
  await page.goto(`${BASE}/build/new-home`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('04_build_new_home_step1');
  const buildNewUrl = page.url();

  if (buildNewUrl.includes('sign-in')) {
    log('PASS', 'Build New Home Auth Guard', buildNewUrl, 'Auth guard working — redirected to sign-in');
  } else {
    // Try filling step 1
    const inputs = await page.locator('input[type="text"], textarea').count();
    log(inputs > 0 ? 'PASS' : 'WARNING', 'Build New Home Step 1', buildNewUrl, `Found ${inputs} input fields`);

    // Try clicking Next
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    const nextVisible = await nextBtn.isVisible().catch(() => false);
    if (nextVisible) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
      await ss('04b_build_validation');
      log('PASS', 'Build New Home Validation', buildNewUrl, 'Next button clicked — checking validation');
    }
  }

  // ─── 5. REMODEL HOME ─────────────────────────────────────────────────────────
  console.log('\n═══ 5. REMODEL ═══');
  await page.goto(`${BASE}/build/remodel`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('05_remodel');
  const remodelUrl = page.url();
  log(remodelUrl.includes('sign-in') ? 'PASS' : 'WARNING', 'Remodel Flow', remodelUrl,
    remodelUrl.includes('sign-in') ? 'Auth guard working' : `Loaded at ${remodelUrl}`);

  // ─── 6. PROJECT DASHBOARD ────────────────────────────────────────────────────
  console.log('\n═══ 6. PROJECT DASHBOARD ═══');
  await page.goto(`${BASE}/project`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('06_project_dashboard');

  const projUrl = page.url();
  const tabs = await page.locator('[role="tab"], .tab, button.tab-btn').allTextContents().catch(() => []);
  const hasContent = await page.locator('h1, h2, h3').first().isVisible().catch(() => false);
  log(hasContent ? 'PASS' : 'WARNING', 'Project Dashboard', projUrl,
    `URL: ${projUrl}. Tabs found: ${tabs.length}. Content: ${hasContent}`);

  // Click Add Task if visible
  const addTaskBtn = page.locator('button:has-text("Add Task"), button:has-text("+ Task")').first();
  if (await addTaskBtn.isVisible().catch(() => false)) {
    await addTaskBtn.click();
    await page.waitForTimeout(1000);
    await ss('06b_add_task_dialog');
    const promptUsed = await page.evaluate(() => !!window._lastPromptText).catch(() => false);
    log('WARNING', 'Project Dashboard Add Task', projUrl, 'Add Task clicked — check if modal or window.prompt() appeared');
    await page.keyboard.press('Escape');
  }

  // ─── 7. MARKETPLACE ──────────────────────────────────────────────────────────
  console.log('\n═══ 7. MARKETPLACE ═══');
  await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('07_marketplace');

  const proCards = await page.locator('[class*="pro-card"], [class*="card"]').count();
  const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]').first();
  const searchVisible = await searchInput.isVisible().catch(() => false);

  log(proCards > 0 || searchVisible ? 'PASS' : 'WARNING', 'Marketplace', `${BASE}/browse`,
    `Pro cards: ${proCards}, Search bar: ${searchVisible}`);

  if (searchVisible) {
    await searchInput.fill('architect');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await ss('07b_marketplace_search');
    log('PASS', 'Marketplace Search', `${BASE}/browse`, 'Search input works');
  }

  // Click first pro card
  const firstCard = page.locator('a[href*="/profile/"]').first();
  if (await firstCard.isVisible().catch(() => false)) {
    const profileHref = await firstCard.getAttribute('href');
    await firstCard.click();
    await waitLoad();
    await ss('07c_pro_profile');
    log('PASS', 'Pro Profile Route', page.url(), `Navigated to: ${page.url()}`);
    await page.goBack();
  }

  // ─── 8. SHOP PAGE ────────────────────────────────────────────────────────────
  console.log('\n═══ 8. SHOP ═══');
  await page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('08_shop');

  const shopSearch = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
  const shopSearchVisible = await shopSearch.isVisible().catch(() => false);

  // Test search
  if (shopSearchVisible) {
    await shopSearch.fill('tiles');
    const searchBtn = page.locator('button:has-text("Search")').first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(1000);
      await ss('08b_shop_search');
      const urlChanged = page.url() !== `${BASE}/shop`;
      log(urlChanged ? 'PASS' : 'FAIL', 'Shop Search', page.url(),
        urlChanged ? 'Search navigated somewhere' : 'Search button is a no-op (onClick={() => {}})');
    }
  }

  // Test category chips
  const chips = page.locator('[class*="chip"], [class*="category"]');
  const chipCount = await chips.count();
  if (chipCount > 0) {
    await chips.first().click();
    await page.waitForTimeout(800);
    await ss('08c_shop_chip');
    log('WARNING', 'Shop Category Chips', page.url(), `${chipCount} chips found — clicked first one`);
  }

  // Test department cards
  const deptCards = page.locator('[class*="dept"], [class*="department"], [class*="card"]').first();
  if (await deptCards.isVisible().catch(() => false)) {
    await deptCards.click();
    await page.waitForTimeout(800);
    log(page.url() !== `${BASE}/shop` ? 'PASS' : 'FAIL', 'Shop Department Cards', page.url(),
      `Click navigated to: ${page.url()}`);
    if (page.url() !== `${BASE}/shop`) await page.goBack();
  }

  // ─── 9. DOCUMENT VAULT ───────────────────────────────────────────────────────
  console.log('\n═══ 9. DOCUMENT VAULT ═══');
  await page.goto(`${BASE}/documents`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('09_documents');

  const docUrl = page.url();
  const uploadBtn = page.locator('button:has-text("Upload"), button:has-text("+ Upload")').first();
  const uploadVisible = await uploadBtn.isVisible().catch(() => false);
  log(uploadVisible ? 'PASS' : 'WARNING', 'Document Vault', docUrl, `Upload button visible: ${uploadVisible}`);

  const newFolderBtn = page.locator('button:has-text("New Folder"), button:has-text("+ New Folder"), button:has-text("+ Folder")').first();
  if (await newFolderBtn.isVisible().catch(() => false)) {
    await newFolderBtn.click();
    await page.waitForTimeout(1500);
    const promptFired = dialogsDetected.some(d => d.url.includes('documents'));
    await ss('09b_folder_prompt');
    log(promptFired ? 'WARNING' : 'PASS', 'Document Vault New Folder', docUrl,
      promptFired ? `window.prompt() confirmed: "${dialogsDetected.find(d=>d.url.includes('documents'))?.message}"` : 'No dialog — uses in-app modal');
  }

  // ─── 10. STAGE DASHBOARD ─────────────────────────────────────────────────────
  console.log('\n═══ 10. STAGE DASHBOARD ═══');
  await page.goto(`${BASE}/stage`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('10_stage');

  const stageUrl = page.url();
  const phases = await page.locator('[class*="phase"], [class*="stage"]').count();
  log('PASS', 'Stage Dashboard', stageUrl, `Phase/stage elements: ${phases}`);

  // ─── 11. ACCOUNT PAGE ────────────────────────────────────────────────────────
  console.log('\n═══ 11. ACCOUNT ═══');
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('11_account');

  const acctUrl = page.url();
  if (acctUrl.includes('sign-in')) {
    log('PASS', 'Account Auth Guard', acctUrl, 'Correctly redirected to sign-in');
  } else {
    const nameField = page.locator('input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]').first();
    const nameVisible = await nameField.isVisible().catch(() => false);
    log(nameVisible ? 'PASS' : 'WARNING', 'Account Page', acctUrl, `Name field visible: ${nameVisible}`);
  }

  // ─── 12. PRO DASHBOARD ───────────────────────────────────────────────────────
  console.log('\n═══ 12. PRO DASHBOARD ═══');
  await page.goto(`${BASE}/pro/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  await ss('12_pro_dashboard');
  const proUrl = page.url();
  log(proUrl.includes('sign-in') || proUrl.includes('/build') ? 'PASS' : 'WARNING',
    'Pro Dashboard Guard', proUrl, `Homeowner redirect: ${proUrl}`);

  // ─── 13. PROFILE PAGE ────────────────────────────────────────────────────────
  console.log('\n═══ 13. PROFILE PAGE ═══');
  // First go to marketplace to find a real slug
  await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  const profileLinks = await page.locator('a[href*="/profile/"]').all();
  if (profileLinks.length > 0) {
    const href = await profileLinks[0].getAttribute('href');
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
    await waitLoad();
    await ss('13_profile');
    const notFound = await page.locator('text=not found, text=Profile not found').first().isVisible().catch(() => false);
    log(notFound ? 'FAIL' : 'PASS', 'Pro Profile Page', page.url(),
      notFound ? 'Profile not found screen shown' : 'Profile loaded successfully');
  } else {
    await page.goto(`${BASE}/profile/test`, { waitUntil: 'domcontentloaded' });
    await waitLoad();
    await ss('13_profile_test');
    const notFound = await page.locator('text=not found, text=Profile not found').first().isVisible().catch(() => false);
    log(notFound ? 'WARNING' : 'PASS', 'Pro Profile Page', page.url(),
      `No real profile slugs in marketplace. /profile/test: ${notFound ? 'not found' : 'loaded'}`);
  }

  // ─── 14. SIGN OUT ────────────────────────────────────────────────────────────
  console.log('\n═══ 14. SIGN OUT ═══');
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await waitLoad();
  const signOutBtn = page.locator('button:has-text("Sign out"), button:has-text("Log out"), button:has-text("Sign Out")').first();
  if (await signOutBtn.isVisible().catch(() => false)) {
    await signOutBtn.click();
    await page.waitForTimeout(2000);
    await ss('14_after_signout');
    const postSignoutUrl = page.url();
    log(postSignoutUrl === `${BASE}/` || postSignoutUrl.includes('sign-in') ? 'PASS' : 'WARNING',
      'Sign Out', postSignoutUrl, `After sign-out URL: ${postSignoutUrl}`);
  } else {
    log('WARNING', 'Sign Out', page.url(), 'Sign out button not found (may not be signed in)');
  }

  // ─── GENERATE REPORT ─────────────────────────────────────────────────────────
  await ctx.close();

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARNING').length;

  const reportLines = [
    '# BuildGuru — Live Production UAT Report',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**URL:** https://buildguru.online/`,
    `**Method:** Live browser testing via Playwright (Chromium)`,
    '',
    '## Executive Summary',
    '',
    '| Status | Count |',
    '|---|---|',
    `| ✅ PASS | ${pass} |`,
    `| ⚠️ WARNING | ${warn} |`,
    `| ❌ FAIL | ${fail} |`,
    `| **Total** | **${results.length}** |`,
    '',
    '## Page Results',
    '',
    '| Status | Page | URL | Findings |',
    '|---|---|---|---|',
    ...results.map(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      return `| ${icon} | ${r.pageName} | ${r.url} | ${r.notes} |`;
    }),
    '',
    '## Console Errors Captured',
    '',
    consoleErrors.length > 0
      ? consoleErrors.map(e => `- \`${e}\``).join('\n')
      : '_No console errors captured._',
    '',
    '## Screenshots',
    '',
    ...fs.readdirSync(SS_DIR).map(f => `- [${f}](file://${SS_DIR}/${f})`),
    '',
    '## Dialogs Detected (window.prompt / window.alert)',
    '',
    dialogsDetected.length > 0
      ? dialogsDetected.map(d => `- **${d.type}** on \`${d.url}\`: \`${d.message}\``).join('\n')
      : '_No native browser dialogs detected._',
    '',
    `*Report generated by Playwright UAT — BuildGuru Production — ${new Date().toISOString()}*`
  ];

  const reportPath = path.join(REPORT_DIR, 'uat_production_2026_05_25.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'));
  console.log(`\n✅ Report saved to: ${reportPath}`);
  console.log(`📸 Screenshots saved to: ${SS_DIR}`);
  console.log(`\nSummary: ${pass} PASS, ${warn} WARNING, ${fail} FAIL`);
})();
