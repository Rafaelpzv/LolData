import { describe, expect, it } from "vitest";

// The session helpers only touch Supabase from the functions this test avoids; the client is
// still built at import time, so the URL and the key are set before that import happens.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-key";
process.env.PREMADE_SESSION_SECRET ??= "test-secret";

const {
  hashPassword,
  verifyPassword,
  signSession,
  readSession,
  ipHash,
  newSalt,
} = await import("./edit-session");

describe("edit password", () => {
  it("stores a hash, never the password, and checks it", async () => {
    const salt = newSalt();
    const hash = await hashPassword("s3nha-forte", salt);
    expect(hash).not.toContain("s3nha-forte");
    await expect(verifyPassword("s3nha-forte", salt, hash)).resolves.toBe(true);
    await expect(verifyPassword("outra", salt, hash)).resolves.toBe(false);
  });

  it("binds the session to the team and the password version", () => {
    const token = signSession("team-1", 1, Date.now() + 60_000);
    expect(readSession(token, "team-1", 1)).toBe(true);
    // Changing the password raises the version, which ends every old session.
    expect(readSession(token, "team-1", 2)).toBe(false);
    expect(readSession(token, "team-2", 1)).toBe(false);
    expect(readSession(`${token}x`, "team-1", 1)).toBe(false);
    expect(
      readSession(signSession("team-1", 1, Date.now() - 1), "team-1", 1),
    ).toBe(false);
    expect(readSession(undefined, "team-1", 1)).toBe(false);
  });

  it("keeps a hash of the IP, not the address", () => {
    expect(ipHash("1.2.3.4")).toHaveLength(32);
    expect(ipHash("1.2.3.4")).not.toContain("1.2.3.4");
  });
});
