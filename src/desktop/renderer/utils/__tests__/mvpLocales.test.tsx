import { describe,expect,it,beforeEach } from "vitest";
import { render,screen,fireEvent } from "@testing-library/react";
import { MemoryRouter,useLocation } from "react-router-dom";
import { IntlProvider } from "next-intl";
import { IntlMessageFormat } from "intl-messageformat";
import LanguageSelector from "@/components/LanguageSelector";
import { getLocaleMessages,getSafeLocale,messagesByLocale,saveLocalePreference,readLocalePreference } from "../locales";
function leaves(object:Record<string,unknown>,prefix=""):Record<string,string>{return Object.fromEntries(Object.entries(object).flatMap(([key,value])=>typeof value==="string"?[[prefix+key,value]]:Object.entries(leaves(value as Record<string,unknown>,prefix+key+"."))));}
function Location(){const location=useLocation();return <output>{location.pathname+location.search}</output>}
describe("English and Vietnamese UI",()=>{
 beforeEach(()=>localStorage.clear());
 it("has complete matching message keys with valid ICU placeholders",()=>{const en=leaves(messagesByLocale.en),vi=leaves(messagesByLocale.vi);expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());for(const [key,text] of Object.entries(vi)){expect(()=>new IntlMessageFormat(text,"vi")).not.toThrow();const args=(s:string)=>[...s.matchAll(/\{([a-zA-Z][\w]*)[},]/g)].map(m=>m[1]).sort();expect(args(text),key).toEqual(args(en[key]));}});
 it("persists Vietnamese and falls back safely for invalid preference",()=>{saveLocalePreference("vi");expect(readLocalePreference()).toBe("vi");expect(getSafeLocale("xx")).toBe("en");});
 it("changes language while preserving task and query parameters",()=>{render(<MemoryRouter initialEntries={["/en/task/t1?view=results"]}><IntlProvider locale="en" messages={getLocaleMessages("en")}><LanguageSelector/><Location/></IntlProvider></MemoryRouter>);fireEvent.change(screen.getByRole("combobox",{name:"Language"}),{target:{value:"vi"}});expect(screen.getByText("/vi/task/t1?view=results")).toBeTruthy();expect(readLocalePreference()).toBe("vi");});
 it("fills new nested UI keys for existing locales",()=>{const ko=getLocaleMessages("ko");expect((ko.task as Record<string,unknown>).advancedOptions).toBeTruthy();expect(ko.mvp).toBeTruthy();});
});
