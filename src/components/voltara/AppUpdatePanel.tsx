import {useState} from "react";
import {RefreshCw,Download} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Panel,Notice} from "@/components/voltara/ui";
import {installedRelease,checkAppUpdate,reloadApp} from "@/lib/voltara/app-update";
export function AppUpdatePanel(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [available,setAvailable]=useState(false);
 async function check(){
  if(busy)return;setBusy(true);setMessage("");
  try{const r=await checkAppUpdate();setAvailable(r.available);setMessage(r.available?"Nova revisão disponível: "+r.latest.version+". "+r.latest.description:"Você está usando a versão publicada mais recente.");}
  catch(e){setMessage(e instanceof Error?e.message:"Falha na consulta.");}
  finally{setBusy(false);}
 }
 async function apply(){
  if(busy)return;setBusy(true);
  try{await reloadApp();}
  catch(e){setMessage(e instanceof Error?e.message:"Falha ao atualizar.");setBusy(false);}
 }
 return <Panel title="Atualização do Voltara" hint="Consulte e carregue a versão publicada sem acessar o editor.">
  <p className="text-sm">Versão instalada: <strong>{installedRelease.version}</strong></p>
  <p className="text-xs text-muted-foreground break-all">Revisão: {installedRelease.revision}</p>
  <div className="mt-3 flex flex-wrap gap-2">
   <Button disabled={busy} onClick={()=>void check()}><RefreshCw className={"mr-2 size-4 "+(busy?"animate-spin":"")}/>Verificar atualizações</Button>
   <Button disabled={busy} variant={available?"default":"outline"} onClick={()=>void apply()}><Download className="mr-2 size-4"/>{available?"Instalar atualização":"Atualizar aplicativo"}</Button>
  </div>
  {message&&<p role="status" className="mt-3 text-sm break-words">{message}</p>}
  <div className="mt-3"><Notice>Seus dados e sua sessão são preservados. A conversa criptografada pode precisar ser desbloqueada novamente. Atualiza a interface já publicada, não publica código do GitHub nem substitui o EXE nativo.</Notice></div>
 </Panel>
}
