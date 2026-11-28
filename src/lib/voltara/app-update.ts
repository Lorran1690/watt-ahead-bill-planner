import release from "./release.json";
import {getCloudStatus} from "./cloud-sync";
import {localPersistenceFailed} from "./store";
export const installedRelease=release;
export function parseRelease(raw:unknown){
 if(!raw||typeof raw!=="object")throw Error("Informação de versão inválida.");
 const r=raw as Record<string,unknown>;
 if(typeof r.version!=="string"||!/^\d+\.\d+\.\d+$/.test(r.version)||typeof r.revision!=="string"||!/^[a-zA-Z0-9._-]{1,100}$/.test(r.revision))throw Error("Informação de versão inválida.");
 return {version:r.version,revision:r.revision,description:typeof r.description==="string"?r.description.slice(0,240):""};
}
export async function checkAppUpdate(){
 const url=new URL("/voltara-version.json",window.location.origin);
 url.searchParams.set("check",String(Date.now()));
 const response=await fetch(url,{cache:"no-store",credentials:"same-origin",redirect:"error",signal:AbortSignal.timeout(12000)});
 if(!response.ok||!response.headers.get("content-type")?.includes("json"))throw Error("Não foi possível consultar a versão publicada.");
 const latest=parseRelease(await response.json());
 return {latest,available:latest.revision!==installedRelease.revision};
}
export async function reloadApp(){
 if(localPersistenceFailed())throw Error("O armazenamento local falhou. Exporte um backup antes de atualizar.");
 const sync=getCloudStatus();
 if(sync.pending>0||sync.phase==="connecting")throw Error("Há alterações financeiras pendentes. Sincronize antes de atualizar.");
 if(!navigator.onLine)throw Error("Conecte-se à internet antes de atualizar.");
 const registration="serviceWorker" in navigator?await navigator.serviceWorker.getRegistration():undefined;
 if(registration)await registration.update();
 // Recheck after awaiting worker update. Never clear storage, keys, cookies, cache or IndexedDB.
 if(localPersistenceFailed())throw Error("O armazenamento local falhou. Exporte um backup antes de atualizar.");
 const after=getCloudStatus();
 if(after.pending>0||after.phase==="connecting")throw Error("Aguarde a sincronização dos dados.");
 const url=new URL(window.location.href);
 url.searchParams.set("voltara-update",String(Date.now()));
 window.location.replace(url.href);
}
