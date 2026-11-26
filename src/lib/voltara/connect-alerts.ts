// Foreground alerts only. Background sound/vibration is controlled by the OS.
let audio:AudioContext|null=null;
let enabled=false;
export function connectAlertsEnabled(){return enabled;}
export async function enableConnectAlerts(){
 if(typeof window==="undefined")return false;
 try{
  if(typeof AudioContext!=="undefined"){
   audio??=new AudioContext();
   await audio.resume();
  }
  enabled=!!audio||typeof navigator.vibrate==="function";
  if(enabled)playConnectAlert();
  return enabled;
 }catch{enabled=typeof navigator.vibrate==="function";return enabled;}
}
export function disableConnectAlerts(){
 enabled=false;const previous=audio;audio=null;
 void previous?.close().catch(()=>{});
}
export function playConnectAlert(){
 if(!enabled||typeof document==="undefined"||document.hidden)return;
 try{
  if(audio?.state==="running"){
   const tone=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
   tone.type="sine";tone.frequency.setValueAtTime(660,now);tone.frequency.setValueAtTime(880,now+.08);
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.08,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+.2);
   tone.connect(gain).connect(audio.destination);tone.start(now);tone.stop(now+.22);
  }
  navigator.vibrate?.(60);
 }catch{/* Unsupported platform or muted session. */}
}
