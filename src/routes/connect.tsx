import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {createFileRoute,Link} from "@tanstack/react-router";
import {Camera,Mic,LockKeyhole,MessageCircle,Send,Star,Pin,Paperclip} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {PageHeader,Panel,Notice} from "@/components/voltara/ui";
import {getCloudClient} from "@/lib/voltara/cloud-client";
import {useCloudStatus,getCloudStatus} from "@/lib/voltara/cloud-sync";
import {useFamilyPresence,presenceLabel} from "@/lib/voltara/presence";
import {useVoltara,setVoltara} from "@/lib/voltara/store";
import {parseCents,financeSchema} from "@/lib/voltara/finance";
import {money} from "@/lib/voltara/format";
import {ReceiptScanner} from "@/components/voltara/ReceiptScanner";
import {loadPair,listMessages,listReceipts,markRead,typing,peerTyping,queueMessage,flushMessages,readMedia,compressPhoto,type Pair} from "@/lib/voltara/connect-api";
import {newPairSecret,pairScope,unlockPair,openMessage,type ChatPayload,type Envelope} from "@/lib/voltara/connect-crypto";
import {queued} from "@/lib/voltara/connect-queue";
import {isPairMessage,mergeTimeline,timelineWithQueue} from "@/lib/voltara/connect-timeline";
import {getConnectPushConfig,getConnectPushStatus,supportsConnectPush,subscribeConnectPush,unsubscribeConnectPush} from "@/lib/voltara/connect-push";

export const Route=createFileRoute("/connect")({head:()=>({meta:[{title:"Voltara Connect"}]}),component:ConnectPage});

