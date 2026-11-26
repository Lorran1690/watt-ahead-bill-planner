import {useRef,useState} from "react";
export function ConnectAudio({url,autoPlay=false}:{url:string;autoPlay?:boolean}){
 const audio=useRef<HTMLAudioElement>(null);
 const [rate,setRate]=useState(1);
 function change(){const next=rate===1?1.5:rate===1.5?2:1;setRate(next);if(audio.current)audio.current.playbackRate=next;}
 return <div className="flex min-w-0 flex-wrap items-center gap-2"><audio ref={audio} controls autoPlay={autoPlay} src={url} preload="metadata" className="min-w-0 w-full max-w-full" onLoadedMetadata={()=>{if(audio.current)audio.current.playbackRate=rate;}}/><button type="button" className="rounded-full border px-3 py-1 text-xs font-medium" onClick={change} aria-label={"Velocidade "+rate+"x; alterar"}>{rate}×</button></div>
}
