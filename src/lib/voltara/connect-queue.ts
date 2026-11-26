import Dexie,{type Table} from "dexie";
import type {Envelope} from "./connect-crypto";
export type Queued={id:string;scope:string;envelope:Envelope;media?:Blob;queuedAt:number};
let vault:(Dexie&{outbox:Table<Queued,string>})|undefined;
function db(){
 if(!vault){
  vault=new Dexie("voltara-connect-encrypted-v1") as Dexie&{outbox:Table<Queued,string>};
  vault.version(1).stores({outbox:"id,scope,queuedAt"});
 }
 return vault;
}
// Only ciphertext, encrypted blob and routing metadata. Never keys or plaintext.
export async function enqueue(row:Queued){
 const v=db();await v.transaction("rw",v.outbox,async()=>{
  if(await v.outbox.where("scope").equals(row.scope).count()>=50)throw Error("Fila cheia (50 mensagens). Reconecte antes de continuar.");
  await v.outbox.add(row);
 });
}
export async function queued(scope:string){return (await db().outbox.where("scope").equals(scope).toArray()).sort((a,b)=>a.queuedAt-b.queuedAt)}
export async function acknowledge(id:string){await db().outbox.delete(id)}
