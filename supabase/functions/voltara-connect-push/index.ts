// Staged server-side push dispatcher. Never expose the service role or VAPID private key.
import {createClient} from "npm:@supabase/supabase-js@2.119.2";
import webpush from "npm:web-push@3.6.7";
const origin="https://watt-ahead-bill-planner.lovable.app";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const json=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function endpointAllowed(value:unknown){
 if(typeof value!=="string"||value.length>2048)return false;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.port&&!u.username&&!u.password&&!u.hash&&
  (["fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com"].includes(u.hostname)||u.hostname.endsWith(".push.apple.com"));}
 catch{return false;}
}
const validKey=(v:unknown,min:number,max:number)=>typeof v==="string"&&v.length>=min&&v.length<=max&&/^[A-Za-z0-9_-]+={0,2}$/.test(v);
Deno.serve(async req=>{
 if(req.headers.get("origin")&&req.headers.get("origin")!==origin)return json(403,{error:"origin"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json(405,{error:"method"});
 try{
  const authorization=req.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer "))return json(401,{error:"auth"});
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pub=Deno.env.get("VOLTARA_VAPID_PUBLIC_KEY"),priv=Deno.env.get("VOLTARA_VAPID_PRIVATE_KEY"),subject=Deno.env.get("VOLTARA_VAPID_SUBJECT");
  if(!pub||!priv||!subject||!url||!anon||!service)return json(503,{error:"push_not_configured"});
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await caller.auth.getUser();
  if(error||!user||user.is_anonymous)return json(401,{error:"auth"});
  const raw=await req.text();if(raw.length>6000)return json(413,{error:"size"});
  const body=JSON.parse(raw);if(!uuid(body.house))return json(400,{error:"house"});
  const peer=await caller.rpc("voltara_chat_peer",{h:body.house});
  if(peer.error||!uuid(peer.data))return json(403,{error:"pair"});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body.action==="config")return json(200,{ok:true,publicKey:pub});
  if(body.action==="status"){
   if(!endpointAllowed(body.endpoint))return json(400,{error:"subscription"});
   const result=await admin.from("voltara_chat_push_devices").select("endpoint").eq("endpoint",body.endpoint).eq("user_id",user.id).eq("household_id",body.house).eq("peer_id",peer.data).maybeSingle();
   if(result.error)return json(500,{error:"storage"});
   return json(200,{ok:true,registered:!!result.data});
  }
  if(body.action==="register"){
   const sub=body.subscription;
   if(!endpointAllowed(sub?.endpoint)||!validKey(sub?.keys?.p256dh,80,100)||!validKey(sub?.keys?.auth,20,30))return json(400,{error:"subscription"});
   const existing=await admin.from("voltara_chat_push_devices").select("user_id").eq("endpoint",sub.endpoint).maybeSingle();
   if(existing.error)return json(500,{error:"storage"});
   if(existing.data&&existing.data.user_id!==user.id)return json(409,{error:"device_other_account"});
   const count=await admin.from("voltara_chat_push_devices").select("endpoint",{count:"exact",head:true}).eq("user_id",user.id);
   if(count.error||(count.count??0)>=10&&!existing.data)return json(429,{error:"device_limit"});
   const values={user_id:user.id,household_id:body.house,peer_id:peer.data,p256dh:sub.keys.p256dh,auth_secret:sub.keys.auth};
   // No overwrite of another account; primary-key conflict on concurrent registration fails.
   const result=existing.data?await admin.from("voltara_chat_push_devices").update(values).eq("endpoint",sub.endpoint).eq("user_id",user.id):await admin.from("voltara_chat_push_devices").insert({endpoint:sub.endpoint,...values});
   return result.error?json(409,{error:"register_failed"}):json(200,{ok:true});
  }
  if(body.action==="unregister"){
   if(!endpointAllowed(body.endpoint))return json(400,{error:"subscription"});
   const result=await admin.from("voltara_chat_push_devices").delete().eq("endpoint",body.endpoint).eq("user_id",user.id);
   return result.error?json(500,{error:"storage"}):json(200,{ok:true});
  }
  if(body.action!=="notify"||!uuid(body.messageId))return json(400,{error:"action"});
  // RLS is evaluated with caller's JWT, not service-role. Never accept recipient from client.
  const row=await caller.from("voltara_chat_messages").select("id,sender_id,recipient_id,created_at").eq("id",body.messageId).eq("household_id",body.house).maybeSingle();
  const age=row.data?Date.now()-Date.parse(row.data.created_at):Infinity;
  if(row.error||!row.data||row.data.sender_id!==user.id||row.data.recipient_id!==peer.data||age<0||age>300000)return json(403,{error:"message"});
  const claimed=await admin.from("voltara_chat_push_deliveries").insert({message_id:row.data.id});
  if(claimed.error)return claimed.error.code==="23505"?json(200,{ok:true,duplicate:true}):json(500,{error:"claim"});
  const devices=await admin.from("voltara_chat_push_devices").select("endpoint,p256dh,auth_secret").eq("user_id",peer.data).eq("household_id",body.house).eq("peer_id",user.id).limit(10);
  if(devices.error)return json(500,{error:"devices"});
  webpush.setVapidDetails(subject,pub,priv);
  // Content-free notification. No plaintext, sender name, URL, balance or attachment.
  for(const d of devices.data??[]){
   if(!endpointAllowed(d.endpoint))continue;
   try{await webpush.sendNotification({endpoint:d.endpoint,keys:{p256dh:d.p256dh,auth:d.auth_secret}},JSON.stringify({type:"voltara-connect"}),{TTL:86400,urgency:"high",timeout:5000});}
   catch(e){const code=(e as {statusCode?:number}).statusCode;if(code===404||code===410)await admin.from("voltara_chat_push_devices").delete().eq("endpoint",d.endpoint).eq("user_id",peer.data);}
  }
  return json(200,{ok:true});
 }catch{return json(500,{error:"request_failed"});}
});
