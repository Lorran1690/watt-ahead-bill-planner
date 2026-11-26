import {getCloudClient} from "./cloud-client";
import type {Pair} from "./connect-api";

type PushConfig={publicKey:string};
const configs=new Map<string,PushConfig>();
const invoke=async(body:object)=>{
 const c=getCloudClient();if(!c)throw Error("Nuvem indisponível.");
 const r=await c.functions.invoke("voltara-connect-push",{body});
 if(r.error||r.data?.ok!==true)throw Error("Servidor de notificações indisponível.");
 return r.data;
};
export function supportsConnectPush(){
 return typeof window!=="undefined"&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
}
export async function getConnectPushConfig(pair:Pair){
 const data=await invoke({action:"config",house:pair.house});
 if(typeof data.publicKey!=="string"||!/^[A-Za-z0-9_-]{87}$/.test(data.publicKey))throw Error("Chave pública de push inválida.");
 const config={publicKey:data.publicKey};
 configs.set(pair.scope,config);return config;
}
async function workerReady(){
 const registration=await navigator.serviceWorker.getRegistration();
 if(!registration)throw Error("O serviço de notificações ainda não está instalado. Reabra o Voltara.");
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("O serviço de notificações não iniciou.")),10000)})]);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
export async function getConnectPushStatus(pair:Pair){
 if(!supportsConnectPush())return "unsupported" as const;
 if(Notification.permission==="denied")return "blocked" as const;
 if(Notification.permission!=="granted")return "inactive" as const;
 const reg=await navigator.serviceWorker.getRegistration();
 const sub=await reg?.pushManager.getSubscription();
 if(!sub)return "inactive" as const;
 const result=await invoke({action:"status",house:pair.house,endpoint:sub.endpoint});
 return result.registered===true?"active" as const:"inactive" as const;
}
export async function subscribeConnectPush(pair:Pair,config:PushConfig){
 if(!supportsConnectPush())throw Error("Push não disponível neste aparelho.");
 // Permission is requested directly from the user's click, not an effect.
 if(await Notification.requestPermission()!=="granted")throw Error("Permissão de notificação não concedida.");
 const registration=await workerReady();
 const normalized=config.publicKey.replace(/-/g,"+").replace(/_/g,"/");
 const key=Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,"=")),c=>c.charCodeAt(0));
 let sub=await registration.pushManager.getSubscription();
 if(sub){
  const existing=sub.options.applicationServerKey;
  if(existing){const bytes=new Uint8Array(existing);if(bytes.length!==key.length||bytes.some((v,i)=>v!==key[i])){await sub.unsubscribe();sub=null;}}
 }
 const created=!sub;
 if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 try{await invoke({action:"register",house:pair.house,subscription:sub.toJSON()});}
 catch(error){if(created)await sub.unsubscribe().catch(()=>{});throw error;}
}
export async function unsubscribeConnectPush(pair:Pair){
 if(!("serviceWorker" in navigator))return;
 const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription();
 if(!sub)return;
 try{await invoke({action:"unregister",house:pair.house,endpoint:sub.endpoint});}
 finally{await sub.unsubscribe();}
}
export async function notifyConnectPush(pair:Pair,messageId:string){
 // Do not block or change the acknowledgement of a chat message.
 try{if(!configs.has(pair.scope))await getConnectPushConfig(pair);await invoke({action:"notify",house:pair.house,messageId});}
 catch{/* best-effort client dispatch; durable server dispatch is a release requirement */}
}
export async function clearConnectPushOnSignOut(){
 configs.clear();
 if(!("serviceWorker" in navigator))return;
 const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription();
 await sub?.unsubscribe();
}
