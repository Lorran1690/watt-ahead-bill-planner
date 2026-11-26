import {describe,it,expect} from "vitest";
import {parseRelease,installedRelease} from "./app-update";
import published from "../../../public/voltara-version.json";
describe("Atualização do Voltara",()=>{
 it("mantém manifesto público e versão instalada alinhados",()=>expect(parseRelease(published)).toEqual(installedRelease));
 it("recusa manifesto inválido ou URL maliciosa",()=>{expect(()=>parseRelease(null)).toThrow();expect(()=>parseRelease({version:"2.1.0",revision:"https://evil.test"})).toThrow();});
});
