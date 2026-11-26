import {describe,it,expect} from "vitest";
import {isPairMessage,mergeTimeline,timelineWithQueue} from "./connect-timeline";
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
