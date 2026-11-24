import { describe, expect, it } from "vitest";
import { presenceLabel, type MemberPresence } from "./presence";
const row: MemberPresence = { role: "member", is_self: false, joined_at: "2026-11-24T00:00:00Z", last_seen_at: "2026-11-24T12:00:00Z", server_now: "2026-11-24T12:00:20Z" };
describe("presença familiar", () => {
  it("identifica sinal recente", () => expect(presenceLabel(row)).toBe("online"));
  it("distingue sinal instável e offline", () => {
    expect(presenceLabel({ ...row, server_now: "2026-11-24T12:01:00Z" })).toBe("unstable");
    expect(presenceLabel({ ...row, server_now: "2026-11-24T12:01:31Z" })).toBe("offline");
  });
  it("não inventa presença quando falta sinal ou data válida", () => {
    expect(presenceLabel({ ...row, last_seen_at: null })).toBe("unknown");
    expect(presenceLabel({ ...row, last_seen_at: "inválido" })).toBe("unknown");
    expect(presenceLabel({ ...row, server_now: "2026-11-24T11:59:59Z" })).toBe("unknown");
  });
});
