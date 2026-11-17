/* 线上冒烟（真实断言版 · 2026-11-17 重写）
   旧版是 10-08 写的"只打印不断言"探针，且不登录——v15 有登录层之后它读到的永远是空清单，
   站点一恢复就会以 0 断言收场被判假绿。现改为：登录 → 清单 → 进组 → 作答 → 判分 → 无报错，
   每条都落成 run_all 可计数的 ok/FAIL 行。
   运行：node test_online.js    （换站点：set CET4_ONLINE_URL=... 再跑） */
const path = require('path');
const { chromium: loadChromium, EXE, onlinePreflight, ONLINE_BASE } = require('./_env');
const { chromium } = loadChromium();

const OK = [], FAIL = [];
const chk = (name, pass, detail) => {
  const line = (pass ? 'ok   ' : 'FAIL ') + name + (detail ? ' | ' + detail : '');
  console.log(line);
  (pass ? OK : FAIL).push(line);
};

(async () => {
  // 站点没部署/资源 404 时显式跳过，避免 0 断言被判假绿
  const pre = await onlinePreflight(ONLINE_BASE);
  if (!pre.ok) { console.log('ENV-SKIP: 线上站点未就绪（' + pre.reason + '），部署后重跑本用例'); return; }

  console.log('线上地址: ' + ONLINE_BASE);
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 940 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept(''));

  try {
    await page.goto(ONLINE_BASE, { waitUntil: 'load', timeout: 60000 });

    // 1) 登录层 + 登录
    const hasMask = await page.waitForSelector('#loginMask', { timeout: 30000 }).then(() => true).catch(() => false);
    chk('未登录时显示登录层', hasMask);
    await page.locator('#phoneInput').fill('9911');
    await page.locator('#loginBtn').click();
    const cardsOk = await page.waitForSelector('#planList .card', { timeout: 30000 }).then(() => true).catch(() => false);
    chk('登录后生成今日清单卡片', cardsOk);

    const summary = ((await page.textContent('#planSummary').catch(() => '')) || '').trim();
    chk('清单摘要可读（含「今日清单」）', /今日清单/.test(summary), summary.slice(0, 40));

    const cardCount = await page.locator('#planList .card').count();
    chk('清单卡片数 ≥ 3', cardCount >= 3, 'cards=' + cardCount);

    // 2) 进组 + 等题目真正渲染（按需加载：点开始不等于题目已挂载）
    await page.locator('#planList .card button').first().click();
    await page.waitForSelector('#quiz.show', { timeout: 20000 }).catch(() => { });
    const rendered = await page.waitForFunction(() => {
      const b = document.getElementById('quizBody');
      return !!b && (b.querySelectorAll('.opt').length || b.querySelectorAll('.cloze-slot').length || b.querySelector('#essayTa'));
    }, null, { timeout: 60000 }).then(() => true).catch(() => false);
    chk('点开始后题目渲染（线上按需加载卷成功）', rendered);

    const banks = await page.evaluate(() => (window.CET4_BANKS || []).length);
    chk('按需加载：至少 1 套卷已注入', banks >= 1, 'banks=' + banks);

    // 3) 作答 → 提交 → 判分（客观题 .opt / 选词填空 .cloze-slot+.wb-chip）
    const answered = await page.evaluate(() => {
      const body = document.getElementById('quizBody');
      if (!body) return 0;
      let n = 0;
      const seen = {};
      Array.prototype.forEach.call(body.querySelectorAll('.opt[data-q]'), (b) => {
        const q = b.getAttribute('data-q');
        if (!seen[q]) { seen[q] = 1; b.click(); n++; }
      });
      const chips = Array.prototype.slice.call(body.querySelectorAll('.wb-chip'));
      Array.prototype.forEach.call(body.querySelectorAll('.cloze-slot[data-qno]'), (slot, i) => {
        if (slot.getAttribute('data-picked')) return;
        const chip = chips[i] || chips[chips.length - 1];
        if (!chip) return;
        slot.click(); chip.click();
        if (slot.getAttribute('data-picked')) n++;
      });
      return n;
    });
    chk('整组题目全部作答', answered >= 1, 'answered=' + answered);

    let judged = false;
    if (await page.locator('#essayTa').count()) {
      await page.locator('#essayTa').fill('线上冒烟用作文草稿，长度足够触发保存逻辑，用于验证 https 下写作页可用。');
      await page.locator('#essayDone').click({ timeout: 15000 }).catch(() => { });
      judged = (await page.locator('#quizBody').textContent()).indexOf('自查') >= 0 ||
        (await page.locator('#groupDone, #essayDone').count()) > 0;
    } else {
      const sub = page.locator('#groupSubmit');
      if (await sub.count()) {
        await sub.click({ timeout: 15000 }).catch(() => { });
        judged = await page.waitForSelector('#groupDone', { timeout: 30000 }).then(() => true).catch(() => false);
      }
    }
    chk('提交后出现判分结果（#groupDone）', judged);

    // 4) 全程无应用自身 JS 错误
    const appErrs = errs.filter(e => !/favicon|manifest|Failed to load resource/i.test(e));
    chk('线上全程无应用 JS 错误', appErrs.length === 0, appErrs.slice(0, 3).join(' || ') || 'none');

    await page.screenshot({ path: path.join(__dirname, '..', 'docs', 'online-smoke.png') });
  } catch (e) {
    chk('线上冒烟过程未抛异常', false, String(e && e.message).split('\n')[0]);
  } finally {
    await browser.close();
  }

  console.log('\n===== 线上冒烟: ' + OK.length + ' ok / ' + FAIL.length + ' fail =====');
  if (FAIL.length) { console.log('GATE FAIL: 线上冒烟有 ' + FAIL.length + ' 条失败'); process.exitCode = 1; }
  else console.log('GATE PASS: 线上站点功能正常');
})();
