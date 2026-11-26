import {validDate,parseCents} from "./finance";
export function receiptSuggestions(text:string) {
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const totals=lines.filter(l=>/\b(?:total(?:\s+a\s+pagar)?|valor\s+a\s+pagar|valor\s+total)\b/i.test(l)&&!/\b(?:subtotal|tributos|desconto|troco)\b/i.test(l));
 const found=totals.flatMap(l=>[...l.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})\b/g)].map(m=>m[1]!));
 const values=[...new Set(found.map(v=>v.includes(",")?v.replace(/\./g,""):v).filter(v=>parseCents(v)!==null))];
 const dates=[...text.matchAll(/\b(\d{2})[/-](\d{2})[/-](20\d{2})\b/g)].map(m=>m[3]+"-"+m[2]+"-"+m[1]).filter(validDate);
 // A first line is only a candidate, not a verified establishment.
 const merchant=lines.find(l=>/[a-zA-ZÀ-ÿ]{3}/.test(l)&&!/(cupom|nota fiscal|danfe|cnpj|cpf|comprovante)/i.test(l))?.slice(0,120)??"";
 return {amount:values.length===1?values[0]!:"",date:new Set(dates).size===1?dates[0]!:"",merchant,candidates:values};
}
