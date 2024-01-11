const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50
  });

  const page = await browser.newPage();
  const url = 'https://nikkei225jp.com/data/touraku.php';
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 騰落レシオ日
  const elemRatioDate = await page.$('#datatbl > tr:nth-child(3) > td.dtb1 > time');
  const ratioDate = await elemRatioDate.evaluate(el => el.textContent);
  // 騰落レシオ
  const elemRatio = await page.$('#datatbl > tr:nth-child(3) > td:nth-child(7)');
  const ratio = await elemRatio.evaluate(el => el.textContent);

  console.log(ratioDate + ':' + ratio);

  await browser.close();

})().catch(e => console.error(e));