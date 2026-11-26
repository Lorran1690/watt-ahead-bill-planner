import {describe,it,expect} from "vitest";
import {newPairSecret,pairScope,unlockPair,sealMessage,openMessage,sealBytes,openBytes,type Envelope} from "./connect-crypto";
const e:Envelope={id:"d9527f32-695b-4d13-bf76-e06a53d88883",household_id:"h",sender_id:"a",recipient_id:"b",has_media:false,ciphertext:""};
describe("Connect crypto",()=>{
 it("both endpoints decrypt, server payload contains no plaintext",async()=>{
  const secret=newPairSecret(),a=await unlockPair(secret,pairScope("h","a","b")),b=await unlockPair(secret,pairScope("h","b","a"));
  const row=await sealMessage(a,e,{text:"texto privado"});
  expect(row.ciphertext).not.toContain("texto privado");expect((await openMessage(b,row)).text).toBe("texto privado");
  expect(a.extractable).toBe(false);
 });
 it("rejects wrong key, forged sender, other conversation, modified ciphertext",async()=>{
  const k=await unlockPair(newPairSecret(),pairScope("h","a","b"));
  const row=await sealMessage(k,e,{text:"secret"});
  const wrong=await unlockPair(newPairSecret(),pairScope("h","a","b"));
  await expect(openMessage(wrong,row)).rejects.toThrow();
  await expect(openMessage(k,{...row,sender_id:"c"})).rejects.toThrow();
  await expect(openMessage(k,{...row,household_id:"other"})).rejects.toThrow();
  await expect(openMessage(k,{...row,ciphertext:(row.ciphertext[0]==="A"?"B":"A")+row.ciphertext.slice(1)})).rejects.toThrow();
 });
 it("different IV per message, attachment binding and domain separation",async()=>{
  const k=await unlockPair(newPairSecret(),"scope"),bytes=new TextEncoder().encode("photo");
  const a=await sealBytes(k,e,"media",bytes),b=await sealBytes(k,e,"media",bytes);
  expect(Array.from(a)).not.toEqual(Array.from(b));expect(Array.from(await openBytes(k,e,"media",a))).toEqual(Array.from(bytes));
  await expect(openBytes(k,e,"message",a)).rejects.toThrow();
  await expect(openBytes(k,{...e,id:"other"},"media",a)).rejects.toThrow();
 });
 it("rejects weak pairing secret",async()=>{await expect(unlockPair("123456","scope")).rejects.toThrow()});
});