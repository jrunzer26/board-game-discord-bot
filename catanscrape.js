


await getUserStats('json26');
await getUserStats('FBM991996');
await getUserStats('Julixi');


async function getUserStats(user) {
  const browser = await puppeteer.launch();
console.log(user);
  var url = 'https://colonist.io/profile/'+user;
  console.log(url);
const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  console.log(await getElementText(page, "#wins_stat"));
console.log(await getElementText(page, "#games_stat"));
console.log(await getElementText(page, "#points_stat"));
console.log(await getElementText(page, "#pg_stat"));
  console.log();
  await browser.close();
  await new Promise(resolve => setTimeout(resolve, 1000));
}
async function getElementText(page, id) {
  const element = await page.$(id);
  return await page.evaluate(element => element.textContent, element);
}

