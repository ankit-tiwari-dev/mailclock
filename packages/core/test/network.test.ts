// Hardening for user-supplied SMTP settings. Each case reproduces a misuse shown in the
// sharp-edges review (2026-11-22): credentials over a STARTTLS-stripped connection, and the
// connection test used as a probe of the server's private network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTransportSpy = vi.fn((opts: Record<string, unknown>) => ({
  verify: vi.fn().mockResolvedValue(true),
  sendMail: vi.fn().mockResolvedValue({ messageId: "<m@x>" }),
  close: vi.fn(),
  opts,
}));
vi.mock("nodemailer", () => ({ default: { createTransport: (o: Record<string, unknown>) => createTransportSpy(o) } }));

const { isPublicAddress, resolveDeliverableHost } = await import("../src/providers/network");
const { createTransport, parseProviderConfig } = await import("../src/providers");
const { verifyProviderConfig } = await import("../src/projects");

beforeEach(() => {
  createTransportSpy.mockClear();
  delete process.env.MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS;
});
afterEach(() => delete process.env.MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS);

describe("address classification", () => {
  it.each([
    ["127.0.0.1", false], ["10.1.2.3", false], ["172.20.0.5", false], ["192.168.1.1", false],
    ["169.254.169.254", false], ["100.64.0.1", false], ["0.0.0.0", false], ["::1", false],
    ["fd00::1", false], ["fe80::1", false], ["::ffff:127.0.0.1", false], ["::ffff:10.0.0.1", false],
    ["93.184.216.34", true], ["2606:2800:220:1:248:1893:25c8:1946", true], ["not-an-ip", false],
  ])("%s → public=%s", (addr, expected) => expect(isPublicAddress(addr)).toBe(expected));
});

describe("private hosts", () => {
  it("rejects loopback, private, and cloud-metadata hosts by default", async () => {
    for (const host of ["127.0.0.1", "localhost", "10.0.0.5", "169.254.169.254"]) {
      await expect(resolveDeliverableHost(host)).rejects.toMatchObject({ code: "validation_error" });
    }
  });

  it("the connection test refuses a private host without connecting, and says nothing about it", async () => {
    const err = await verifyProviderConfig("SMTP", { host: "127.0.0.1", port: 5432 }).catch((e: Error) => e);
    expect(err).toMatchObject({ code: "validation_error" });
    expect((err as Error).message).toMatch(/private or local address/);
    expect(createTransportSpy).not.toHaveBeenCalled();
  });

  it("self-hosters can opt in to a local relay", async () => {
    process.env.MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS = "true";
    await expect(resolveDeliverableHost("127.0.0.1")).resolves.toBe("127.0.0.1");
  });

  it("connects to the checked address, not the name, and verifies TLS against the name", async () => {
    const t = createTransport("SMTP", { host: "93.184.216.34", port: 587 });
    await t.verify();
    expect(createTransportSpy.mock.calls[0]![0]).toMatchObject({ host: "93.184.216.34", tls: { servername: "93.184.216.34" } });
  });
});

describe("TLS modes", () => {
  const optsFor = async (config: Record<string, unknown>) => {
    await createTransport("SMTP", { host: "93.184.216.34", ...config }).verify();
    return createTransportSpy.mock.calls.at(-1)![0];
  };

  it("defaults to STARTTLS that must succeed (no plaintext fallback)", async () => {
    expect(await optsFor({ port: 587 })).toMatchObject({ secure: false, requireTLS: true, ignoreTLS: false });
  });

  it("supports implicit TLS", async () => {
    expect(await optsFor({ port: 465, tls: "implicit" })).toMatchObject({ secure: true, requireTLS: false });
  });

  it("refuses to turn TLS off for anything but a local relay", () => {
    expect(() => parseProviderConfig("SMTP", { host: "smtp.example.com", port: 25, tls: "none" })).toThrow(/Invalid provider credentials/);
    expect(parseProviderConfig("SMTP", { host: "mailpit", port: 1025, tls: "none" })).toMatchObject({ tls: "none" });
  });

  it("reads configs saved before TLS modes existed", () => {
    expect(parseProviderConfig("SMTP", { host: "smtp.example.com", port: 465, secure: true })).toMatchObject({ tls: "implicit" });
    expect(parseProviderConfig("SMTP", { host: "smtp.example.com", port: 587, secure: false })).toMatchObject({ tls: "starttls" });
  });

  it('no longer reads the string "false" as true', () => {
    expect(() => parseProviderConfig("SMTP", { host: "smtp.example.com", port: "587", secure: "false" })).toThrow();
  });
});
