import { z } from "zod";
import type { DailyExpense } from "./types";

export const categories = ["Alimentação","Moradia","Transporte","Energia","Água","Saúde","Lazer","Educação","Outros"] as const;
const category = z.enum(categories);
const id = z.string().min(1).max(80);
const title = z.string().trim().min(1).max(120);
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export function validDate(value: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
const date = z.string().refine(validDate);
const cents = z.number().int().min(1).max(100_000_000);
const day = z.number().int().min(1).max(31);
const reading = z.number().finite().min(0).max(1_000_000_000);
const base = { id };
export const financeSchema = z.discriminatedUnion("type", [
  z.object({...base,type:z.literal("income"),title,date,cents}),
  z.object({...base,type:z.literal("budget"),month,category,cents}),
  z.object({...base,type:z.literal("payable"),title,due:date,cents,category,recurring:z.boolean()}),
  z.object({...base,type:z.literal("card"),title,limit:cents,closing:day,dueDay:day}),
  z.object({...base,type:z.literal("purchase"),title,cardId:id,firstMonth:month,cents,installments:z.number().int().min(1).max(48),category}),
  z.object({...base,type:z.literal("settlement"),sourceId:id,month,date,cents,category}),
  z.object({...base,type:z.literal("expense-category"),expenseId:id,category}),
  z.object({...base,type:z.literal("shopping"),title,quantity:z.number().finite().positive().max(10000),unitCents:cents,checked:z.boolean(),purchased:z.boolean()}),
  z.object({...base,type:z.literal("maintenance"),title,due:date,note:z.string().max(240),done:z.boolean()}),
  z.object({...base,type:z.literal("meter"),meter:z.enum(["energy","water"]),date,value:reading}),
]);
export type FinanceItem = z.infer<typeof financeSchema>;
export type Category = typeof categories[number];
type Item<T extends FinanceItem["type"]> = Extract<FinanceItem,{type:T}>;
export const itemsOf = <T extends FinanceItem["type"]>(items: FinanceItem[],type:T): Item<T>[] => items.filter((item): item is Item<T> => item.type===type);
export function normalizeFinance(raw:unknown):FinanceItem[] {
  if (raw===undefined) return [];
  const result=z.array(financeSchema).max(5000).parse(raw);
  if(new Set(result.map(r=>r.id)).size!==result.length) throw new Error("Registros financeiros duplicados.");
  return result;
}
export function parseCents(raw:string):number|null {
  const value=raw.trim();
  if(!/^\d{1,7}([,.]\d{1,2})?$/.test(value)) return null;
  const result=Math.round(Number(value.replace(",","."))*100);
  return result>0&&result<=100_000_000 ? result:null;
}
export function shiftMonth(month:string,delta:number) {
  const [year,m]=month.split("-").map(Number);
  const d=new Date(Date.UTC(year!,m!-1+delta,1));
  return d.toISOString().slice(0,7);
}
export function dueInMonth(month:string,day:number) {
  const [y,m]=month.split("-").map(Number);
  const max=new Date(Date.UTC(y!,m!,0)).getUTCDate();
  return month+"-"+String(Math.min(day,max)).padStart(2,"0");
}
export function installmentCents(p:Item<"purchase">,month:string) {
  for(let i=0;i<p.installments;i++) if(shiftMonth(p.firstMonth,i)===month) {
    const base=Math.floor(p.cents/p.installments);
    return base+(i<p.cents%p.installments?1:0);
  }
  return 0;
}
export type Commitment={sourceId:string; title:string; month:string; due:string; cents:number; category:Category; paid:number; paymentId:string};
export function commitments(items:FinanceItem[],month:string):Commitment[] {
  const settlements=itemsOf(items,"settlement");
  const rows: Omit<Commitment,"paid"|"paymentId">[]=[];
  for(const item of itemsOf(items,"payable")) {
    if(item.due.slice(0,7)===month || (item.recurring && item.due.slice(0,7)<month)) rows.push({
      sourceId:item.id,title:item.title,month,due:dueInMonth(month,Number(item.due.slice(-2))),cents:item.cents,category:item.category
    });
  }
  for(const card of itemsOf(items,"card")) {
    const total=itemsOf(items,"purchase").filter(p=>p.cardId===card.id).reduce((sum,p)=>sum+installmentCents(p,month),0);
    if(total) rows.push({sourceId:card.id,title:"Fatura • "+card.title,month,due:dueInMonth(month,card.dueDay),cents:total,category:"Outros"});
  }
  return rows.map(row=>{
    const paymentId="pay:"+row.sourceId+":"+month;
    const paid=settlements.filter(s=>s.sourceId===row.sourceId&&s.month===month).reduce((sum,s)=>sum+s.cents,0);
    return {...row,paid,paymentId};
  }).sort((a,b)=>a.due.localeCompare(b.due));
}
export function summarize(items:FinanceItem[],expenses:DailyExpense[],month:string) {
  const income=itemsOf(items,"income").filter(i=>i.date.startsWith(month)).reduce((s,i)=>s+i.cents,0);
  const daily=expenses.filter(e=>e.date.startsWith(month));
  const dailyTotal=daily.reduce((s,e)=>s+Math.round(e.amount*100),0);
  const paid=itemsOf(items,"settlement").filter(p=>p.date.startsWith(month)).reduce((s,p)=>s+p.cents,0);
  const scheduled=commitments(items,month);
  const remaining=scheduled.reduce((s,c)=>s+Math.max(0,c.cents-c.paid),0);
  const spending=Object.fromEntries(categories.map(c=>[c,0])) as Record<Category,number>;
  const map=new Map(itemsOf(items,"expense-category").map(e=>[e.expenseId,e.category]));
  for(const expense of daily) spending[map.get(expense.id)??"Outros"]+=Math.round(expense.amount*100);
  for(const row of scheduled) if(!itemsOf(items,"card").some(c=>c.id===row.sourceId)) spending[row.category]+=row.cents;
  for(const purchase of itemsOf(items,"purchase")) spending[purchase.category]+=installmentCents(purchase,month);
  return {income,dailyTotal,paid,remaining,balance:income-dailyTotal-paid,projected:income-dailyTotal-paid-remaining,spending,scheduled};
}
export function meterIntervals(items:FinanceItem[],meter:"energy"|"water") {
  const readings=itemsOf(items,"meter").filter(r=>r.meter===meter).sort((a,b)=>a.date.localeCompare(b.date));
  return readings.slice(1).map((r,i)=>{
    const previous=readings[i]!;
    const days=(Date.parse(r.date)-Date.parse(previous.date))/86400000;
    const delta=r.value-previous.value;
    return {from:previous.date,to:r.date,days,consumption:days>0&&delta>=0?delta:null};
  });
}
export function shopTotal(item:Item<"shopping">) { return Math.round(item.quantity*item.unitCents); }
