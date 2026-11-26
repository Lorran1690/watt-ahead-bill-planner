// Run locally in a private terminal. Never commit or share the output.
import {generateKeyPairSync} from "node:crypto";
const {privateKey,publicKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
const pub=publicKey.export({format:"jwk"});
const priv=privateKey.export({format:"jwk"});
if(!pub.x||!pub.y||!priv.d)throw Error("Falha ao gerar VAPID.");
const point=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,"base64url"),Buffer.from(pub.y,"base64url")]);
if(point.length!==65||Buffer.from(priv.d,"base64url").length!==32)throw Error("Chave inválida.");
console.log("VOLTARA_VAPID_PUBLIC_KEY="+point.toString("base64url"));
console.log("VOLTARA_VAPID_PRIVATE_KEY="+priv.d);
console.log("Configure VOLTARA_VAPID_SUBJECT com um contato real (mailto:...). Guarde a chave privada apenas nos segredos do Supabase.");
