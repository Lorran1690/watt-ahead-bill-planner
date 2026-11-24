import { describe, expect, it } from "vitest";
import { buildHouseholdInviteLink, clearPendingHouseholdInvite, getPendingHouseholdInvite, readHouseholdInviteHash, rememberHouseholdInvite } from "./invite-link";

const CODE = "0123456789abcdef".repeat(4);
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("convite por link do Voltara", () => {
  it("usa apenas o site público e fragmento privado", () => {
    const link = buildHouseholdInviteLink(CODE);
    expect(link).toBe("https://watt-ahead-bill-planner.lovable.app/compartilhar#convite=" + CODE);
    expect(new URL(link).search).toBe("");
    expect(readHouseholdInviteHash(new URL(link).hash)).toBe(CODE);
  });

  it("rejeita links inválidos e não interpreta tokens de login como convites", () => {
    expect(() => buildHouseholdInviteLink("foo")).toThrow();
    expect(readHouseholdInviteHash("#access_token=abcdef")).toBeNull();
    expect(readHouseholdInviteHash("#convite=wrong")).toBeNull();
  });

  it("guarda o convite durante a confirmação do e-mail e limpa após entrar", () => {
    const store = storage();
    rememberHouseholdInvite(store, CODE, 1000);
    expect(getPendingHouseholdInvite(store, 1001)).toBe(CODE);
    clearPendingHouseholdInvite(store);
    expect(getPendingHouseholdInvite(store, 1001)).toBeNull();
  });

  it("descarta o convite ao expirar", () => {
    const store = storage();
    rememberHouseholdInvite(store, CODE, 1000);
    expect(getPendingHouseholdInvite(store, 1000 + 8 * 86400000)).toBeNull();
  });
});
