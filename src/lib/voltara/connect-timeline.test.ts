import {describe,it,expect} from "vitest";
import {isPairMessage,mergeTimeline,timelineWithQueue,olderMessageFilter} from "./connect-timeline";
import type {Envelope} from "./connect-crypto";
const pair={house:"house",me:"me",peer:"peer",scope:"scope"};
const base:Envelope={id:"a",household_id:"house",sender_id:"me",recipient_id:"peer",ciphertext:"ciphertext",has_media:false,created_at:"2026-11-26T12:00:00Z"};
describe("Connect timeline",()=>{
 it("shows queued messages immediately, then reconciles server timestamp without duplicates",()=>{
  const confirmed={...base,created_at:"2026-11-26T12:00:01Z"};
  expect(timelineWithQueue([], [base])).toEqual([base]);
  expect(timelineWithQueue([confirmed],[base])).toEqual([confirmed]);
 });
 it("does not trigger rerenders on duplicate realtime or polling events",()=>{
  const rows=[base];expect(mergeTimeline(rows,[{...base}])).toBe(rows);
 });
 it("accepts only the exact current pair",()=>{
  expect(isPairMessage(base,pair)).toBe(true);
  expect(isPairMessage({...base,sender_id:"peer",recipient_id:"me"},pair)).toBe(true);
  expect(isPairMessage({...base,recipient_id:"other"},pair)).toBe(false);
  expect(isPairMessage({...base,household_id:"other"},pair)).toBe(false);
  expect(isPairMessage(null,pair)).toBe(false);
 });
 it("sorts by time and stable id",()=>{
  expect(mergeTimeline([base],[{...base,id:"b",created_at:"2026-11-26T11:00:00Z"}]).map(r=>r.id)).toEqual(["b","a"]);
 });
});

describe("Paginação Connect",()=>{
 it("preserva mensagens com o mesmo timestamp através do ID",()=>{
  const id="aabbccdd-0000-4000-8000-001122334455";
  const at="2026-11-26T12:00:00.123456+00:00";
  expect(olderMessageFilter({id,created_at:at})).toBe("created_at.lt."+at+",and(created_at.eq."+at+",id.lt."+id+")");
 });
 it("rejeita operadores e cursores adulterados",()=>{
  expect(()=>olderMessageFilter({id:"x,or()",created_at:"2026-11-26T12:00:00Z"})).toThrow();
  expect(()=>olderMessageFilter({id:"aabbccdd-0000-4000-8000-001122334455",created_at:"invalid"})).toThrow();
 });
});

it("ordena timestamps equivalentes em formatos distintos e preserva microssegundos",()=>{
 const rows=[{...base,id:"a",created_at:"2026-11-26T12:00:00.000002+00:00"},{...base,id:"z",created_at:"2026-11-26T12:00:00.000001Z"},{...base,id:"m",created_at:"2026-11-26T09:00:00-03:00"}];
 expect(mergeTimeline([],rows).map(r=>r.id)).toEqual(["m","z","a"]);
});
