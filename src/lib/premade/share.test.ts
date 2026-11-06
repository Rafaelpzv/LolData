import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// O cliente do Supabase e montado no import e so e usado dentro das funcoes que este teste nao
// chama; as variaveis ficam definidas antes do import dinamico abaixo.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-key";

const { defaultShareId, isShareEnabled } = await import("./share");

describe("share gate", () => {
  // O 404 do link compartilhado vinha de um `share_enabled` que nao chegava como `true`; a regra
  // agora e "so um false explicito desliga", e nada mais.
  it("only an explicit false turns the link off", () => {
    expect(isShareEnabled(false)).toBe(false);
    expect(isShareEnabled(true)).toBe(true);
    expect(isShareEnabled(null)).toBe(true);
    expect(isShareEnabled(undefined)).toBe(true);
  });

  // O painel ja sumiu uma vez por nao ter estado sem resposta: ele precisa desenhar algo sempre.
  it("the share panel never renders nothing", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "components", "premade", "share-lineup.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/return null;/);
    expect(source).toMatch(/phase === "failed"/);
    expect(source).toMatch(/t\("enable"\)/);
  });

  // O id derivado do slug continua o mesmo: nenhum link antigo em circulacao muda.
  it("keeps the derived id of the slug", () => {
    const derived = defaultShareId("premade-flex");
    expect(derived).toBe("4dd6212f23a0b13160824f8fe7062df8");
    expect(derived).toMatch(/^[0-9a-f]{32}$/);
  });
});
