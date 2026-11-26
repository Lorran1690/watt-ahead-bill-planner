import {useState,type FormEvent} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Panel,Notice} from "@/components/voltara/ui";
import {receiptSuggestions} from "@/lib/voltara/receipt-parser";
import {parseCents,validDate} from "@/lib/voltara/finance";
import {setVoltara} from "@/lib/voltara/store";
import {useCloudStatus} from "@/lib/voltara/cloud-sync";
import {uid} from "@/lib/voltara/format";
import {localDateKey} from "@/lib/voltara/expenses";

async function shrink(file:File){
 const image=await createImageBitmap(file);
 try{
  const scale=Math.min(1,2400/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Imagem indisponível.");
  ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas;
 }finally{image.close();}
}
export function ReceiptScanner({initialFile=null}:{initialFile?:File|null} = {}){
 const sync=useCloudStatus();
 const [file,setFile]=useState<File|null>(initialFile);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [text,setText]=useState("");
 const [kind,setKind]=useState("expense");
 const [name,setName]=useState("");
 const [date,setDate]=useState("");
 const [amount,setAmount]=useState("");
 const [ready,setReady]=useState(false);
 const [saved,setSaved]=useState(false);
 async function scan(){
  if(!file||busy)return;
  setBusy(true);setError("");setText("");setReady(false);setSaved(false);setProgress("Preparando reconhecimento local...");
  let worker:Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>|undefined;
  try{
   if(file.size>10*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Use uma imagem JPEG, PNG ou WebP de até 10 MB.");
   const canvas=await shrink(file);
   const {createWorker}=await import("tesseract.js");
   const origin=window.location.origin+"/ocr";
   worker=await createWorker("por",1,{workerPath:origin+"/worker.min.js",corePath:origin+"/core",langPath:origin+"/lang",workerBlobURL:false,logger:m=>{setProgress(m.status==="recognizing text"?"Reconhecendo "+Math.round(m.progress*100)+"%":"Preparando modelo de português...")}});
   const result=await worker.recognize(canvas);
   const output=result.data.text.slice(0,30000);
   const suggestion=receiptSuggestions(output);
   setText(output);setName(suggestion.merchant);setDate(suggestion.date);setAmount(suggestion.amount);
   setReady(true);setProgress("Confira cada campo antes de salvar.");
  }catch(e){setError(e instanceof Error?e.message:"Falha no reconhecimento local.");}
  finally{await worker?.terminate().catch(()=>{});setBusy(false);}
 }
 function save(e:FormEvent){
  e.preventDefault();setError("");
  if(!ready||saved||busy)return;
  if(sync.phase==="connecting"||sync.phase==="empty"||sync.phase==="error"){setError("Confirme a sincronização da casa antes de salvar a leitura.");return;}
  const value=parseCents(amount);
  if(!value||!validDate(date)||name.length>120){setError("Confira data, valor e estabelecimento.");return;}
  if(!window.confirm("Salvar somente os campos conferidos? O texto da imagem não será compartilhado."))return;
  try{
   setVoltara(s=>{
    const month=date.slice(0,7);
    if(kind==="expense"){
      if(s.expenses.length>=10000)throw Error("Limite de gastos atingido.");
      return {...s,expenses:[...s.expenses,{id:uid(),date,note:name.trim(),amount:value/100}]};
    }
    if(kind==="bill"){
      if(s.bills.some(b=>b.month===month)||s.bills.length>=240)throw Error("Já existe fatura de luz deste mês ou limite atingido. Revise na aba Conta de Luz.");
      return {...s,bills:[...s.bills,{id:"bill-"+month,month,value:value/100}]};
    }
    if(s.waterBills.some(b=>b.month===month)||s.waterBills.length>=240)throw Error("Já existe fatura de água deste mês ou limite atingido. Revise na aba Conta de Água.");
    return {...s,waterBills:[...s.waterBills,{id:"water-"+month,month,value:value/100,note:name.trim()}]};
   });
   setSaved(true);setReady(false);setFile(null);setText("");setAmount("");setName("");setDate("");setProgress("Registro salvo.");
  }catch(e){setError(e instanceof Error?e.message:"Erro ao salvar.");}
 }
 return <Panel title="Scanner de notas e contas" hint="Reconhecimento experimental em português, executado no dispositivo.">
  <Notice>A imagem e o texto bruto não são enviados ao Supabase nem a uma API de IA. Apenas os campos confirmados entram nos seus registros. Não confie automaticamente nos resultados.</Notice>
  <div className="mt-3 space-y-3">
   {file&&<p className="text-xs text-muted-foreground">Imagem selecionada: {file.name}</p>}
   <Input aria-label="Imagem da nota" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setReady(false);setText("");setSaved(false);setProgress("");setError("");}}/>
   <Button disabled={!file||busy} onClick={()=>void scan()}>{busy?"Lendo imagem...":"Reconhecer nota"}</Button>
   {progress&&<p role="status" className="text-sm text-muted-foreground">{progress}</p>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {ready&&<form className="space-y-3" onSubmit={save}>
    <label className="block text-sm">Destino<select value={kind} onChange={e=>setKind(e.target.value)} className="block w-full rounded-lg border bg-background p-3"><option value="expense">Gasto diário</option><option value="bill">Conta de luz</option><option value="water">Conta de água</option></select></label>
    <label className="block text-sm">Estabelecimento / anotação<Input value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></label>
    <label className="block text-sm">Data (para faturas, use o mês de referência correto)<Input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label className="block text-sm">Valor total (R$)<Input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <details><summary className="text-sm cursor-pointer">Conferir texto reconhecido</summary><pre className="mt-2 whitespace-pre-wrap break-words max-h-52 overflow-auto text-xs">{text}</pre></details>
    <Button type="submit">Confirmar e salvar</Button>
   </form>}
  </div>
 </Panel>
}
