import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicPath = (name: string) => resolve(process.cwd(), "public", name);

describe("Instalação Voltara (PWA)", () => {
  const manifest = JSON.parse(readFileSync(publicPath("manifest.webmanifest"), "utf8"));

  it("declara identidade própria e abertura como aplicativo", () => {
    expect(manifest.name).toContain("Voltara");
    expect(manifest.lang).toBe("pt-BR");
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("oferece ícones PNG válidos em 192px e 512px", () => {
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((entry: { sizes: string }) => entry.sizes === size + "x" + size);
      expect(icon?.type).toBe("image/png");
      expect(icon?.purpose).toContain("any");
      const bytes = readFileSync(publicPath("voltara-icon-" + size + ".png"));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
      expect(bytes.byteLength).toBeGreaterThan(size * 50);
    }
  });

  it("mantém telas autenticadas e chamadas do Supabase FORA do cache offline", () => {
    const sw = readFileSync(publicPath("service-worker.js"), "utf8");
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain("if (url.origin !== self.location.origin) return");
    expect(sw).toContain("if (!PRE_CACHE.includes(url.pathname)) return");
    expect(sw).not.toContain("cache.put(request.clone(), request)");
    expect(readFileSync(publicPath("offline.html"), "utf8")).toContain("Sem conexão");
  });
});
