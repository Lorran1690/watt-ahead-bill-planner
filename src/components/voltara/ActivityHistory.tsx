import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Panel,Notice} from "@/components/voltara/ui";
import {getCloudClient} from "@/lib/voltara/cloud-client";
import {useCloudStatus} from "@/lib/voltara/cloud-sync";
type Entry={id:number;actor_id:string|null;action:string;kind:string;record_type:string|null;created_at:string};
const actions:Record<string,string>={INSERT:"Cadastrou",UPDATE:"Alterou",DELETE:"Excluiu"};
const labels:Record<string,string>={expense:"gasto",bill:"conta de luz",water_bill:"conta de água",appliance:"aparelho",income:"receita",budget:"orçamento",payable:"conta a pagar",card:"cartão",purchase:"compra parcelada",settlement:"pagamento",shopping:"item de compras",maintenance:"manutenção",meter:"leitura",finance:"registro financeiro","expense-category":"categoria de gasto"};
export function ActivityHistory(){
 const sync=useCloudStatus();
 const [entries,setEntries]=useState<Entry[]>([]);
 const [me,setMe]=useState("");
 const [error,setError]=useState("");
 const [refresh,setRefresh]=useState(0);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  let active=true;setEntries([]);setError("");setMe("");
  const client=getCloudClient();if(!client||!sync.householdId||sync.phase==="local")return;
  setLoading(true);
  void (async()=>{
    try{
      const {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error("Sessão indisponível.");
      const result=await client.from("voltara_activity").select("id,actor_id,action,kind,record_type,created_at").eq("household_id",sync.householdId!).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(100);
      if(result.error)throw result.error;
      if(active){setMe(user.id);setEntries(result.data as Entry[]);}
    }catch{if(active)setError("Histórico indisponível. Confira a conexão e se a migração foi aplicada.");}
    finally{if(active)setLoading(false);}
  })();
  return()=>{active=false};
 },[sync.householdId,sync.phase,refresh]);
 return <Panel title="Histórico de atividades" hint="Últimas 100 alterações confirmadas no servidor após a ativação do recurso.">
  {!sync.householdId?<Notice>Conecte-se à casa para consultar o histórico compartilhado.</Notice>:<>
    <Button variant="outline" size="sm" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Atualizar histórico</Button>
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {!error&&!loading&&!entries.length&&<p className="mt-3 text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>}
    {entries.map(e=><div key={e.id} className="border-b py-3"><p className="text-sm font-medium">{e.actor_id===me?"Você":e.actor_id?"Outro membro":"Conta removida"} • {actions[e.action]??"Alterou"} {labels[e.record_type??e.kind]??"registro"}</p><p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</p></div>)}
  </>}
 </Panel>
}
