import { PUBLIC_SHARING_URL } from "./public-url";

const PENDING_INVITE_KEY = "voltara:pending-household-invite:v1";
const VALID_CODE = /^[a-f0-9]{64}$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Convite privado: fragmento não é enviado ao servidor nem aparece em logs HTTP. */
export function buildHouseholdInviteLink(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (!VALID_CODE.test(normalized)) throw new Error("Código de convite inválido.");
  return PUBLIC_SHARING_URL + "#convite=" + normalized;
}

export function readHouseholdInviteHash(hash: string): string | null {
  if (!hash.startsWith("#convite=")) return null;
  const code = new URLSearchParams(hash.slice(1)).get("convite")?.toLowerCase() ?? "";
  return VALID_CODE.test(code) ? code : null;
}

type PendingInviteStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function rememberHouseholdInvite(store: PendingInviteStore, code: string, now = Date.now()): void {
  const normalized = code.trim().toLowerCase();
  if (!VALID_CODE.test(normalized)) throw new Error("Código de convite inválido.");
  store.setItem(PENDING_INVITE_KEY, JSON.stringify({ code: normalized, expires: now + INVITE_TTL_MS }));
}

export function getPendingHouseholdInvite(store: PendingInviteStore, now = Date.now()): string | null {
  try {
    const saved = store.getItem(PENDING_INVITE_KEY);
    if (!saved) return null;
    const item: unknown = JSON.parse(saved);
    if (typeof item !== "object" || item === null || !("code" in item) || !("expires" in item)) {
      store.removeItem(PENDING_INVITE_KEY);
      return null;
    }
    const code = item.code;
    const expires = item.expires;
    if (typeof code === "string" && VALID_CODE.test(code) && typeof expires === "number" &&
        expires > now && expires <= now + INVITE_TTL_MS) return code;
  } catch {
    // Navegadores com armazenamento bloqueado continuam aceitando código manual.
  }
  try { store.removeItem(PENDING_INVITE_KEY); } catch { /* opcional */ }
  return null;
}

export function clearPendingHouseholdInvite(store: PendingInviteStore): void {
  store.removeItem(PENDING_INVITE_KEY);
}
