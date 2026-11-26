import { describe, expect, it } from "vitest";
import { defaultState } from "./defaults";
import { diffSharedRecords, fromSharedRecords, overlayRecordChanges, toSharedRecords, type RecordChange } from "./cloud-records";
import { journalKey, mergeJournal, readJournal, saveJournal } from "./sync-journal";
import { expensesCsv, waterHistoryCsv } from "./export";
import { billError, forecastMonth } from "./calc";

describe("regressões da auditoria", () => {
  it("ignora ordem de propriedades do JSONB", () => {
    const rows = toSharedRecords(defaultState());
    const reordered = rows.map(r => ({ ...r, document: Object.fromEntries(Object.entries(r.document).reverse()) }));
    expect(diffSharedRecords(rows, reordered)).toEqual([]);
  });
  it("reaplica apenas edições pendentes sem apagar o novo gasto de outro aparelho", () => {
    const state = defaultState();
    state.expenses.push({id:"local",date:"2026-11-26",note:"Local",amount:11});
    const pending = diffSharedRecords(toSharedRecords(defaultState()), toSharedRecords(state));
    const remote = defaultState();
    remote.expenses.push({id:"remote",date:"2026-11-26",note:"Remoto",amount:22});
    const merged = fromSharedRecords(overlayRecordChanges(toSharedRecords(remote),pending));
    expect(merged.expenses.map(e => e.id).sort()).toEqual(["local","remote"]);
  });
  it("mantém a intenção mais recente para o mesmo registro", () => {
    const first: RecordChange = {operation:"upsert",kind:"expense",record_key:"a",document:{amount:10}};
    const second: RecordChange = {operation:"delete",kind:"expense",record_key:"a"};
    expect(mergeJournal([first],[second])).toEqual([second]);
  });
  it("persiste fila, separa contas e recusa fila inválida", () => {
    const values = new Map<string,string>();
    const kv = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}};
    const key=journalKey("a","house"), other=journalKey("b","house");
    const change: RecordChange={operation:"delete",kind:"expense",record_key:"one"};
    saveJournal(kv,key,[change]);
    expect(readJournal(kv,key)).toEqual([change]);
    expect(readJournal(kv,other)).toEqual([]);
    saveJournal(kv,key,[]);
    expect(readJournal(kv,key)).toEqual([]);
    kv.setItem(key,'[{"kind":"unknown"}]');
    expect(()=>readJournal(kv,key)).toThrow();
  });
  it("neutraliza fórmulas em anotações exportadas para planilhas", () => {
    const state=defaultState();
    state.expenses.push({id:"x",date:"2026-11-26",note:"=HYPERLINK(\"https://example.org\")",amount:12});
    state.waterBills.push({id:"w",month:"2026-11",value:15,note:"+1+1"});
    expect(expensesCsv(state)).toContain("'=HYPERLINK");
    expect(waterHistoryCsv(state)).toContain("'+1+1");
  });
  it("não usa referência futura para estimar uma fatura histórica", () => {
    const state=defaultState();
    state.settings.referenceMonth="2026-11";
    state.settings.referenceValue=9999;
    const bill={id:"past",month:"2026-10",value:200};
    expect(billError(state,bill).predicted).toBeCloseTo(forecastMonth(state,bill.month,{residualPerDay:0}).cost);
  });
});
