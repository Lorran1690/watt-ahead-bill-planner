import { describe, expect, it } from "vitest";
import { parseVoltaraConfirmationLink } from "./auth-link";

const TOKEN = "abcdef0123456789".repeat(4);
describe("confirmação de e-mail no Voltara sem redirecionar ao editor", () => {
  it("aceita somente o link oficial Supabase do projeto Voltara", () => {
    expect(parseVoltaraConfirmationLink(
      "https://okbqictunqsiqmoygbjs.supabase.co/auth/v1/verify?token=" + TOKEN +
      "&type=magiclink&redirect_to=https%3A%2F%2Fid-preview--wrong.lovable.app"
    )).toEqual({ token_hash: TOKEN, type: "magiclink" });
    expect(parseVoltaraConfirmationLink(
      "https://okbqictunqsiqmoygbjs.supabase.co/auth/v1/verify?token_hash=" + TOKEN + "&type=signup"
    )).toEqual({ token_hash: TOKEN, type: "signup" });
  });

  it("rejeita domínios externos, páginas falsas e URLs com credenciais", () => {
    expect(parseVoltaraConfirmationLink("https://evil.example/auth/v1/verify?token=" + TOKEN + "&type=magiclink")).toBeNull();
    expect(parseVoltaraConfirmationLink("https://okbqictunqsiqmoygbjs.supabase.co.evil.example/auth/v1/verify?token=" + TOKEN + "&type=signup")).toBeNull();
    expect(parseVoltaraConfirmationLink("https://okbqictunqsiqmoygbjs.supabase.co@evil.example/auth/v1/verify?token=" + TOKEN + "&type=signup")).toBeNull();
    expect(parseVoltaraConfirmationLink("https://okbqictunqsiqmoygbjs.supabase.co/storage/v1/verify?token=" + TOKEN + "&type=signup")).toBeNull();
    expect(parseVoltaraConfirmationLink("http://okbqictunqsiqmoygbjs.supabase.co/auth/v1/verify?token=" + TOKEN + "&type=signup")).toBeNull();
  });

  it("não aceita tokens inexistentes ou tipos sem finalidade de login", () => {
    expect(parseVoltaraConfirmationLink("")).toBeNull();
    expect(parseVoltaraConfirmationLink("https://okbqictunqsiqmoygbjs.supabase.co/auth/v1/verify?token=abc&type=signup")).toBeNull();
    expect(parseVoltaraConfirmationLink("https://okbqictunqsiqmoygbjs.supabase.co/auth/v1/verify?token=" + TOKEN + "&type=recovery")).toBeNull();
  });
});
