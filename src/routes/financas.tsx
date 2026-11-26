import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet, CalendarDays, CreditCard, ShoppingCart, Wrench, Gauge, Bell, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityHistory } from "@/components/voltara/ActivityHistory";
import { PageHeader, Panel, Notice, Stat } from "@/components/voltara/ui";
import { setVoltara, useVoltara } from "@/lib/voltara/store";
import { useCloudStatus, retryHouseholdSync } from "@/lib/voltara/cloud-sync";
import { currentMonthKey, money, uid } from "@/lib/voltara/format";
import { localDateKey } from "@/lib/voltara/expenses";
import { categories, financeSchema, itemsOf, parseCents, summarize, shopTotal, meterIntervals, validDate, installmentCents, shiftMonth, type FinanceItem, type Commitment, type Category } from "@/lib/voltara/finance";

export const Route = createFileRoute("/financas")({head:()=>({meta:[{title:"Finanças da casa | Voltara"}]}),component:FinancePage});
const tabs = [
  ["overview","Visão geral",Wallet],["income","Receitas",Wallet],["budget","Orçamento",Gauge],
  ["payable","Calendário",CalendarDays],["card","Cartões",CreditCard],["shopping","Compras",ShoppingCart],
  ["maintenance","Manutenção",Wrench],["meter","Medidores",Gauge],["alerts","Avisos",Bell],["history","Histórico",Activity],["diagnostic","Diagnóstico",Activity],
] as const;
type Tab=typeof tabs[number][0];
const field = "w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm min-h-11";
const cash=(c:number)=>money(c/100);
function FinancePage(){
  const state=useVoltara();
  const sync=useCloudStatus();
  const all=state.finance??[];
  const [tab,setTab]=useState<Tab>("overview");
  const [month,setMonth]=useState(currentMonthKey);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editing,setEditing]=useState<FinanceItem|null>(null);
  const today=localDateKey();
  const summary=summarize(all,state.expenses,month);
  const prior=summarize(all,state.expenses,shiftMonth(month,-1));
  const locked=sync.phase==="connecting"||sync.phase==="empty"||(sync.phase==="error"&&!sync.householdId);
  const budgets=itemsOf(all,"budget").filter(b=>b.month===month);
  const overdue=summary.scheduled.filter(c=>c.due<today&&c.paid<c.cents);
  const upcoming=summary.scheduled.filter(c=>c.due>=today&&c.paid<c.cents&&Date.parse(c.due)-Date.parse(today)<=7*86400000);
  function act(fn:()=>void){setError("");setNotice("");try{if(locked)throw Error("Aguarde a conexão da casa.");fn();}catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir.");}}
  function save(item:FinanceItem){
    const parsed=financeSchema.parse(item);
    setVoltara(s=>{
      const previous=s.finance??[];
      if(previous.length>=5000&&!previous.some(p=>p.id===parsed.id))throw Error("Limite de 5.000 registros financeiros.");
      return {...s,finance:[...previous.filter(p=>p.id!==parsed.id),parsed]};
    });
    setNotice("Registro salvo. Confira a sincronização em Compartilhar.");setEditing(null);
  }
  function remove(item:FinanceItem){
    if(!window.confirm("Excluir este registro da casa compartilhada?"))return;
    act(()=>{
      if((item.type==="card"||item.type==="payable")&&all.some(p=>(p.type==="purchase"&&p.cardId===item.id)||(p.type==="settlement"&&p.sourceId===item.id)))throw Error("Há compras ou pagamentos vinculados. Preserve o histórico.");
      if(item.type==="purchase"&&itemsOf(all,"settlement").some(p=>p.sourceId===item.cardId))throw Error("Este cartão já possui pagamentos registrados; preserve o histórico da compra.");
      if(item.type==="shopping"&&item.purchased)throw Error("Compra convertida: preserve o vínculo com o gasto.");
      setVoltara(s=>({...s,finance:(s.finance??[]).filter(p=>p.id!==item.id)}));setNotice("Registro removido.");setEditing(null);
    });
  }
  function submit(e:FormEvent<HTMLFormElement>,type:"income"|"budget"|"payable"|"card"|"purchase"|"shopping"|"maintenance"|"meter"){
    e.preventDefault();
    const form=e.currentTarget;const data=new FormData(form);const str=(name:string)=>String(data.get(name)??"").trim();
    act(()=>{
      const itemId=editing?.type===type?editing.id:uid();
      const amount=parseCents(str("amount"));
      const cat=str("category") as Category;
      const name=str("title");
      const date=str("date");
      if(editing&&!all.some(p=>p.id===editing.id))throw Error("Registro removido em outro aparelho.");
      let item: FinanceItem;
      if(type==="income")item={id:itemId,type,title:name,date,cents:amount??0};
      else if(type==="budget")item={id:"budget:"+month+":"+cat,type,month,category:cat,cents:amount??0};
      else if(type==="payable")item={id:itemId,type,title:name,due:date,cents:amount??0,category:cat,recurring:data.has("recurring")};
      else if(type==="card")item={id:itemId,type,title:name,limit:amount??0,closing:Number(str("closing")),dueDay:Number(str("dueDay"))};
      else if(type==="purchase"){
        if(!itemsOf(all,"card").some(c=>c.id===str("cardId")))throw Error("Cadastre um cartão primeiro.");
        const installments=Number(str("installments"));
        if((amount??0)<installments)throw Error("Valor total insuficiente para o número de parcelas.");
        item={id:itemId,type,title:name,cardId:str("cardId"),firstMonth:str("firstMonth"),cents:amount??0,installments,category:cat};
      }else if(type==="shopping")item={id:itemId,type,title:name,quantity:Number(str("quantity").replace(",",".")),unitCents:amount??0,checked:false,purchased:false};
      else if(type==="maintenance")item={id:itemId,type,title:name,due:date,note:str("note"),done:false};
      else {
        const raw=str("reading");if(!/^\d+(?:[,.]\d{1,3})?$/.test(raw))throw Error("Informe uma leitura válida.");
        const meter=str("meter") as "energy"|"water";
        item={id:"meter:"+meter+":"+date,type,meter,date,value:Number(raw.replace(",","."))};
      }
      const result=financeSchema.safeParse(item);
      if(!result.success)throw Error("Confira os campos, datas e valores informados.");
      save(result.data);form.reset();
    });
  }
  function pay(row:Commitment){
    act(()=>{
      const remaining=row.cents-row.paid;
      if(remaining<=0)return;
      if(row.paid>0)throw Error("Já existe pagamento parcial. Revise o histórico antes de registrar outro.");
      if(!window.confirm("Confirmar pagamento de "+cash(remaining)+" em "+today+"?"))return;
      save({id:row.paymentId,type:"settlement",sourceId:row.sourceId,month:row.month,date:today,cents:remaining,category:row.category});
    });
  }
  function convert(item:Extract<FinanceItem,{type:"shopping"}>){
    const value=window.prompt("Confirme o valor REAL pago pelo item (R$). Não registre novamente em Gastos.",(shopTotal(item)/100).toFixed(2).replace(".",","));
    if(value===null)return;
    act(()=>{
      const cents=parseCents(value);if(!cents)throw Error("Valor inválido.");
      const expenseId="shop-"+item.id;
      setVoltara(s=>{
        const current=itemsOf(s.finance??[],"shopping").find(p=>p.id===item.id);
        if(!current||current.purchased||s.expenses.some(p=>p.id===expenseId))throw Error("Compra já convertida ou removida.");
        if(s.expenses.length>=10000||(s.finance??[]).length>=4999)throw Error("Limite de registros atingido.");
        const expense={id:expenseId,date:today,note:current.title,amount:cents/100};
        const categoryRecord:FinanceItem={id:"cat-"+expenseId,type:"expense-category",expenseId,category:"Alimentação"};
        return {...s,expenses:[...s.expenses,expense],finance:[...(s.finance??[]).map(p=>p.id===item.id?{...current,purchased:true,checked:true}:p),categoryRecord]};
      });setNotice("Compra registrada em Gastos. Categoria inicial: Alimentação (editável no orçamento).");
    });
  }
  const input=(name:string,label:string,type="text",defaultValue="",more:Record<string,unknown>={})=><label className="grid gap-1 text-sm text-muted-foreground">{label}<Input className="min-h-11" name={name} type={type} defaultValue={defaultValue} required {...more}/></label>;
  const catField=(selected="Outros")=><label className="grid gap-1 text-sm text-muted-foreground">Categoria<select name="category" defaultValue={selected} className={field}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>;
  const form=(type:Parameters<typeof submit>[1],fields:React.ReactNode)=><form key={type+":"+(editing?.id??"new")+":"+month} onSubmit={e=>submit(e,type)} className="grid gap-3 sm:grid-cols-2">{fields}<div className="flex flex-wrap items-end gap-2"><Button type="submit" disabled={locked}>Salvar</Button>{editing&&<Button type="button" variant="outline" onClick={()=>setEditing(null)}>Cancelar edição</Button>}</div></form>;
  const row=(item:FinanceItem,label:string,detail:string,controls?:React.ReactNode,editable=false)=><div key={item.id} className="flex flex-wrap items-center gap-2 border-b py-3 last:border-0"><div className="min-w-0 flex-1 break-words"><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div>{controls}{editable&&<Button size="sm" variant="outline" onClick={()=>setEditing(item)}>Editar</Button>}<Button size="sm" variant="ghost" disabled={locked} onClick={()=>remove(item)}>Excluir</Button></div>;
  const categoryMap=new Map(itemsOf(all,"expense-category").map(e=>[e.expenseId,e.category]));
  const editIncome=editing?.type==="income"?editing:null;
  const editPayable=editing?.type==="payable"?editing:null;
  const editCard=editing?.type==="card"?editing:null;
  const editMaintenance=editing?.type==="maintenance"?editing:null;
  return <div className="space-y-4">
    <PageHeader title="Finanças da casa" subtitle="Planejamento familiar, contas, compras e consumo em um só lugar." action={<Input aria-label="Mês de referência" type="month" value={month} onChange={e=>{if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)){setMonth(e.target.value);setEditing(null);}}}/>}/>
    <nav aria-label="Seções financeiras" className="flex flex-wrap gap-2">{tabs.map(([id,label,Icon])=><Button key={id} variant={tab===id?"default":"outline"} size="sm" onClick={()=>{setTab(id);setEditing(null);setError("");setNotice("");}}><Icon className="size-4 mr-1.5"/>{label}</Button>)}</nav>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-sm text-success">{notice}</p>}
    {locked&&<Notice tone="warn">Aguarde o carregamento da casa antes de cadastrar.</Notice>}
    {tab==="overview"&&<>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Receitas registradas" value={cash(summary.income)}/><Stat label="Saídas realizadas" value={cash(summary.dailyTotal+summary.paid)}/><Stat label="Saldo do mês" value={cash(summary.balance)}/><Stat label="Saldo projetado" value={cash(summary.projected)} sub="Após compromissos pendentes"/></div>
      <Panel title="Diagnóstico financeiro" hint="Análise por regras, sem IA externa."><div className="space-y-3"><Notice>{summary.projected<0?"Os compromissos registrados excedem as receitas do mês. Revise as despesas.":"O saldo projetado considera apenas receitas e compromissos cadastrados."}</Notice><p className="text-sm">Gastos cotidianos: {cash(summary.dailyTotal)}. Compromissos restantes: {cash(summary.remaining)}.</p><p className="text-sm">Variação dos gastos cotidianos ante o mês anterior: {prior.dailyTotal?((summary.dailyTotal-prior.dailyTotal)/prior.dailyTotal*100).toFixed(1)+"%":"sem base anterior"}.</p>{budgets.filter(b=>summary.spending[b.category]>b.cents).map(b=><Notice key={b.id} tone="warn">{b.category}: orçamento ultrapassado em {cash(summary.spending[b.category]-b.cents)}.</Notice>)}</div></Panel>
      <Notice>As contas de água e luz históricas são medições, não comprovantes de pagamento. Cadastre-as no calendário apenas se ainda não estiverem em Gastos. Não registre a mesma compra em Gastos e no cartão. Saldo não representa saldo bancário.</Notice>
    </>}
    {tab==="income"&&<Panel title="Receitas" hint="Salários e rendas extras efetivamente recebidos.">{form("income",<>{input("title","Descrição","text",editIncome?.title??"",{maxLength:120})}{input("date","Data","date",editIncome?.date??today)}{input("amount","Valor (R$)","text",editIncome?String(editIncome.cents/100):"",{inputMode:"decimal"})}</>)}<div className="mt-4">{itemsOf(all,"income").filter(p=>p.date.startsWith(month)).map(p=>row(p,p.title,p.date+" • "+cash(p.cents),undefined,true))}</div></Panel>}
    {tab==="budget"&&<>
      <Panel title="Limites por categoria">{form("budget",<>{catField()}{input("amount","Limite do mês (R$)","text","",{inputMode:"decimal"})}</>)}<div className="mt-4 space-y-3">{budgets.map(b=><div key={b.id} className="rounded-xl border p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{b.category}</strong><span>{cash(summary.spending[b.category])} / {cash(b.cents)}</span></div><progress className="mt-2 h-2 w-full accent-primary" max={b.cents} value={Math.min(b.cents,summary.spending[b.category])}/>{summary.spending[b.category]>b.cents&&<p className="text-xs text-destructive">Acima do limite</p>}<Button size="sm" variant="ghost" onClick={()=>remove(b)}>Excluir limite</Button></div>)}</div></Panel>
      <Panel title="Classificar gastos existentes" hint="Os gastos originais são preservados."><div className="max-h-[420px] overflow-auto">{state.expenses.filter(e=>e.date.startsWith(month)).map(e=><div key={e.id} className="flex flex-wrap items-center gap-2 border-b py-2"><div className="min-w-0 flex-1 break-words text-sm">{e.note||"Gasto"} • {money(e.amount)}</div><select aria-label={"Categoria de "+e.note} disabled={locked} value={categoryMap.get(e.id)??"Outros"} className="max-w-full rounded-md border bg-background p-2 text-sm" onChange={ev=>act(()=>save({id:"cat-"+e.id,type:"expense-category",expenseId:e.id,category:ev.target.value as Category}))}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>)}</div></Panel>
    </>}
    {tab==="payable"&&<>
      <Panel title="Nova conta a pagar" hint="Contas fixas podem se repetir mensalmente; vencimentos nos dias 29–31 são ajustados ao fim do mês.">{form("payable",<>{input("title","Descrição","text",editPayable?.title??"",{maxLength:120})}{input("date","Primeiro vencimento","date",editPayable?.due??today)}{input("amount","Valor (R$)","text",editPayable?String(editPayable.cents/100):"")}{catField(editPayable?.category)}<label className="flex items-center gap-2"><input name="recurring" type="checkbox" defaultChecked={editPayable?.recurring??false}/> Repetir mensalmente</label></>)}</Panel>
      <Panel title="Calendário do mês">{summary.scheduled.map(c=><div key={c.sourceId} className="flex flex-wrap items-center gap-2 border-b py-3"><div className="flex-1 min-w-0"><p className="font-medium break-words">{c.title}</p><p className="text-xs text-muted-foreground">{c.due} • {cash(c.cents)} • {c.paid>=c.cents?"Paga":c.due<today?"Atrasada":"Pendente"}</p></div>{c.paid<c.cents&&<Button size="sm" disabled={locked} onClick={()=>pay(c)}>Registrar pagamento</Button>}</div>)}{!summary.scheduled.length&&<p className="text-sm text-muted-foreground">Sem compromissos neste mês.</p>}</Panel>
      <Panel title="Contas cadastradas">{itemsOf(all,"payable").map(p=>row(p,p.title,cash(p.cents)+(p.recurring?" • mensal":""),undefined,!itemsOf(all,"settlement").some(s=>s.sourceId===p.id)))}</Panel>
      <Panel title="Pagamentos registrados">{itemsOf(all,"settlement").filter(p=>p.date.startsWith(month)).map(p=>row(p,all.find(s=>s.id===p.sourceId&&("title" in s))?.type==="card"?"Pagamento de cartão":"Pagamento",p.date+" • "+cash(p.cents)))}</Panel>
    </>}
    {tab==="card"&&<>
      <Panel title="Cartões de crédito" hint="Não armazena número, CVV ou senha do cartão.">{form("card",<>{input("title","Apelido do cartão","text",editCard?.title??"",{maxLength:120})}{input("amount","Limite (R$)","text",editCard?String(editCard.limit/100):"")}{input("closing","Dia de fechamento","number",String(editCard?.closing??1),{min:1,max:31})}{input("dueDay","Dia de vencimento","number",String(editCard?.dueDay??10),{min:1,max:31})}</>)}{itemsOf(all,"card").map(c=>row(c,c.title,"Limite "+cash(c.limit)+" • fecha dia "+c.closing+" • vence dia "+c.dueDay,undefined,!itemsOf(all,"settlement").some(s=>s.sourceId===c.id)))}</Panel>
      <Panel title="Nova compra parcelada" hint="Informe o mês de vencimento da primeira parcela conforme a fatura do cartão.">{form("purchase",<>{input("title","Descrição","text","",{maxLength:120})}<label className="grid gap-1 text-sm text-muted-foreground">Cartão<select required name="cardId" className={field}><option value="">Selecione</option>{itemsOf(all,"card").map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label>{input("amount","Valor total (R$)")}{input("firstMonth","Primeira parcela","month",month)}{input("installments","Número de parcelas","number","1",{min:1,max:48})}{catField()}</>)}<div className="mt-4">{itemsOf(all,"purchase").map(p=>row(p,p.title,cash(p.cents)+" em "+p.installments+"x • neste mês "+cash(installmentCents(p,month))))}</div><p className="mt-3 text-xs text-muted-foreground">Registre pagamentos no calendário. Não lance as parcelas novamente como gastos cotidianos.</p></Panel>
    </>}
    {tab==="shopping"&&<Panel title="Lista de compras compartilhada" hint="Estime preços, marque itens e confirme o valor real para registrar um gasto.">{form("shopping",<>{input("title","Produto","text","",{maxLength:120})}{input("quantity","Quantidade","text","1")}{input("amount","Preço por unidade (R$)")}</>)}<p className="my-3 text-sm">Total estimado pendente: {cash(itemsOf(all,"shopping").filter(i=>!i.purchased).reduce((s,i)=>s+shopTotal(i),0))}</p>{itemsOf(all,"shopping").map(p=>row(p,p.title,p.quantity+" × "+cash(p.unitCents)+" • "+cash(shopTotal(p))+(p.purchased?" • convertido":""),<div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={p.purchased||locked} checked={p.checked} onChange={e=>act(()=>save({...p,checked:e.target.checked}))}/> Comprado</label>{!p.purchased&&<Button size="sm" variant="outline" disabled={!p.checked||locked} onClick={()=>convert(p)}>Registrar gasto</Button>}</div>))}</Panel>}
    {tab==="maintenance"&&<Panel title="Manutenção e garantias">{form("maintenance",<>{input("title","Equipamento / tarefa","text",editMaintenance?.title??"",{maxLength:120})}{input("date","Data de revisão / garantia","date",editMaintenance?.due??today)}{input("note","Observação","text",editMaintenance?.note??"",{maxLength:240,required:false})}</>)}{itemsOf(all,"maintenance").map(p=>row(p,p.title,p.due+" • "+p.note,<label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={locked} checked={p.done} onChange={e=>act(()=>save({...p,done:e.target.checked}))}/> Concluída</label>,!p.done))}</Panel>}
    {tab==="meter"&&<Panel title="Leituras de energia e água" hint="Registre o valor acumulado no relógio/hidrômetro. Redução ou troca do medidor exige revisão.">{form("meter",<><label className="grid gap-1 text-sm text-muted-foreground">Medidor<select name="meter" className={field}><option value="energy">Energia (kWh)</option><option value="water">Água (m³)</option></select></label>{input("date","Data da leitura","date",today)}{input("reading","Leitura acumulada")}</>)}{itemsOf(all,"meter").map(p=>row(p,p.meter==="energy"?"Energia":"Água",p.date+" • "+p.value))}{(["energy","water"] as const).map(m=><div className="mt-4" key={m}><h3 className="font-semibold">{m==="energy"?"Energia (kWh)":"Água (m³)"}</h3>{meterIntervals(all,m).map(r=><p key={r.to} className="text-sm py-1">{r.from} a {r.to}: {r.consumption===null?"Leitura precisa de revisão":r.consumption.toFixed(3)+" • média/dia "+(r.consumption/r.days).toFixed(2)}</p>)}</div>)}</Panel>}
    {tab==="alerts"&&<Panel title="Central de avisos" hint="Avisos locais calculados no app aberto; ainda não são notificações push."><div className="space-y-2">{overdue.map(c=><Notice key={c.sourceId} tone="warn">{c.title} atrasada desde {c.due}: {cash(c.cents-c.paid)}</Notice>)}{upcoming.map(c=><Notice key={c.sourceId}>{c.title} vence em {c.due}: {cash(c.cents-c.paid)}</Notice>)}{budgets.filter(b=>summary.spending[b.category]>=b.cents*.8).map(b=><Notice key={b.id} tone="warn">{b.category} já utilizou {Math.round(summary.spending[b.category]/b.cents*100)}% do orçamento.</Notice>)}{itemsOf(all,"maintenance").filter(p=>!p.done&&p.due<=today).map(p=><Notice key={p.id} tone="warn">Revisão pendente: {p.title}</Notice>)}<p className="text-xs text-muted-foreground">Confira as contas do mês selecionado. Avisos não substituem o calendário.</p></div></Panel>}
    {tab==="history"&&<ActivityHistory/>}
    {tab==="diagnostic"&&<Panel title="Diagnóstico de conexão"><div className="grid grid-cols-2 gap-3"><Stat label="Versão" value="Finanças v2 (prévia)"/><Stat label="Sincronização" value={sync.phase}/><Stat label="Pendências" value={sync.pending}/><Stat label="Registros financeiros" value={all.length}/></div><p className="mt-3 break-words text-sm text-muted-foreground">{sync.message||"Nenhum erro informado."}</p><div className="flex flex-wrap gap-2 mt-3"><Button onClick={()=>void retryHouseholdSync().catch(()=>setError("Não foi possível reconectar."))}>Tentar sincronizar</Button><Button asChild variant="outline"><Link to="/compartilhar">Compartilhar</Link></Button><Button asChild variant="outline"><Link to="/configuracoes">Backup</Link></Button></div></Panel>}
  </div>;
}
