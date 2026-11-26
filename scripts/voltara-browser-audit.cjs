// Browser tests use an isolated localhost profile; never authenticate to the real Supabase.
const { chromium } = require(process.env.VOLTARA_PLAYWRIGHT_ROOT + "/node_modules/playwright");
const assert = require("node:assert/strict");
const base = "http://127.0.0.1:4173";
const routes = ["/","/gastos","/casa-3d","/aparelhos","/habitos","/contas","/agua","/simulador","/configuracoes","/compartilhar","/instalar","/financas"];

(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const context = await browser.newContext({viewport:{width:1366,height:768}, acceptDownloads:true});
  const page = await context.newPage();
  const errors=[];
  page.on("pageerror", error => errors.push(error.message));
  // All tests use fake records in a fresh browser. No production account or writes.
  await context.route("https://okbqictunqsiqmoygbjs.supabase.co/**", route => route.abort());
  async function open(path) {
    const res=await page.goto(base+path,{waitUntil:"domcontentloaded"});
    assert.equal(res.status(),200,path+" HTTP");
    await page.locator("#voltara-main").waitFor({state:"visible"});
    await page.locator("#voltara-main").locator("text=Não foi possível carregar esta página").count().then(n=>assert.equal(n,0));
  }
  async function state() { return page.evaluate(()=>JSON.parse(localStorage.getItem("voltara:v1")||"null")); }
  await open("/gastos");
  await page.locator("#expense-date").fill("2026-11-26");
  await page.locator("#expense-note").fill("Auditoria local");
  await page.locator("#expense-amount").fill("17,90");
  await page.locator("#expense-room").selectOption("cozinha");
  await page.locator("form button[type=submit]").click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("voltara:v1")||"{}").expenses?.length===1);
  assert.equal((await state()).expenses[0].amount,17.9);
  await page.reload();
  await page.locator("#expense-filter").fill("2026-11");
  await page.getByText("Auditoria local",{exact:true}).first().waitFor();
  await page.getByRole("button",{name:"Editar gasto",exact:true}).click();
  await page.locator("#expense-amount").fill("21,50");
  await page.locator("form button[type=submit]").click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("voltara:v1")||"{}").expenses?.[0]?.amount===21.5);
  await open("/casa-3d");
  await page.locator("#house-month").fill("2026-11");
  assert.equal((await state()).expenses[0].room,"cozinha");
  await open("/agua");
  await page.locator("#water-month").fill("2026-11");
  await page.locator("#water-amount").fill("79,90");
  await page.locator("#water-m3").fill("12,5");
  await page.locator("form button[type=submit]").click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("voltara:v1")||"{}").waterBills?.length===1);
  assert.equal((await state()).waterBills[0].value,79.9);
  await open("/contas");
  await page.locator("#bill-month").fill("2026-11");
  await page.locator("#bill-value").fill("220");
  await page.locator("#bill-kwh").fill("163");
  await page.locator("form button[type=submit]").click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("voltara:v1")||"{}").bills?.length===1);
  assert.equal((await state()).bills[0].kwh,163);
  await open("/configuracoes");
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:/Exportar backup completo/}).click();
  assert.equal((await download).suggestedFilename(),"voltara-backup.json");
  await open("/gastos");
  await page.locator("#expense-filter").fill("2026-11");
  await page.getByRole("button",{name:"Excluir gasto",exact:true}).click();
  await page.getByRole("button",{name:"Confirmar exclusão",exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("voltara:v1")||"{}").expenses?.length===0);
  console.log("PASS: inclusão, edição, recarga, cômodo, água, luz, exportação e exclusão locais");
  for(const route of routes) await open(route);
  console.log("PASS: 11 rotas desktop");
  await page.setViewportSize({width:390,height:844});
  for(const route of routes) {
    await open(route);
    const viewport=await page.evaluate(()=>({document:document.documentElement.scrollWidth,window:innerWidth}));
    assert(viewport.document <= viewport.window+2,route+" overflow horizontal: "+JSON.stringify(viewport));
  }
  console.log("PASS: 11 rotas no viewport móvel");
  assert.deepEqual(errors,[],"Erros JavaScript não tratados");
  console.log("PASS: nenhum erro JavaScript não tratado");
 } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
