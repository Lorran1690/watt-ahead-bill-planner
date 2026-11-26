import {describe,expect,it} from "vitest";
import {receiptSuggestions} from "./receipt-parser";
describe("Scanner de comprovantes",()=>{
 it("extrai total brasileiro e data sem enviar a imagem",()=>{
  expect(receiptSuggestions("MERCADO EXEMPLO\n22/11/2026\nSUBTOTAL 20,00\nTOTAL A PAGAR R$ 1.234,50\nTROCO 10,00")).toMatchObject({amount:"1234,50",date:"2026-11-22",merchant:"MERCADO EXEMPLO"});
 });
 it("não adivinha o total nem a data quando existem opções conflitantes",()=>{
  const r=receiptSuggestions("TOTAL 12,90\nVALOR TOTAL 15,00\n02/11/2026\n05/11/2026");
  expect(r.amount).toBe("");expect(r.date).toBe("");expect(r.candidates).toEqual(["12,90","15,00"]);
 });
 it("não preenche uma data impossível",()=>expect(receiptSuggestions("TOTAL 10,00\n31/02/2026").date).toBe(""));
});