const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-sandbox',
      '--no-zygote',
      '--single-process'
    ]
  });

  const url = 'https://nikkei225jp.com/data/touraku.php';
  const page = await browser.newPage();
  // domcontentloadedが一番速い。他の設定値だと余計なファイルの読み込み待ちになるのかも
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 最新の騰落レシオを取得
  // const elem = await page.$('td.dtb1');
  // const ratioDate = await elem.evaluate(el => el.textContent);
  // const elem2 = await page.$('td.dtb6');
  // const ratio = await elem2.evaluate(el => el.textContent)

  const elems = await page.$$('td.dtb1');
  for (let i = 0; i < elems.length; i++) {
    let ratioDate = await elems[i].evaluate(el => el.textContent);
    console.log(ratioDate);
  }

  // const ratioDate = await elem.evaluate(el => el.textContent);
  // const elem2 = await page.$('td.dtb6');
  // const ratio = await elem2.evaluate(el => el.textContent)

  // console.log(ratioDate + ':' + ratio);
  // console.log(new Date(ratioDate) + ':' + Number(ratio));

  await browser.close();
})().catch(e => console.error(e));