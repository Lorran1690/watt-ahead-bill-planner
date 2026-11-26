import {getCloudClient} from "./cloud-client";
import {sealBytes,openBytes,sealMessage,mediaPath,type Envelope,type ChatPayload} from "./connect-crypto";
import {enqueue,queued,acknowledge,type Queued} from "./connect-queue";

export const bucketName="voltara-connect-private";
export type Pair={house:string;me:string;peer:string;scope:string};
const client=()=>{const c=getCloudClient();if(!c)throw Error("Nuvem indisponível.");return c;};
export async function loadPair(house:string):Promise<Pair|null>{
 const c=client();
 const {data:{user},error}=await c.auth.getUser();
 if(error||!user)throw Error("Entre novamente no Voltara.");
 const result=await c.rpc("voltara_chat_peer",{h:house});
 if(result.error)throw Error("Conversa ainda não disponível.");
 if(typeof result.data!=="string"||result.data===user.id)return null;
 return {house,me:user.id,peer:result.data,scope:[house,...[user.id,result.data].sort()].join(":")+":"+user.id};
}
export async function listMessages(pair:Pair,before?:string){
 const c=client();let query=c.from("voltara_chat_messages").select("*").eq("household_id",pair.house)
  .or("and(sender_id.eq."+pair.me+",recipient_id.eq."+pair.peer+"),and(sender_id.eq."+pair.peer+",recipient_id.eq."+pair.me+")")
  .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(50);
 if(before)query=query.lt("created_at",before);
 const r=await query;if(r.error)throw r.error;return (r.data??[]) as Envelope[];
}
export async function listReceipts(pair:Pair,ids:string[]){
 if(!ids.length)return new Set<string>();
 const r=await client().from("voltara_chat_receipts").select("message_id").eq("household_id",pair.house).in("message_id",ids);
 if(r.error)throw r.error;return new Set<string>((r.data??[]).map(r=>r.message_id));
}
export async function markRead(pair:Pair,rows:Envelope[]){
 const incoming=rows.filter(e=>e.recipient_id===pair.me);
 if(!incoming.length)return;
 const r=await client().from("voltara_chat_receipts").upsert(incoming.map(e=>({message_id:e.id,household_id:pair.house,reader_id:pair.me})),{onConflict:"message_id",ignoreDuplicates:true});
 if(r.error)throw r.error;
}
export async function typing(pair:Pair){
 const r=await client().from("voltara_chat_typing").upsert({household_id:pair.house,user_id:pair.me,peer_id:pair.peer},{onConflict:"household_id,user_id,peer_id"});
 if(r.error)throw r.error;
}
export async function peerTyping(pair:Pair){
 const r=await client().from("voltara_chat_typing").select("touched_at").eq("household_id",pair.house).eq("user_id",pair.peer).eq("peer_id",pair.me).maybeSingle();
 if(r.error)throw r.error;const age=r.data?Date.now()-Date.parse(r.data.touched_at):Infinity;return age>=-2000&&age<6500;
}
export async function queueMessage(pair:Pair,key:CryptoKey,payload:ChatPayload,blob?:Blob){
 if(!!blob!==!!payload.media)throw Error("Anexo inconsistente.");
 if(blob&&(blob.size!==payload.media!.size||blob.size>2097152))throw Error("Anexo grande demais.");
 const base:Envelope={id:crypto.randomUUID(),household_id:pair.house,sender_id:pair.me,recipient_id:pair.peer,ciphertext:"",has_media:!!blob};
 const envelope=await sealMessage(key,base,payload);
 const media=blob?new Blob([await sealBytes(key,base,"media",new Uint8Array(await blob.arrayBuffer()))],{type:"application/octet-stream"}):undefined;
 await enqueue({id:base.id,scope:pair.scope,envelope,media,queuedAt:Date.now()});return base.id;
}
export async function flushMessages(pair:Pair,active:()=>boolean){
 const c=client();
 // Must confirm membership before sending queued items, including after account changes.
 const current=await loadPair(pair.house);
 if(!current||current.scope!==pair.scope||!active())throw Error("Vínculo da conversa alterado.");
 for(const q of await queued(pair.scope)){
  if(!active())return;
  const e=q.envelope;
  if(e.household_id!==pair.house||e.sender_id!==pair.me||e.recipient_id!==pair.peer||e.id!==q.id)throw Error("Fila inconsistente.");
  if(q.media){
   const storage=c.storage.from(bucketName);
   const upload=await storage.upload(mediaPath(e),q.media,{contentType:"application/octet-stream",upsert:false});
   if(upload.error){
    // Idempotent retry, only if existing immutable ciphertext matches exactly.
    const existing=await storage.download(mediaPath(e));
    if(existing.error||!existing.data)throw upload.error;
    const a=new Uint8Array(await existing.data.arrayBuffer()),b=new Uint8Array(await q.media.arrayBuffer());
    if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error("Anexo conflitante.");
   }
  }
  if(!active())return;
  const result=await c.from("voltara_chat_messages").upsert(e,{onConflict:"id",ignoreDuplicates:true});
  if(result.error)throw result.error;
  const confirmed=await c.from("voltara_chat_messages").select("ciphertext,has_media,sender_id,recipient_id").eq("id",e.id).single();
  if(confirmed.error||confirmed.data.ciphertext!==e.ciphertext||confirmed.data.has_media!==e.has_media||confirmed.data.sender_id!==pair.me||confirmed.data.recipient_id!==pair.peer)throw Error("Confirmação da mensagem não corresponde.");
  await acknowledge(q.id);
 }
}
export async function readMedia(key:CryptoKey,e:Envelope,p:ChatPayload){
 if(!p.media)throw Error("Mensagem sem anexo.");
 const r=await client().storage.from(bucketName).download(mediaPath(e));
 if(r.error||!r.data)throw Error("Anexo indisponível.");
 if(r.data.size!==p.media.size+28)throw Error("Tamanho do anexo inválido.");
 const bytes=await openBytes(key,e,"media",new Uint8Array(await r.data.arrayBuffer()));
 if(bytes.length!==p.media.size)throw Error("Anexo inválido.");
 if(p.media.kind==="image"&&(bytes[0]!==255||bytes[1]!==216||p.media.mime!=="image/jpeg"))throw Error("Imagem inválida.");
 return new Blob([bytes],{type:p.media.mime});
}
export async function compressPhoto(file:File){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>12*1024*1024)throw Error("Selecione JPEG, PNG ou WebP de até 12 MB.");
 const image=await createImageBitmap(file);
 try{
  const canvas=document.createElement("canvas");const scale=Math.min(1,1600/Math.max(image.width,image.height));
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Câmera indisponível.");
  ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.78));
  if(!blob||blob.size>2097152)throw Error("Foto muito grande. Escolha outra imagem.");
  return blob;
 }finally{image.close();}
}
