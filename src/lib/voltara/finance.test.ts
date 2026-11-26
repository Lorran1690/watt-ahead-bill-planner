import {describe,it,expect} from "vitest";
import {defaultState} from "./defaults";
import {normalizeState} from "./storage";
import {toSharedRecords,fromSharedRecords,diffSharedRecords} from "./cloud-records";
import {parseCents,installmentCents,summarize,commitments,meterIntervals,normalizeFinance,type FinanceItem} from "./finance";

const data:FinanceItem[]=[
{id:"i",type:"income",title:"Salário",date:"2026-11-01",cents:300000},
{id:"b",type:"budget",month:"2026-11",category:"Alimentação",cents:30000},
{id:"r",type:"payable",title:"Aluguel",due:"2026-10-31",cents:100000,category:"Moradia",recurring:true},
{id:"c",type:"card",title:"Cartão",limit:300000,closing:1,dueDay:10},
{id:"p",type:"purchase",title:"Compra",cardId:"c",firstMonth:"2026-11",cents:10001,installments:3,category:"Lazer"},
{id:"cat-d",type:"expense-category",expenseId:"d",category:"Alimentação"},
];
const expenses=[{id:"d",date:"2026-11-05",note:"Mercado",amount:50}];
describe("Finanças v2",()=>{
 it("valida dinheiro em centavos",()=>{expect(parseCents("12,34")).toBe(1234);expect(parseCents("0")).toBeNull();expect(parseCents("1.234")).toBeNull();expect(parseCents("Infinity")).toBeNull()});
 it("divide parcelas sem perder centavos",()=>{const p=data.find(i=>i.type==="purchase")!;expect([0,1,2].map((_,i)=>installmentCents(p as Extract<FinanceItem,{type:"purchase"}>,["2026-11","2026-12","2027-01"][i]!))).toEqual([3334,3334,3333])});
 it("distingue saldo realizado e projetado sem duplicar fatura",()=>{
   const before=summarize(data,expenses,"2026-11");
   expect(before.balance).toBe(295000);expect(before.remaining).toBe(103334);
   const paid:FinanceItem={id:"pay:c:2026-11",type:"settlement",sourceId:"c",month:"2026-11",date:"2026-11-10",cents:3334,category:"Outros"};
   const after=summarize([...data,paid],expenses,"2026-11");
   expect(after.balance).toBe(291666);expect(after.remaining).toBe(100000);expect(after.projected).toBe(before.projected);expect(after.spending.Lazer).toBe(3334);expect(after.spending.Alimentação).toBe(5000);
 });
 it("ajusta vencimento recorrente no mês curto",()=>expect(commitments(data,"2027-02").find(x=>x.sourceId==="r")?.due).toBe("2027-02-28"));
 it("preserva backup antigo e roundtrip da nuvem",()=>{
  const old=defaultState();expect(normalizeState(old)).toEqual(old);
  const state={...old,finance:data};
  expect(fromSharedRecords(toSharedRecords(state))).toEqual(state);
  expect(diffSharedRecords(toSharedRecords(old),toSharedRecords(state)).every(x=>x.kind==="finance")).toBe(true);
 });
 it("recusa duplicados e registros inválidos",()=>{expect(()=>normalizeFinance([...data,data[0]])).toThrow();expect(()=>normalizeFinance([{...data[0],date:"2026-02-31"}])).toThrow();expect(()=>normalizeFinance([{...data[0],cents:-1}])).toThrow()});
 it("calcula consumo e sinaliza troca do medidor",()=>{
 const items:FinanceItem[]=[{id:"m1",type:"meter",meter:"energy",date:"2026-11-01",value:100},{id:"m2",type:"meter",meter:"energy",date:"2026-11-03",value:110},{id:"m3",type:"meter",meter:"energy",date:"2026-11-04",value:2}];
 expect(meterIntervals(items,"energy").map(x=>x.consumption)).toEqual([10,null]);
 });
});