function ConnectPage(){
 const sync=useCloudStatus();
 const [pair,setPair]=useState<Pair|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true,busy=false;let confirmed:Pair|null=null;let epoch=0;setPair(null);setError("");setLoading(true);
  const c=getCloudClient();
  async function refresh(){
   if(!active||busy||(!navigator.onLine&&confirmed))return;busy=true;const generation=epoch;
   try{
    if(!sync.householdId){if(active)setPair(null);return;}
    const p=await loadPair(sync.householdId);
    if(active&&generation===epoch){confirmed=p;setPair(old=>old?.scope===p?.scope?old:p);setError("");}
   }catch{if(active&&generation===epoch){if(navigator.onLine||!confirmed){confirmed=null;setPair(null);}setError("Não foi possível confirmar o vínculo. Reconecte sua conta ou confira a instalação do chat.");}}
   finally{busy=false;if(active)setLoading(false);}
  }
  void refresh();
  const t=window.setInterval(()=>void refresh(),30000);
  const sub=c?.auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_OUT"||(confirmed&&session?.user.id!==confirmed.me)){epoch++;confirmed=null;if(active)setPair(null);}
   if(event==="SIGNED_IN"&&active)window.setTimeout(()=>void refresh(),0);
  }).data.subscription;
  return()=>{active=false;clearInterval(t);sub?.unsubscribe();};
 },[sync.householdId,attempt]);
 return <div className="space-y-4">
  <PageHeader title="Voltara Connect" subtitle="Conversa privada da sua casa. Mensagens e anexos protegidos no dispositivo."/>
  {!pair?<Panel title="Conversa familiar">
    <Notice tone="warn">{loading?"Confirmando vínculo...":error||"Conecte as duas contas à mesma casa para usar o mensageiro."}</Notice>
    <div className="flex flex-wrap gap-2 mt-3"><Button asChild><Link to="/compartilhar">Compartilhar</Link></Button><Button variant="outline" onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</Button></div>
  </Panel>:<Conversation key={pair.scope} pair={pair}/>}
 </div>;
}
type ViewMessage={row:Envelope;payload:ChatPayload|null};
type DraftMedia={blob:Blob;kind:"image"|"audio";mime:"image/jpeg"|"audio/webm"|"audio/ogg"|"audio/mp4"};
const time=(v?:string)=>v?new Date(v).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
function Conversation({pair}:{pair:Pair}){
 const presence=useFamilyPresence(),state=useVoltara();
 const [key,setKey]=useState<CryptoKey|null>(null);
 const [secret,setSecret]=useState("");
 const [fingerprint,setFingerprint]=useState("");
 const [reveal,setReveal]=useState(false);
 const [verified,setVerified]=useState(false);
 const [micStarting,setMicStarting]=useState(false);
 const unlocked=useRef(false), micEpoch=useRef(0);
 const [rows,setRows]=useState<Envelope[]>([]);
 const [views,setViews]=useState<ViewMessage[]>([]);
 const [read,setRead]=useState<Set<string>>(new Set());
 const [text,setText]=useState("");
 const [filter,setFilter]=useState("");
 const [mode,setMode]=useState<"all"|"media"|"favorites">("all");
 const [draft,setDraft]=useState<DraftMedia|null>(null);
 const [reply,setReply]=useState<string|undefined>();
 const [error,setError]=useState("");
 const [outbox,setOutbox]=useState<Envelope[]>([]);
 const timeline=useMemo(()=>timelineWithQueue(rows,outbox),[rows,outbox]);
 const pendingIds=useMemo(()=>{const confirmed=new Set(rows.map(r=>r.id));return new Set(outbox.filter(r=>!confirmed.has(r.id)).map(r=>r.id));},[rows,outbox]);
 const pending=pendingIds.size;
 const scrollRef=useRef<HTMLDivElement>(null),composerRef=useRef<HTMLTextAreaElement>(null),followBottom=useRef(true),forceBottom=useRef(false);
 const lockEpoch=useRef(0),flushAgain=useRef(false);
 const [connected,setConnected]=useState(false);
 const [sending,setSending]=useState(false);
 const [typingAllowed,setTypingAllowed]=useState(false);
 const [isTyping,setIsTyping]=useState(false);
 const [recording,setRecording]=useState(false);
 const [olderAvailable,setOlderAvailable]=useState(true);
 const [notifications,setNotifications]=useState(false);
 const [pushActive,setPushActive]=useState(false);
 const [pushConfig,setPushConfig]=useState<{publicKey:string}|null>(null);
 const [pushStatus,setPushStatus]=useState("Verificando notificações...");
 const [pushBusy,setPushBusy]=useState(false);
 const [favorite,setFavorite]=useState<string[]>([]);
 const [pinned,setPinned]=useState<string[]>([]);
 const [selectedExpense,setSelectedExpense]=useState("");
 const [scanFile,setScanFile]=useState<File|null>(null);
 const [preview,setPreview]=useState("");
 const alive=useRef(true),busy=useRef(false),refreshBusy=useRef(false),lastTyping=useRef(0),notificationRef=useRef(false),known=useRef<Set<string>|null>(null);
 const mediaRecorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),stopTimer=useRef<number|undefined>(undefined),discard=useRef(false);
 const fileInput=useRef<HTMLInputElement>(null),cameraInput=useRef<HTMLInputElement>(null);
 const seen=useRef(new Set<string>());
 const decoded=useRef<{key:CryptoKey|null;messages:Map<string,{binding:string;result:Promise<ChatPayload|null>}>}>({key:null,messages:new Map()});
 const scope=pairScope(pair.house,pair.me,pair.peer);
 const peer=presence.members.find(m=>!m.is_self);
 const peerStatus=!presence.error&&peer?presenceLabel(peer):"unknown";
 function report(e:unknown){if(alive.current)setError(e instanceof Error?e.message:"Não foi possível concluir. Confira a conexão.");}
 function stopRecording(cancel=false){
  discard.current=cancel;
  if(stopTimer.current!==undefined)clearTimeout(stopTimer.current);
  if(mediaRecorder.current?.state!=="inactive")mediaRecorder.current?.stop();
  stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
 }
 useEffect(()=>{
  alive.current=true;
  try{const raw=JSON.parse(localStorage.getItem("voltara:connect:prefs:"+pair.scope)||"{}");setFavorite(Array.isArray(raw.favorite)?raw.favorite.filter((x:unknown)=>typeof x==="string").slice(0,200):[]);setPinned(Array.isArray(raw.pinned)?raw.pinned.filter((x:unknown)=>typeof x==="string").slice(0,10):[]);}catch{}
  return()=>{alive.current=false;discard.current=true;if(stopTimer.current!==undefined)clearTimeout(stopTimer.current);stream.current?.getTracks().forEach(t=>t.stop());};
 },[pair.scope]);
 useEffect(()=>{if(!draft){setPreview("");return;}const url=URL.createObjectURL(draft.blob);setPreview(url);return()=>URL.revokeObjectURL(url);},[draft]);
 async function unlock(e:FormEvent){
  e.preventDefault();setError("");
  try{
   const normalized=secret.trim().toLowerCase();
   const k=await unlockPair(normalized,scope);
   const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("voltara-fingerprint:"+scope+":"+normalized)));
   if(!alive.current)return;
   setFingerprint(Array.from(hash.slice(0,8),v=>v.toString(16).padStart(2,"0")).join("").match(/.{4}/g)!.join(" "));
   setSecret("");setReveal(false);setVerified(false);unlocked.current=true;setKey(k);
  }catch(e){report(e);}
 }
 function lock(){
  unlocked.current=false;lockEpoch.current++;micEpoch.current++;setOutbox([]);setMicStarting(false);setVerified(false);stopRecording(true);setKey(null);setRows([]);setViews([]);setSecret("");setFingerprint("");setText("");setDraft(null);setScanFile(null);setReply(undefined);setFilter("");setSelectedExpense("");setRecording(false);setRead(new Set());seen.current.clear();known.current=null;decoded.current={key:null,messages:new Map()};
 }
 async function refresh(){
  if(!alive.current||!unlocked.current||refreshBusy.current)return;
  const generation=lockEpoch.current;
  refreshBusy.current=true;
  try{
   const latest=await listMessages(pair);
   if(!alive.current||!unlocked.current||generation!==lockEpoch.current)return;
   setRows(old=>mergeTimeline(old,latest));
   setConnected(true);
   if(known.current&&notificationRef.current&&latest.some(e=>e.sender_id===pair.peer&&!known.current!.has(e.id))&&document.hidden){
    void navigator.serviceWorker?.ready.then(reg=>reg.showNotification("Voltara Connect",{body:"Você recebeu uma nova mensagem privada.",tag:"voltara-connect",data:{type:"voltara-connect"}})).catch(()=>{});
   }
   known.current=new Set(latest.map(e=>e.id));

  }catch{if(alive.current)setConnected(false);}
  finally{refreshBusy.current=false;}
 }
 async function flush(){
  if(!alive.current||!unlocked.current||!navigator.onLine)return;
  if(busy.current){flushAgain.current=true;return;}
  const generation=lockEpoch.current;
  const active=()=>alive.current&&unlocked.current&&generation===lockEpoch.current;
  busy.current=true;flushAgain.current=false;
  try{await flushMessages(pair,active,row=>{if(!active())return;setRows(old=>mergeTimeline(old,[row]));setOutbox(old=>old.filter(item=>item.id!==row.id));setConnected(true);});}
  catch{if(active())setConnected(false);}
  finally{busy.current=false;if(flushAgain.current&&alive.current&&unlocked.current){flushAgain.current=false;void flush();}}
 }
 useEffect(()=>{
  if(!key)return;let active=true;
  const c=getCloudClient();if(!c)return;
  const onUpdate=()=>{if(active)void refresh();};
  const onMessage=(event:{new:unknown})=>{if(!active||!unlocked.current)return;if(!isPairMessage(event.new,pair)){onUpdate();return;}const row=event.new;setRows(old=>mergeTimeline(old,[row]));setConnected(true);};
  const generation=lockEpoch.current;
  void queued(pair.scope).then(items=>{if(active&&unlocked.current&&generation===lockEpoch.current)setOutbox(old=>mergeTimeline(old,items.map(q=>({...q.envelope,created_at:new Date(q.queuedAt).toISOString()}))));}).catch(()=>{});
  const onReceipt=()=>{if(active)void listReceipts(pair,rowsRef.current.map(r=>r.id)).then(r=>{if(active)setRead(old=>new Set([...old,...r]))}).catch(()=>{});};
  const onTyping=()=>{if(active)void peerTyping(pair).then(v=>{if(active)setIsTyping(v)}).catch(()=>{});};
  const channel=c.channel("connect:"+pair.scope+":"+crypto.randomUUID())
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"voltara_chat_messages",filter:"household_id=eq."+pair.house},onMessage)
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"voltara_chat_receipts",filter:"household_id=eq."+pair.house},onReceipt)
   .on("postgres_changes",{event:"*",schema:"public",table:"voltara_chat_typing",filter:"household_id=eq."+pair.house},onTyping)
   .subscribe(s=>{if(active&&s==="SUBSCRIBED"){onUpdate();onReceipt();onTyping();}});
  const tick=()=>{if(active){void refresh();void flush();onReceipt();onTyping();}};
  tick();const timer=window.setInterval(tick,5000);const typingTimer=window.setInterval(onTyping,3000);
  window.addEventListener("online",tick);
  return()=>{active=false;clearInterval(timer);clearInterval(typingTimer);window.removeEventListener("online",tick);void c.removeChannel(channel);};
 },[key,pair.scope]);
 const rowsRef=useRef<Envelope[]>([]);rowsRef.current=rows;
 useEffect(()=>{
  let active=true;
  if(!key){setViews([]);return;}
  if(decoded.current.key!==key)decoded.current={key,messages:new Map()};
  const cache=decoded.current.messages;
  const ids=new Set(timeline.map(row=>row.id));
  for(const id of cache.keys())if(!ids.has(id))cache.delete(id);
  void Promise.all(timeline.map(async row=>{
   let entry=cache.get(row.id);
   const binding=JSON.stringify([row.household_id,row.sender_id,row.recipient_id,row.id,row.has_media,row.ciphertext]);
   if(!entry||entry.binding!==binding){
    entry={binding,result:openMessage(key,row).catch(()=>null)};
    cache.set(row.id,entry);
   }
   return {row,payload:await entry.result};
  })).then(v=>{if(active&&unlocked.current)setViews(v);});
  return()=>{active=false};
 },[key,timeline,pair.scope]);
 useEffect(()=>{
  if(!key)return;
  let active=true;
  void listReceipts(pair,rows.map(r=>r.id)).then(r=>{if(active)setRead(old=>new Set([...old,...r]));}).catch(()=>{});
  return()=>{active=false};
 },[key,rows,pair.scope]);
 async function loadOlder(){
  try{
   const first=rows[0];if(!first?.created_at)return;
   const older=await listMessages(pair,first.created_at);
   if(!alive.current)return;
   setOlderAvailable(older.length===50);
   setRows(old=>[...new Map([...older,...old].map(e=>[e.id,e])).values()].sort((a,b)=>(a.created_at??"").localeCompare(b.created_at??"")||a.id.localeCompare(b.id)));
  }catch(e){report(e);}
 }
 async function send(e?:FormEvent,financial?:ChatPayload["financial"]){
  e?.preventDefault();if(!key||!verified||sending||recording||micStarting||(!text.trim()&&!draft&&!financial))return;
  setSending(true);setError("");
  try{
   const payload:ChatPayload={text:text.trim(),...(reply?{reply}:{}),...(draft?{media:{kind:draft.kind,mime:draft.mime,size:draft.blob.size}}:{}),...(financial?{financial}:{})};
   const generation=lockEpoch.current;
   const item=await queueMessage(pair,key,payload,draft?.blob);
   if(!alive.current||!unlocked.current||generation!==lockEpoch.current)return;
   forceBottom.current=true;followBottom.current=true;
   setOutbox(old=>mergeTimeline(old,[{...item.envelope,created_at:new Date(item.queuedAt).toISOString()}]));
   setText(current=>current===text?"":current);setDraft(current=>current===draft?null:current);setReply(current=>current===reply?undefined:current);composerRef.current?.focus({preventScroll:true});void flush();
  }catch(e){report(e);}finally{if(alive.current)setSending(false);}
 }
 async function choosePhoto(file?:File){
  if(!file||!key||!verified)return;setError("");
  try{const blob=await compressPhoto(file);if(alive.current&&unlocked.current)setDraft({blob,kind:"image",mime:"image/jpeg"});}catch(e){report(e);}
 }
 async function startRecording(){
  if(recording||micStarting||draft||!key||!verified)return;setError("");setMicStarting(true);const generation=++micEpoch.current;
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw Error("Gravação não disponível neste navegador.");
   const mime=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw Error("Formato de voz incompatível.");
   const audio=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current||!unlocked.current||generation!==micEpoch.current){audio.getTracks().forEach(t=>t.stop());return;}
   stream.current=audio;discard.current=false;
   const chunks:Blob[]=[];const recorder=new MediaRecorder(audio,{mimeType:mime,audioBitsPerSecond:32000});mediaRecorder.current=recorder;
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onerror=()=>{report(Error("Falha ao gravar áudio."));stopRecording(true)};
   recorder.onstop=()=>{
    audio.getTracks().forEach(t=>t.stop());stream.current=null;
    if(!alive.current||generation!==micEpoch.current)return;setRecording(false);
    if(discard.current)return;
    const format=mime.split(";")[0] as DraftMedia["mime"];
    const blob=new Blob(chunks,{type:format});
    if(!blob.size||blob.size>2097152){report(Error("Áudio vazio ou acima de 2 MB."));return;}
    setDraft({blob,kind:"audio",mime:format});
   };
   recorder.start(1000);setRecording(true);stopTimer.current=window.setTimeout(()=>stopRecording(),120000);
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;report(e);}
  finally{if(alive.current&&generation===micEpoch.current)setMicStarting(false);}
 }
 function togglePref(id:string,which:"favorite"|"pinned"){
  const current=which==="favorite"?favorite:pinned;
  const next=current.includes(id)?current.filter(x=>x!==id):[...current,id].slice(which==="favorite"?-200:-10);
  if(which==="favorite")setFavorite(next);else setPinned(next);
  try{localStorage.setItem("voltara:connect:prefs:"+pair.scope,JSON.stringify({favorite:which==="favorite"?next:favorite,pinned:which==="pinned"?next:pinned}));}catch{report(Error("Não foi possível salvar a preferência neste aparelho."));}
 }
 function addShopping(view:ViewMessage){
  if(!view.payload?.text.trim()||getCloudStatus().phase!=="online")return report(Error("Conecte a casa para adicionar à lista."));
  const title=window.prompt("Nome do produto",view.payload.text.trim().slice(0,120));if(!title)return;
  const price=window.prompt("Preço estimado por unidade (R$)","");if(price===null)return;
  const cents=parseCents(price);if(!cents)return report(Error("Informe um preço válido."));
  try{
   const item=financeSchema.parse({id:"chat-"+view.row.id,type:"shopping",title,quantity:1,unitCents:cents,checked:false,purchased:false});
   setVoltara(s=>{
    const list=s.finance??[];if(list.some(p=>p.id===item.id))throw Error("Mensagem já adicionada à lista.");
    if(list.length>=5000)throw Error("Limite de registros.");
    return {...s,finance:[...list,item]};
   });
  }catch(e){report(e);}
 }
 useEffect(()=>{
  if(!key)return;
  let active=true;
  async function check(){
   if(!supportsConnectPush()){if(active)setPushStatus("Notificações push não são suportadas neste navegador.");return;}
   try{
    const config=await getConnectPushConfig(pair);
    const status=await getConnectPushStatus(pair);
    if(active){setPushConfig(config);setPushActive(status==="active");setPushStatus(status==="active"?"Notificações ativadas neste aparelho.":status==="blocked"?"Permissão bloqueada nas configurações do navegador.":"Notificações desativadas neste aparelho.");}
   }catch{if(active){setPushConfig(null);setPushActive(false);setPushStatus("Servidor de notificações ainda não disponível.");}}
  }
  void check();
  const onFocus=()=>{void check();};
  window.addEventListener("focus",onFocus);
  return()=>{active=false;window.removeEventListener("focus",onFocus);};
 },[key,pair.scope]);
 async function togglePush(enable:boolean){
  if(pushBusy)return;setPushBusy(true);setError("");
  try{if(!enable){await unsubscribeConnectPush(pair);setPushActive(false);setPushStatus("Notificações desativadas neste aparelho.");}else{if(!pushConfig)throw Error("Servidor de notificações ainda não disponível.");await subscribeConnectPush(pair,pushConfig);const status=await getConnectPushStatus(pair);setPushActive(status==="active");setPushStatus(status==="active"?"Notificações ativadas neste aparelho.":"Não foi possível confirmar a inscrição.");if(status==="active"){notificationRef.current=false;setNotifications(false);}}}catch(e){report(e);}finally{if(alive.current)setPushBusy(false);}
 }
 async function enableNotifications(){
  if(!("Notification" in window))return report(Error("Notificações não disponíveis."));
  const permission=await Notification.requestPermission();setNotifications(permission==="granted");notificationRef.current=permission==="granted";
 }
 const visible=views.filter(v=>mode!=="media"||v.payload?.media).filter(v=>mode!=="favorites"||favorite.includes(v.row.id)).filter(v=>!filter||((v.payload?.text??"")+" "+(v.payload?.financial?.label??"")).toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR")));
 useEffect(()=>{
  if(!key||!views.length)return;
  const observer=new IntersectionObserver(entries=>{
   if(document.hidden)return;
   for(const entry of entries){
    if(!entry.isIntersecting||entry.intersectionRatio<.65)continue;
    const id=(entry.target as HTMLElement).dataset.chatId;
    const v=views.find(v=>v.row.id===id&&v.payload&&v.row.recipient_id===pair.me);
    if(!v||seen.current.has(v.row.id)||read.has(v.row.id))continue;
    seen.current.add(v.row.id);
    void markRead(pair,[v.row]).then(()=>setRead(old=>new Set([...old,v.row.id]))).catch(()=>seen.current.delete(v.row.id));
   }
  },{threshold:.65});
  document.querySelectorAll("[data-chat-id]").forEach(el=>observer.observe(el));
  const onVisible=()=>{if(!document.hidden){observer.disconnect();document.querySelectorAll("[data-chat-id]").forEach(el=>observer.observe(el));}};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{observer.disconnect();document.removeEventListener("visibilitychange",onVisible)};
 },[key,views,filter,mode,read,pair.scope]);
 useEffect(()=>{const el=scrollRef.current;if(el&&(forceBottom.current||followBottom.current)){el.scrollTop=el.scrollHeight;forceBottom.current=false;}},[views,mode,filter]);
 if(!key)return <Panel title="Parear a conversa" hint="Chave compartilhada apenas pelos dois dispositivos.">
  <Notice tone="warn">Crie uma chave uma única vez e compartilhe-a diretamente, de preferência pessoalmente. Nos outros aparelhos, use exatamente a mesma chave. O Voltara não a envia ao servidor, não a guarda após fechar a conversa e não consegue recuperá-la. Não envie a chave por e-mail ou pelo chat.</Notice>
  <form onSubmit={unlock} className="mt-4 space-y-3">
   <label className="block text-sm">Chave da conversa (64 caracteres hexadecimais)<Input type={reveal?"text":"password"} autoComplete="off" spellCheck={false} value={secret} maxLength={64} onChange={e=>setSecret(e.target.value)} required/></label>
   <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>{setSecret(newPairSecret());setReveal(true)}}>Gerar nova chave</Button><Button type="button" variant="outline" onClick={()=>setReveal(v=>!v)}>{reveal?"Ocultar":"Mostrar"}</Button><Button type="submit"><LockKeyhole className="mr-2 size-4"/>Desbloquear</Button></div>
  </form>{error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
 </Panel>;
 return <>
  <Panel className="space-y-3">
   <div className="flex flex-wrap items-center gap-3"><div className="rounded-full bg-primary/15 p-3"><MessageCircle className="size-6 text-primary"/></div><div className="min-w-0 flex-1"><h2 className="font-semibold">Conversa da casa</h2><p className="text-xs text-muted-foreground">{isTyping?"Digitando...":peerStatus==="online"?"Online no Voltara":peerStatus==="unstable"?"Sinal instável":peerStatus==="offline"?"Sem sinal recente":"Presença indisponível"} · {connected?"Conectado":"Sem conexão confirmada"}</p></div><Button size="sm" variant="outline" onClick={lock}>Bloquear</Button></div>
   <details open={!verified} className="rounded-lg border p-2"><summary className="cursor-pointer text-xs text-muted-foreground">{verified?"Conversa verificada":"Verificar segurança da conversa"}</summary><p className="mt-2 text-xs break-words text-muted-foreground">Código de verificação: {fingerprint}. Compare pessoalmente nos dois aparelhos antes de conversar. Não compartilhe a chave.</p>
   <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>Confirmei que o código de verificação coincide nos dois aparelhos.</label></details>
   <div className="flex flex-wrap gap-2 items-center"><Input aria-label="Pesquisar mensagens carregadas" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Pesquisar mensagens..." className="flex-1 min-w-32"/>{(["all","media","favorites"] as const).map(m=><Button key={m} size="sm" variant={mode===m?"default":"outline"} onClick={()=>setMode(m)}>{m==="all"?"Conversa":m==="media"?"Galeria":"Favoritas"}</Button>)}</div>
   {pinned.length>0&&<div className="rounded-xl bg-primary/10 p-2 text-xs"><strong>Fixadas neste aparelho</strong>{views.filter(v=>pinned.includes(v.row.id)).map(v=><p key={v.row.id} className="break-words">{v.payload?.text||"Anexo / mensagem"}</p>)}</div>}
   <div ref={scrollRef} onScroll={e=>{const el=e.currentTarget;followBottom.current=el.scrollHeight-el.clientHeight-el.scrollTop<120;}} className="max-h-[58dvh] min-h-[240px] overflow-y-auto overscroll-contain rounded-xl bg-background/50 p-3 space-y-3" aria-label="Mensagens">
    {rows.length>=50&&olderAvailable&&<Button size="sm" variant="ghost" onClick={()=>void loadOlder()}>Carregar anteriores</Button>}
    {!visible.length&&<p className="text-center text-sm text-muted-foreground py-12">Nenhuma mensagem neste filtro.</p>}
    {visible.map(v=><div key={v.row.id} data-chat-id={v.row.id} className={"flex "+(v.row.sender_id===pair.me?"justify-end":"justify-start")}>
     <div className={"max-w-[92%] sm:max-w-[78%] min-w-0 rounded-2xl px-3 py-2 "+(v.row.sender_id===pair.me?"bg-primary/20 border border-primary/20":"bg-card border")}>
      {!v.payload?<p className="text-xs text-muted-foreground">Não foi possível decifrar com esta chave. Confira o pareamento.</p>:<>
       {v.payload.reply&&<p className="border-l-2 border-primary pl-2 text-xs text-muted-foreground break-words">{views.find(x=>x.row.id===v.payload!.reply)?.payload?.text.slice(0,100)||"Resposta a mensagem anterior"}</p>}
       {v.payload.text&&<p className="whitespace-pre-wrap break-words text-sm">{v.payload.text}</p>}
       {v.payload.financial&&<div className="mt-2 rounded-lg border bg-background/50 p-2"><p className="text-xs">Resumo compartilhado</p><strong className="break-words">{v.payload.financial.label}</strong><p>{money(v.payload.financial.amount)}</p></div>}
       {v.payload.media&&<Media key={v.row.id} row={v.row} payload={v.payload} cryptoKey={key} onScan={f=>setScanFile(f)}/>}
       <details className="mt-1"><summary className="cursor-pointer select-none text-xs text-muted-foreground">Opções</summary><div className="flex flex-wrap gap-1 mt-1">
        <Button size="sm" variant="ghost" onClick={()=>setReply(v.row.id)}>Responder</Button>
        <Button size="sm" variant="ghost" aria-label="Favoritar" onClick={()=>togglePref(v.row.id,"favorite")}><Star className={"size-4 "+(favorite.includes(v.row.id)?"fill-primary text-primary":"")}/></Button>
        <Button size="sm" variant="ghost" aria-label="Fixar" onClick={()=>togglePref(v.row.id,"pinned")}><Pin className={"size-4 "+(pinned.includes(v.row.id)?"fill-primary text-primary":"")}/></Button>
        {v.payload.text&&<Button size="sm" variant="ghost" onClick={()=>addShopping(v)}>Lista de compras</Button>}
       </div></details>
      </>}
      <p className="mt-1 text-right text-[10px] text-muted-foreground">{time(v.row.created_at)} {v.row.sender_id===pair.me?(pendingIds.has(v.row.id)?"· Na fila":read.has(v.row.id)?"· ✓✓ Lida":"· ✓ Enviada"):""}</p>
     </div>
    </div>)}
   </div>
   {pending>0&&<div role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{pending} mensagem(ns) na fila criptografada.</span><Button size="sm" variant="ghost" onClick={()=>void flush()}>Tentar enviar</Button></div>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {reply&&<div className="text-xs flex items-center gap-2">Respondendo: <span className="truncate">{views.find(v=>v.row.id===reply)?.payload?.text||"Mensagem"}</span><Button size="sm" variant="ghost" onClick={()=>setReply(undefined)}>Cancelar</Button></div>}
   {draft&&<div className="rounded-lg border p-2 space-y-2">{draft.kind==="image"?<img src={preview} alt="Prévia da foto" className="max-h-40 rounded-lg"/>:<audio src={preview} controls className="w-full max-w-full"/>}<Button size="sm" variant="outline" onClick={()=>setDraft(null)}>Remover anexo</Button></div>}
   <form className="sticky bottom-0 z-10 space-y-2 rounded-xl border bg-card p-2 shadow-lg" onSubmit={e=>void send(e)}>
    <textarea ref={composerRef} aria-label="Mensagem" rows={1} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing&&window.matchMedia("(pointer:fine)").matches){e.preventDefault();void send();}}} className="w-full resize-none rounded-xl border bg-background p-3 text-sm" placeholder="Digite sua mensagem..." maxLength={4000} value={text} onChange={e=>{setText(e.target.value);if(typingAllowed&&e.target.value.trim()&&Date.now()-lastTyping.current>3000){lastTyping.current=Date.now();void typing(pair).catch(()=>{});}}}/>
    <div className="flex flex-wrap gap-2">
     <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{void choosePhoto(e.target.files?.[0]);e.target.value="";}}/>
     <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void choosePhoto(e.target.files?.[0]);e.target.value="";}}/>
     <Button type="button" size="icon" variant="ghost" aria-label="Anexar foto" title="Anexar foto" disabled={recording||micStarting||!verified} onClick={()=>fileInput.current?.click()}><Paperclip className="size-5"/></Button>
     <Button type="button" size="icon" variant="ghost" aria-label="Câmera" title="Câmera" disabled={recording||micStarting||!verified} onClick={()=>cameraInput.current?.click()}><Camera className="size-5"/></Button>
     {recording?<><Button type="button" size="sm" onClick={()=>stopRecording()}>Parar gravação</Button><Button type="button" size="sm" variant="ghost" onClick={()=>stopRecording(true)}>Cancelar áudio</Button></>:<Button type="button" size="icon" variant="ghost" aria-label="Gravar áudio" title="Gravar áudio" disabled={!!draft||micStarting||!verified} onClick={()=>void startRecording()}><Mic className="size-5"/></Button>}
     <Button type="submit" size="sm" className="ml-auto rounded-full min-h-10" disabled={!verified||sending||recording||micStarting||(!text.trim()&&!draft)}><Send className="size-4 mr-1"/>Enviar</Button>
    </div>
   </form>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={typingAllowed} onChange={e=>setTypingAllowed(e.target.checked)}/>Compartilhar indicador de digitação</label>
   <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pushActive} onClick={()=>void enableNotifications()}>{notifications?"Avisos locais autorizados":"Autorizar avisos locais"}</Button>{pushConfig&&<Button size="sm" variant="outline" disabled={pushBusy||pushActive} onClick={()=>void togglePush(true)}>{pushActive?"Notificações ativadas":"Ativar notificações push"}</Button>}{pushConfig&&<Button size="sm" variant="ghost" disabled={pushBusy||!pushActive} onClick={()=>void togglePush(false)}>Desativar push neste aparelho</Button>}</div>
   <p className="text-xs text-muted-foreground">Avisos locais enquanto a conversa estiver aberta. {pushStatus} Busca e galeria abrangem apenas mensagens carregadas. Favoritos e fixados são locais.</p>
  </Panel>
  <Panel title="Compartilhar gasto existente" hint="Envia somente o resumo escolhido, não cria um novo lançamento.">
   <select aria-label="Gasto para compartilhar" className="w-full rounded-lg border bg-background p-2 text-sm" value={selectedExpense} onChange={e=>setSelectedExpense(e.target.value)}><option value="">Selecione um gasto</option>{state.expenses.slice(-100).map(e=><option key={e.id} value={e.id}>{e.note||"Gasto"} · {money(e.amount)}</option>)}</select>
   <Button className="mt-2" size="sm" disabled={!verified||!selectedExpense||sending||recording||micStarting} onClick={()=>{const e=state.expenses.find(x=>x.id===selectedExpense);if(e&&window.confirm("Compartilhar o resumo deste gasto na conversa?"))void send(undefined,{label:(e.note||"Gasto").slice(0,120),amount:e.amount});}}>Enviar resumo</Button>
  </Panel>
  {scanFile&&<div><Button variant="outline" onClick={()=>setScanFile(null)}>Fechar scanner</Button><ReceiptScanner key={scanFile.name} initialFile={scanFile}/></div>}
 </>;
}
function Media({row,payload,cryptoKey,onScan}:{row:Envelope;payload:ChatPayload;cryptoKey:CryptoKey;onScan:(f:File)=>void}){
 const [blob,setBlob]=useState<Blob|null>(null),[url,setUrl]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{if(!blob)return;const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u)},[blob]);
 async function load(){
  if(busy||blob)return;
  setBusy(true);setError("");
  try{const b=await readMedia(cryptoKey,row,payload);if(active.current)setBlob(b);}catch{if(active.current)setError("Não foi possível abrir o anexo cifrado.");}finally{if(active.current)setBusy(false)}
 }
 return <div className="mt-2 space-y-2 min-w-0">
  {!blob?<Button size="sm" variant="outline" disabled={busy} onClick={()=>void load()}>{busy?"Abrindo...":payload.media?.kind==="image"?"Abrir foto":"Ouvir áudio"}</Button>:payload.media?.kind==="image"?<><img src={url} alt="Foto compartilhada" className="max-h-64 max-w-full rounded-lg object-contain"/><Button size="sm" variant="outline" onClick={()=>onScan(new File([blob],"connect-"+row.id+".jpg",{type:"image/jpeg"}))}>Ler no scanner</Button></>:<audio controls autoPlay src={url} preload="metadata" className="w-full max-w-full"/>}
  {error&&<p className="text-xs text-destructive">{error}</p>}
 </div>;
}
