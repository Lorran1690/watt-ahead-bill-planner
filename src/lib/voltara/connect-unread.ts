import {useEffect,useState} from "react";
import {playConnectAlert,disableConnectAlerts} from "./connect-alerts";
import {getCloudClient} from "./cloud-client";
export function useConnectUnread(householdId:string|null,enabled:boolean){
 const [count,setCount]=useState(0);
 useEffect(()=>{
  setCount(0);
  if(!enabled||!householdId)return;
  const client=getCloudClient();if(!client)return;
  let active=true,busy=false,revision=0,previous:number|null=null;
  async function refresh(){
   if(!active)return;
   const generation=++revision;
   if(busy)return;
   busy=true;
   try{
    const result=await client!.rpc("voltara_chat_unread",{h:householdId});
    if(active&&!result.error&&generation===revision){const n=Number(result.data);if(Number.isSafeInteger(n)&&n>=0){if(previous!==null&&n>previous)playConnectAlert();previous=n;setCount(n); }}
   }catch{/* No unverified count. */}
   finally{busy=false;if(active&&generation!==revision)void refresh();}
  }
  const channel=client.channel("connect-unread:"+crypto.randomUUID())
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"voltara_chat_messages",filter:"household_id=eq."+householdId},()=>void refresh())
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"voltara_chat_receipts",filter:"household_id=eq."+householdId},()=>void refresh())
   .subscribe(s=>{if(s==="SUBSCRIBED")void refresh()});
  const auth=client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"){active=false;disableConnectAlerts();setCount(0);void client.removeChannel(channel);}}).data.subscription;
  const timer=window.setInterval(()=>void refresh(),20000);
  const focus=()=>void refresh();
  window.addEventListener("focus",focus);window.addEventListener("online",focus);
  void refresh();
  return()=>{active=false;clearInterval(timer);auth.unsubscribe();window.removeEventListener("focus",focus);window.removeEventListener("online",focus);void client.removeChannel(channel);};
 },[householdId,enabled]);
 return count;
}
