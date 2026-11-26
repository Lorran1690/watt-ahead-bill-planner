import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Notice,Panel} from "@/components/voltara/ui";
import {getVoltaraSnapshot} from "@/lib/voltara/store";
import {getCloudStatus} from "@/lib/voltara/cloud-sync";
import {getCloudClient} from "@/lib/voltara/cloud-client";
import {saveCheckpoint,readCheckpoint,deleteCheckpoint} from "@/lib/voltara/offline-vault";
async function scope(){
 const status=getCloudStatus();
 if(status.phase==="local"){
  if(window.localStorage.getItem("voltara:shared-cache:v1")==="yes")throw Error("Aguarde a restauração da sessão compartilhada.");
  return "local";
 }
 const client=getCloudClient();
 if(!client||!status.householdId||status.phase!=="online")throw Error("Conecte a casa para criar ou acessar uma cópia compartilhada.");
 const {data,error}=await client.auth.getUser();
 if(error||!data.user||getCloudStatus().householdId!==status.householdId)throw Error("Confirme a sessão para acessar a cópia da casa.");
 return "user:"+data.user.id+":house:"+status.householdId;
}
export function LocalCheckpoint(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function run(action:"save"|"export"|"delete"){
  if(busy)return;setBusy(true);setMessage("");
  try{
   const key=await scope();
   if(action==="save"){
    await saveCheckpoint(key,getVoltaraSnapshot());setMessage("Ponto de recuperação gravado no IndexedDB.");
   }else if(action==="delete"){
    if(!window.confirm("Excluir a cópia de recuperação deste aparelho? Isso não exclui os registros da casa."))return;
    await deleteCheckpoint(key);setMessage("Cópia de recuperação removida.");
   }else{
    const checkpoint=await readCheckpoint(key);
    if(!checkpoint)throw Error("Nenhum ponto de recuperação disponível.");
    const blob=new Blob([JSON.stringify(checkpoint.state,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="voltara-recuperacao.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage("Cópia exportada, criada em "+new Date(checkpoint.createdAt).toLocaleString("pt-BR")+".");
   }
  }catch(e){setMessage(e instanceof Error?e.message:"Armazenamento indisponível.");}
  finally{setBusy(false);}
 }
 return <Panel title="Cópia local com Dexie / IndexedDB" hint="Primeira etapa da migração offline.">
  <Notice>Este recurso grava uma cópia adicional no navegador, somente a pedido. Não substitui a fila de sincronização nem permite abrir todo o app sem internet. Não use em computador compartilhado.</Notice>
  <div className="flex flex-wrap gap-2 mt-3"><Button disabled={busy} onClick={()=>void run("save")}>Criar ponto de recuperação</Button><Button variant="outline" disabled={busy} onClick={()=>void run("export")}>Exportar cópia</Button><Button variant="ghost" disabled={busy} onClick={()=>void run("delete")}>Excluir cópia</Button></div>
  {message&&<p role="status" className="mt-2 text-sm break-words">{message}</p>}
 </Panel>
}
