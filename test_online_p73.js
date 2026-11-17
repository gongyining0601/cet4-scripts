/* 2026-11-17 退役：本脚本是"只打印不断言"的老探针，且前提已被 v15 摧毁——
   首屏按需加载不会自动载 76 卷（p72 等 76 卷必超时；p71 取 p1.questions 直接抛错）。
   它要验的事本地已有更强断言覆盖：p71→test_p7fix.js，p72→test_p72.js，p73→test_p73.js；
   真实 https 链路由 test_online.js 承担。文件保留作历史证据，已移出 run_all 回归清单。 */
/* P7.3 线上冒烟：登录层 → 手机号登录 → 今日清单 → 考点表 → 积极文案 */
const path = require('path');
const { chromium: loadChromium, EXE, onlinePreflight, ONLINE_BASE } = require('./_env');
const { chromium } = loadChromium();
const URL = ONLINE_BASE;

(async () => {
  // 站点未部署/资源 404 时显式 ENV-SKIP，避免 0 断言被判假绿（部署后自动转真实校验）
  const pre = await onlinePreflight(URL);
  if (!pre.ok) { console.log('ENV-SKIP: 线上站点未就绪（' + pre.reason + '），部署后重跑本用例'); return; }
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept(''));
  const results = [];
  const check = (name, ok) => { results.push((ok ? 'ok' : 'FAIL') + ' - ' + name); };

  await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => window.CET4_BANKS && window.CET4_BANKS.length >= 76, null, { timeout: 540000 });
  await page.waitForTimeout(1000);
  check('线上题库 76 套加载(' + (await page.evaluate(() => window.CET4_BANKS.length)) + ' 套)', true);

  // sw 缓存版本升级后：新访客直接看到登录层
  check('未登录先出登录层', (await page.locator('#loginMask').count()) === 1);
  await page.locator('#phoneInput').fill('1234');
  await page.locator('#loginBtn').click();
  await page.waitForSelector('#planList .card', { timeout: 30000 });
  check('登录后生成今日清单', (await page.locator('#planList .card').count()) >= 1);
  check('顶栏显示编号', /1234/.test(await page.locator('#userChip').textContent()));
  check('旧用户数据不串号(独立 key)', (await page.evaluate(() => localStorage.getItem('cet4_p1_state_v1_1234') !== null)));

  // 统计页考点表
  await page.locator('nav button[data-p="stat"]').click(); await page.waitForTimeout(600);
  const ptHead = await page.locator('#page-stat').textContent();
  check('统计页含考点正确率卡片', ptHead.indexOf('考点正确率') >= 0);
  const ptBody = await page.locator('#ptTable').textContent();
  check('考点表空态提示(新账号无做题记录)', /做题/.test(ptBody));
  await page.screenshot({ path: path.join(__dirname, '..', 'docs/online-p73-stat.png'), fullPage: true });

  // 积极文案
  await page.locator('nav button[data-p="today"]').click(); await page.waitForTimeout(400);
  const floorTxt = await page.locator('#floorBtn').textContent();
  check('忙日打卡按钮文案: ' + floorTxt.trim().slice(0, 22), /忙日打卡/.test(floorTxt) && !/躺平|保底/.test(floorTxt));
  const bodyTxt = await page.evaluate(() => document.body.textContent);
  check('线上全页面无「躺平」「保底」', bodyTxt.indexOf('躺平') < 0 && bodyTxt.indexOf('保底') < 0);
  await page.screenshot({ path: path.join(__dirname, '..', 'docs/online-p73-today.png'), fullPage: true });

  console.log(results.join('\n'));
  console.log('console errors:', errors.length ? errors.join(' | ') : 'none');
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log('=== P7.3 线上冒烟: ' + (results.length - fails) + ' ok / ' + fails + ' fail ===');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
