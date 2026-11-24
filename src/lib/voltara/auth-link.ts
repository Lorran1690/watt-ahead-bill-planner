/** Permite autenticar no próprio Voltara público sem seguir o redirecionamento
 * de um e-mail antigo para a prévia do Lovable.
 * Copie o endereço de confirmação antes de clicar; o token é de uso único.
 */
export type VoltaraEmailOtpType = "email" | "magiclink" | "signup" | "invite";
export interface ParsedVoltaraConfirmation {
  token_hash: string;
  type: VoltaraEmailOtpType;
}
const SUPABASE_AUTH_HOST = "okbqictunqsiqmoygbjs.supabase.co";
const VALID_TYPES = new Set<string>(["email", "magiclink", "signup", "invite"]);

export function parseVoltaraConfirmationLink(value: string): ParsedVoltaraConfirmation | null {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      url.hostname.toLowerCase() !== SUPABASE_AUTH_HOST ||
      url.pathname !== "/auth/v1/verify") return null;

  const type = url.searchParams.get("type");
  const token = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  // Uma token_hash não deve ter caracteres de controle, espaços ou parâmetros de URL.
  if (!type || !VALID_TYPES.has(type) || !token ||
      token.length < 20 || token.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(token)) return null;
  return { token_hash: token, type: type as VoltaraEmailOtpType };
}
