// Outbound-connection guard for user-supplied provider hosts (SMTP today).
//
// On the hosted version any account can enter an SMTP host, so without this the server would
// connect wherever it was told — internal databases, cloud metadata (169.254.169.254), the
// worker's private network — and echo back what it found. Every address the name resolves to must
// be public, and the connection is then pinned to that checked address so DNS cannot answer
// differently a moment later (rebinding).
//
// Self-hosters who relay through a local server (localhost:25, a "mailpit" container) opt in with
// MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS=true.
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { MailclockError } from "../errors";

const blocked = new BlockList();
// IPv4: "this network", private, CGNAT, loopback, link-local (cloud metadata), benchmarking,
// IETF/test-nets, multicast, reserved, broadcast.
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, bits, "ipv4");
// IPv6: unspecified, loopback, IPv4-mapped (checked again as IPv4 below), unique-local, link-local,
// documentation, multicast.
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["2001:db8::", 32], ["ff00::", 8],
] as const) blocked.addSubnet(net, bits, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
    if (mapped) return isPublicAddress(mapped);
    return !blocked.check(address, "ipv6");
  }
  return !blocked.check(address, "ipv4");
}

export const privateHostsAllowed = () => process.env.MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS === "true";

/**
 * Resolves `host` and returns the address to connect to. Throws a validation_error when any
 * resolved address is private (unless private hosts are allowed). The message never echoes what
 * the address belongs to.
 */
export async function resolveDeliverableHost(host: string): Promise<string> {
  let addresses: { address: string }[];
  try {
    addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new MailclockError("validation_error", `Could not resolve the host "${host}"`);
  }
  if (addresses.length === 0) throw new MailclockError("validation_error", `Could not resolve the host "${host}"`);
  if (!privateHostsAllowed() && !addresses.every((a) => isPublicAddress(a.address))) {
    throw new MailclockError(
      "validation_error",
      `"${host}" is a private or local address. Use a public SMTP server, or, when self-hosting with a local relay, set MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS=true.`,
    );
  }
  return addresses[0]!.address;
}
