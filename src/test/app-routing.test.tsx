import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without rendering or loading data, so these checks run without a browser.
describe("Rotas do Voltara", () => {
  it.each(["/", "/gastos", "/casa-3d", "/agua", "/aparelhos", "/habitos", "/contas", "/simulador", "/configuracoes", "/compartilhar", "/instalar", "/financas", "/connect"])(
    "encontra a página %s",
    (pathname) => {
      const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
      const matches = router.matchRoutes(pathname);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
      expect(matches.at(-1)?.routeId).toBe(pathname);
    },
  );
});
