const {chromium}=require(process.env.VOLTARA_PLAYWRIGHT_ROOT+"/node_modules/playwright");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  await context.route("https://okbqictunqsiqmoygbjs.supabase.co/**",r=>r.abort());
  const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",dialog=>dialog.accept());
  await page.goto("http://127.0.0.1:4173/financas",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"Finanças da casa"}).waitFor();
  await page.getByLabel("Mês de referência").fill("2026-11");
  async function tab(name){await page.getByRole("button",{name,exact:true}).click()}
  async function fill(name,value){await page.locator("form [name="+name+"]").fill(value)}
  async function save(){await page.getByRole("button",{name:"Salvar",exact:true}).click()}
  async function count(type,n){await page.waitForFunction(([t,c])=>(JSON.parse(localStorage.getItem("voltara:v1")||"{}").finance||[]).filter(x=>x.type===t).length===c,[type,n]);}
  await tab("Receitas");await fill("title","Salário fictício");await fill("date","2026-11-01");await fill("amount","3000,00");await save();await count("income",1);
  await tab("Orçamento");await page.locator("form select[name=category]").selectOption("Alimentação");await fill("amount","800,00");await save();await count("budget",1);
  await tab("Calendário");await fill("title","Aluguel fictício");await fill("date","2026-11-15");await fill("amount","1000,00");await page.locator("form select[name=category]").selectOption("Moradia");await page.locator("form input[name=recurring]").check();await save();await count("payable",1);
  await tab("Cartões");await page.locator("form").first().locator("[name=title]").fill("Cartão de teste");await page.locator("form").first().locator("[name=amount]").fill("2000,00");await page.locator("form").first().getByRole("button",{name:"Salvar"}).click();await count("card",1);
  const purchase=page.locator("form").nth(1);await purchase.locator("[name=title]").fill("Compra parcelada");await purchase.locator("select[name=cardId]").selectOption({index:1});await purchase.locator("[name=amount]").fill("100,01");await purchase.locator("[name=firstMonth]").fill("2026-11");await purchase.locator("[name=installments]").fill("3");await purchase.getByRole("button",{name:"Salvar"}).click();await count("purchase",1);
  await tab("Visão geral");await page.getByText("Saldo projetado",{exact:true}).waitFor();
  await page.reload();await page.getByLabel("Mês de referência").fill("2026-11");await count("purchase",1);
  await tab("Compras");await fill("title","Arroz");await fill("quantity","2");await fill("amount","12,50");await save();await count("shopping",1);
  await tab("Diagnóstico");await page.getByRole("button",{name:"Criar ponto de recuperação"}).click();await page.getByText("Ponto de recuperação gravado no IndexedDB.",{exact:true}).waitFor();
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar cópia"}).click();assert.equal((await download).suggestedFilename(),"voltara-recuperacao.json");
  await tab("Scanner");
  const png=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=1000;c.height=300;const ctx=c.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle="black";ctx.font="bold 52px Arial";ctx.fillText("MERCADO TESTE",40,75);ctx.fillText("26/11/2026",40,145);ctx.fillText("TOTAL A PAGAR R$ 123,45",40,220);return c.toDataURL("image/png").split(",")[1]});
  await page.getByLabel("Imagem da nota").setInputFiles({name:"nota-ficticia.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await page.getByRole("button",{name:"Reconhecer nota"}).click();
  await page.getByRole("button",{name:"Confirmar e salvar"}).waitFor({timeout:120000});
  assert.equal(await page.getByLabel("Valor total (R$)").inputValue(),"123,45");
  assert.equal(await page.getByLabel("Data (para faturas, use o mês de referência correto)").inputValue(),"2026-11-26");
  const viewport=await page.evaluate(()=>({document:document.documentElement.scrollWidth,window:innerWidth}));
  assert(viewport.document<=viewport.window+2,"Overflow: "+JSON.stringify(viewport));
  assert.deepEqual(errors,[]);
  console.log("PASS finance: income, budget, recurring payable, card, installments, reload, shopping, Dexie export, real OCR on synthetic receipt, mobile layout");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
