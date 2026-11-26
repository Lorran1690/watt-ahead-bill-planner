import {z} from "zod";

export const chatPayload=z.object({
 text:z.string().max(4000),
 media:z.object({kind:z.enum(["image","audio"]),mime:z.enum(["image/jpeg","audio/webm","audio/ogg","audio/mp4"]),size:z.number().int().positive().max(2097152)}).optional(),
 reply:z.string().uuid().optional(),
 financial:z.object({label:z.string().min(1).max(120),amount:z.number().finite().min(0).max(1000000)}).optional()
}).strict().refine(p=>!!(p.text.trim()||p.media||p.financial));
export type ChatPayload=z.infer<typeof chatPayload>;
export type Envelope={id:string;household_id:string;sender_id:string;recipient_id:string;ciphertext:string;has_media:boolean;created_at?:string};
const enc=new TextEncoder();
const dec=new TextDecoder("utf-8",{fatal:true});
export const toB64=(a:Uint8Array)=>{let s="";for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s)};
export const fromB64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function newPairSecret(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("")}
export function pairScope(h:string,a:string,b:string){return [h,...[a,b].sort()].join(":")}
export async function unlockPair(secret:string,scope:string){
 const hex=secret.trim().toLowerCase();
 if(!/^[0-9a-f]{64}$/.test(hex))throw Error("Use a chave aleatória de 64 caracteres criada pelo Voltara.");
 const bytes=Uint8Array.from(hex.match(/../g)!,p=>parseInt(p,16));
 const material=await crypto.subtle.importKey("raw",bytes,"HKDF",false,["deriveKey"]);
 bytes.fill(0);
 return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:enc.encode(scope),info:enc.encode("Voltara Connect v1")},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function aad(e:Pick<Envelope,"id"|"household_id"|"sender_id"|"recipient_id"|"has_media">,kind:string){
 return enc.encode(JSON.stringify(["voltara-connect-v1",e.household_id,e.sender_id,e.recipient_id,e.id,e.has_media,kind]));
}
export async function sealBytes(key:CryptoKey,e:Envelope,kind:"message"|"media",bytes:Uint8Array<ArrayBuffer>){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(e,kind),tagLength:128},key,bytes));
 const out=new Uint8Array(iv.length+cipher.length);out.set(iv);out.set(cipher,iv.length);return out;
}
export async function openBytes(key:CryptoKey,e:Envelope,kind:"message"|"media",bytes:Uint8Array<ArrayBuffer>){
 if(bytes.length<29)throw Error("Mensagem inválida.");
 return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes.slice(0,12),additionalData:aad(e,kind),tagLength:128},key,bytes.slice(12)));
}
export async function sealMessage(key:CryptoKey,e:Envelope,payload:ChatPayload){
 const p=chatPayload.parse(payload);
 if(!!p.media!==e.has_media)throw Error("Anexo inconsistente.");
 return {...e,ciphertext:toB64(await sealBytes(key,e,"message",enc.encode(JSON.stringify(p))))};
}
export async function openMessage(key:CryptoKey,e:Envelope){
 const p=chatPayload.parse(JSON.parse(dec.decode(await openBytes(key,e,"message",fromB64(e.ciphertext)))));
 if(!!p.media!==e.has_media)throw Error("Anexo inconsistente.");
 return p;
}
export const mediaPath=(e:Envelope)=>[e.household_id,e.sender_id,e.recipient_id,e.id].join("/");
