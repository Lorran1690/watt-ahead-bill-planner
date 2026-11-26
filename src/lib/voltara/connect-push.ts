import {getCloudClient} from "./cloud-client";
import type {Pair} from "./connect-api";
const publicKey=import.meta.env.VITE_VOLTARA_VAPID_PUBLIC_KEY as string|undefined;
export const pushConfigured=!!publicKey;
const invoke=async(body:object)=>{
 const c=getCloudClient();if(!c)throw Error("Nuvem indisponível.");
 const r=await c.functions.invoke("voltara-connect-push",{body});if(r.error||r.data?.ok!==true)throw Error("Push ainda não está disponível neste aparelho.");
};
export async function subscribeConnectPush(pair:Pair){
 if(!publicKey||!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))throw Error("Push não configurado ou incompatível.");
 if(await Notification.requestPermission()!=="granted")throw Error("Permissão de notificação não concedida.");
 const registration=await navigator.serviceWorker.ready;
 const normalized=publicKey.replace(/-/g,"+").replace(/_/g,"/");
 const key=Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,"=")),c=>c.charCodeAt(0));
 let sub=await registration.pushManager.getSubscription();
 if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await invoke({action:"register",house:pair.house,subscription:sub.toJSON()});
}
export async function unsubscribeConnectPush(pair:Pair){
 if(!("serviceWorker" in navigator))return;
 const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription();
 if(!sub)return;
 try{await invoke({action:"unregister",house:pair.house,endpoint:sub.endpoint});}
 finally{await sub.unsubscribe();}
}
export async function notifyConnectPush(pair:Pair,messageId:string){
 if(!pushConfigured)return;
 try{await invoke({action:"notify",house:pair.house,messageId});}catch{/* notification is best effort, never fail message delivery */}
}
export async function clearConnectPushOnSignOut(){
 if(!("serviceWorker" in navigator))return;
 const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription();
 await sub?.unsubscribe();
}
