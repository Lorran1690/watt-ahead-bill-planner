import Dexie,{type Table} from "dexie";
import {normalizeState} from "./storage";
import type {VoltaraState} from "./types";

type Checkpoint={scope:string;createdAt:string;state:VoltaraState};
let db:Dexie&{checkpoints:Table<Checkpoint,string>}|null=null;
function database(){
 if(typeof window==="undefined"||!window.indexedDB)throw Error("IndexedDB indisponível neste aparelho.");
 if(!db){
  db=new Dexie("voltara-local-v2") as Dexie&{checkpoints:Table<Checkpoint,string>};
  db.version(1).stores({checkpoints:"scope"});
 }
 return db;
}
export async function saveCheckpoint(scope:string,state:VoltaraState){
 const vault=database();
 const validated=normalizeState(state);
 await vault.transaction("rw",vault.checkpoints,async()=>{
   await vault.checkpoints.put({scope,createdAt:new Date().toISOString(),state:validated});
 });
}
export async function readCheckpoint(scope:string){
 const record=await database().checkpoints.get(scope);
 return record?{...record,state:normalizeState(record.state)}:null;
}
export async function deleteCheckpoint(scope:string){await database().checkpoints.delete(scope)}
