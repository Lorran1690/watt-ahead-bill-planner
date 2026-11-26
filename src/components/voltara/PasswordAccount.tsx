import {useEffect,useState,type FormEvent} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Panel,Notice} from "@/components/voltara/ui";
import {getCloudClient} from "@/lib/voltara/cloud-client";
import {PUBLIC_APP_ORIGIN,PUBLIC_SHARING_URL} from "@/lib/voltara/public-url";

type Mode="login"|"signup"|"reset";
export function PasswordAccount({email,disabled=false}:{email:string|null;disabled?:boolean}){
 const [mode,setMode]=useState<Mode>("login");
 const [name,setName]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  setName("");
  if(email){void getCloudClient()?.auth.getUser().then(({data})=>{
   if(active&&typeof data.user?.user_metadata?.display_name==="string")setName(data.user.user_metadata.display_name);
  }).catch(()=>{});}
  return()=>{active=false};
 },[email]);
 function switchMode(m:Mode){setMode(m);setMessage("");setError("")}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=event.currentTarget;const values=new FormData(form);
  if(busy||disabled)return;
  setBusy(true);setError("");setMessage("");
  try {
   if(window.location.origin!==PUBLIC_APP_ORIGIN&&!import.meta.env.DEV)throw Error("Abra o Voltara público para acessar a conta.");
   const client=getCloudClient();if(!client)throw Error("Autenticação indisponível.");
   const address=String(values.get("email")??"").trim();
   const password=String(values.get("password")??"");
   const confirm=String(values.get("confirm")??"");
   const displayName=String(values.get("name")??"").trim();
   if(email&&values.get("action")==="profile"){
    if(!displayName||displayName.length>80)throw Error("Informe um nome de até 80 caracteres.");
    const {error}=await client.auth.updateUser({data:{display_name:displayName}});
    if(error)throw error;setName(displayName);setMessage("Nome atualizado.");return;
   }
   if(!email&&mode==="reset"){
    const {error}=await client.auth.resetPasswordForEmail(address,{redirectTo:PUBLIC_SHARING_URL});
    if(error)throw error;
    setMessage("Se a conta estiver cadastrada, confira o e-mail de recuperação. Ao abrir o link, defina sua senha na seção Conta.");return;
   }
   if((email||mode==="signup")&&(password.length<12||password.length>128||password!==confirm))throw Error("Use 12 a 128 caracteres e confirme a senha.");
   if(email){
    const {error}=await client.auth.updateUser({password});
    if(error)throw error;
    setMessage("Senha definida. O próximo acesso pode ser feito com e-mail e senha. Sua casa foi preservada.");
   }else if(mode==="signup"){
    if(!displayName||displayName.length>80)throw Error("Informe seu nome.");
    const {error}=await client.auth.signUp({email:address,password,options:{emailRedirectTo:PUBLIC_SHARING_URL,data:{display_name:displayName}}});
    if(error)throw error;
    setMessage("Confira o e-mail para confirmar a conta, se necessário. Se já possui acesso por link, entre pelo método anterior e defina sua senha.");
   }else{
    const {error}=await client.auth.signInWithPassword({email:address,password});
    if(error)throw Error("Não foi possível entrar. Confira o e-mail e a senha, ou use a recuperação.");
    setMessage("Conta conectada.");
   }
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir a operação.");}
  finally{const password=form.elements.namedItem("password");const confirm=form.elements.namedItem("confirm");if(password instanceof HTMLInputElement)password.value="";if(confirm instanceof HTMLInputElement)confirm.value="";setBusy(false)}
 }
 const unavailable=busy||disabled;
 return <Panel title={email?"Minha conta":"Conta Voltara"} hint={email?"Seu perfil e senha, sem recriar a casa.":"Escolha entrar, criar conta ou recuperar senha."}>
  {email?<div className="space-y-4">
    <form onSubmit={submit} className="space-y-2">
      <input type="hidden" name="action" value="profile"/>
      <p className="text-sm break-words text-muted-foreground">{email}</p>
      <label className="block text-sm">Nome de exibição<Input name="name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required autoComplete="name"/></label>
      <Button disabled={unavailable}>Salvar perfil</Button>
    </form>
    <form onSubmit={submit} className="space-y-2 border-t pt-4">
      <Notice>Já usa o acesso por e-mail? Defina uma senha na sua conta atual. Se recebeu um e-mail de recuperação, use os mesmos campos.</Notice>
      <label className="block text-sm">Nova senha<Input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label>
      <label className="block text-sm">Confirme a senha<Input name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label>
      <Button disabled={unavailable}>Definir senha</Button>
    </form>
  </div>:<>
    <div className="flex flex-wrap gap-2 mb-3">{([["login","Entrar"],["signup","Criar conta"],["reset","Esqueci a senha"]] as const).map(([m,label])=><Button key={m} size="sm" variant={mode===m?"default":"outline"} onClick={()=>switchMode(m)}>{label}</Button>)}</div>
    <form key={mode} onSubmit={submit} className="space-y-3">
      {mode==="signup"&&<label className="block text-sm">Nome<Input name="name" autoComplete="name" maxLength={80} required/></label>}
      <label className="block text-sm">E-mail<Input name="email" type="email" autoComplete="email" required maxLength={250}/></label>
      {mode!=="reset"&&<label className="block text-sm">Senha<Input name="password" type="password" autoComplete={mode==="signup"?"new-password":"current-password"} maxLength={128} minLength={mode==="signup"?12:undefined} required/></label>}
      {mode==="signup"&&<label className="block text-sm">Confirmar senha<Input name="confirm" type="password" autoComplete="new-password" maxLength={128} minLength={12} required/></label>}
      <Button disabled={unavailable}>{busy?"Processando...":mode==="login"?"Entrar":mode==="signup"?"Criar conta":"Enviar recuperação"}</Button>
    </form>
    <p className="mt-3 text-xs text-muted-foreground">A conta antiga por link continua funcionando. Não crie outra conta para a mesma casa.</p>
  </>}
  {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  {message&&<p role="status" className="mt-3 text-sm text-success">{message}</p>}
 </Panel>
}
