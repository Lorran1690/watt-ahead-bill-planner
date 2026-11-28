import type { Envelope } from "./connect-crypto";
import type { Pair } from "./connect-api";

/** Realtime events remain subject to RLS; validate routing again on the client. */
export function isPairMessage(value: unknown,pair:Pair):value is Envelope {
 if(!value||typeof value!=="object")return false;
 const r=value as Partial<Envelope>;
 return typeof r.id==="string"&&typeof r.ciphertext==="string"&&typeof r.created_at==="string"&&
 typeof r.has_media==="boolean"&&r.household_id===pair.house&&
 ((r.sender_id===pair.me&&r.recipient_id===pair.peer)||(r.sender_id===pair.peer&&r.recipient_id===pair.me));
}
export function mergeTimeline(current:Envelope[],incoming:Envelope[]):Envelope[]{
 const map=new Map(current.map(row=>[row.id,row]));
 let changed=false;
 for(const row of incoming){
  const previous=map.get(row.id);
  if(previous&&previous.created_at===row.created_at&&previous.ciphertext===row.ciphertext&&previous.has_media===row.has_media&&previous.sender_id===row.sender_id&&previous.recipient_id===row.recipient_id&&previous.household_id===row.household_id)continue;
  map.set(row.id,row);changed=true;
 }
 return changed?[...map.values()].sort((a,b)=>(a.created_at??"").localeCompare(b.created_at??"")||a.id.localeCompare(b.id)):current;
}
export function timelineWithQueue(confirmed:Envelope[],pending:Envelope[]){
 // The server timestamp wins over the provisional device timestamp.
 const ids=new Set(confirmed.map(row=>row.id));
 return mergeTimeline(confirmed,pending.filter(row=>!ids.has(row.id)));
}

/** Keyset cursor preserves rows sharing the same server timestamp. */
export function olderMessageFilter(cursor:Pick<Envelope,"id"|"created_at">){
 const at=cursor.created_at;
 if(!at||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(at)||!Number.isFinite(Date.parse(at))||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id))throw Error("Cursor de mensagens inválido.");
 return "created_at.lt."+at+",and(created_at.eq."+at+",id.lt."+cursor.id+")";
}
