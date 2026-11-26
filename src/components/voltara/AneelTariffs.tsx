import {useState,type FormEvent} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Notice,Panel} from "@/components/voltara/ui";
import {localDateKey} from "@/lib/voltara/expenses";

const SOURCE="https://www.enel.com.br/pt/Tarifas_Enel.html";
const DISTRIBUTOR="ENEL RJ";
const API="https://dadosabertos.aneel.gov.br/api/3/action/datastore_search";
const RESOURCE="fcf2906c-7c32-4b9b-a637-054e7a5234f4";
type Row=Record<string,unknown>;
const txt=(r:Row,key:string)=>String(r[key]??"");
const date=(r:Row,key:string)=>txt(r,key).slice(0,10);
const amount=(v:unknown)=>typeof v==="number"?v:typeof v==="string"&&/^\d+(?:[.,]\d+)?$/.test(v.trim())?Number(v.replace(",",".")):NaN;
function rate(r:Row){
 const te=amount(r.VlrTE),tusd=amount(r.VlrTUSD),unit=txt(r,"DscUnidadeTerciaria").trim().toLowerCase();
 if(!Number.isFinite(te)||!Number.isFinite(tusd)||te<0||tusd<0)return null;
 if(unit==="r$/mwh")return (te+tusd)/1000;
 if(unit==="r$/kwh")return te+tusd;
 return null;
}
export function EnelRioTariffs(){
 const [onDate,setOnDate]=useState(localDateKey);
 const [rows,setRows]=useState<Row[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [queried,setQueried]=useState(false);
 async function search(e:FormEvent){
  e.preventDefault();if(busy)return;
  setBusy(true);setRows([]);setError("");setQueried(false);
  try{
   const name=DISTRIBUTOR;
   // Only public distributor and date are used, never household data.
   const found:Row[]=[];
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
   try{
    for(let offset=0;offset<5000;offset+=500){
      const query=new URLSearchParams({resource_id:RESOURCE,filters:JSON.stringify({SigAgente:name,DscSubGrupo:"B1"}),limit:"500",offset:String(offset)});
      const response=await fetch(API+"?"+query,{signal:controller.signal,credentials:"omit",referrerPolicy:"no-referrer"});
      if(!response.ok)throw Error("A consulta das tarifas da Enel RJ está indisponível.");
      const json=await response.json();
      if(json.success!==true||!Array.isArray(json.result?.records))throw Error("Formato de dados não reconhecido.");
      for(const record of json.result.records){
       if(!record||typeof record!=="object")continue;
       const r=record as Row;
       if(txt(r,"SigAgente")!==name||txt(r,"DscSubGrupo")!=="B1")continue;
       if(date(r,"DatInicioVigencia")<=onDate&&date(r,"DatFimVigencia")>=onDate)found.push(r);
      }
      if(json.result.records.length<500){setRows(found);setQueried(true);return;}
    }
    throw Error("Resultado muito amplo. Consulte a tabela oficial para evitar uma seleção incompleta.");
   }finally{clearTimeout(timer);}
  }catch{setError("Não foi possível consultar automaticamente as tarifas da Enel RJ neste navegador. Abra a página oficial da distribuidora abaixo; nenhuma tarifa foi alterada.")}
  finally{setBusy(false)}
 }
 return <Panel title="Tarifas Enel Distribuição Rio" hint="Exclusivamente Enel RJ, grupo residencial B1. Dados homologados publicados pela ANEEL.">
  <Notice>A tarifa TE + TUSD não inclui necessariamente impostos, bandeiras e iluminação pública. Não substitui automaticamente a tarifa total configurada no Voltara.</Notice>
  <form className="grid gap-3 mt-3 sm:grid-cols-2" onSubmit={search}>
   <div className="rounded-lg border bg-background p-3 text-sm"><strong>Enel Distribuição Rio</strong><p className="text-xs text-muted-foreground">Rio de Janeiro • B1 residencial</p></div>
   <label className="text-sm">Data de vigência<Input type="date" required value={onDate} onChange={e=>setOnDate(e.target.value)}/></label>
   <Button disabled={busy}>{busy?"Consultando...":"Consultar residencial B1"}</Button>
  </form>
  {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  {queried&&!rows.length&&<p className="mt-3 text-sm text-muted-foreground">Nenhuma linha localizada. Confira a data e a tabela no portal oficial da Enel Rio.</p>}
  <div className="mt-3 space-y-2">{rows.map((r,i)=><div className="rounded-xl border p-3 text-sm break-words" key={i}>
    <strong>{txt(r,"SigAgente")} • {txt(r,"DscClasse")} / {txt(r,"DscSubClasse")}</strong>
    <p>{txt(r,"DscBaseTarifaria")} • {txt(r,"DscModalidadeTarifaria")} • {txt(r,"NomPostoTarifario")} • {txt(r,"DscDetalhe")}</p>
    <p>Vigência: {date(r,"DatInicioVigencia")} a {date(r,"DatFimVigencia")} • {txt(r,"DscREH")}</p>
    <p>TE {txt(r,"VlrTE")} + TUSD {txt(r,"VlrTUSD")} ({txt(r,"DscUnidadeTerciaria")})</p>
    {rate(r)!==null&&<p>Equivalente: R$ {rate(r)!.toLocaleString("pt-BR",{maximumFractionDigits:6})}/kWh, sem complementos.</p>}
  </div>)}</div>
  <a className="mt-3 inline-block text-primary underline text-sm" href={SOURCE} target="_blank" rel="noreferrer">Consultar tarifas e impostos no site da Enel Rio</a>
 </Panel>
}
