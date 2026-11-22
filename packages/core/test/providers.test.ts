// Provider transports, tested through the EmailTransport interface. The third-party SDKs are the
// only thing mocked: these tests pin down which provider errors Mailclock retries and which it
// treats as permanent, since that decides whether an email is sent again or given up on.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const verify = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail, verify, close: vi.fn() }) } }));

const emailsSend = vi.fn();
const domainsList = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: emailsSend };
    domains = { list: domainsList };
  },
}));

const { createTransport, ProviderError } = await import("../src/providers");
const { isPermanentError } = await import("../src/dispatcher");

const email = {
  from: "Acme <hi@acme.test>",
  to: ["ada@example.com"],
  cc: [],
  bcc: [],
  subject: "Hello",
  text: "Hi",
  idempotencyKey: "email-1",
};

beforeEach(() => vi.clearAllMocks());

describe("SMTP", () => {
  const smtp = () => createTransport("SMTP", { host: "93.184.216.34", port: 587, user: "u", pass: "p" });

  it("sends and returns the message id, with a stable Message-ID per email", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@acme>" });
    await expect(smtp().send(email)).resolves.toEqual({ messageId: "<abc@acme>" });
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ messageId: "<email-1@mailclock>", to: ["ada@example.com"] });
  });

  it.each([
    ["5xx reply (mailbox does not exist)", { responseCode: 550, message: "550 no such user" }, true],
    ["authentication failure", { code: "EAUTH", message: "Invalid login" }, true],
    ["envelope rejected", { code: "EENVELOPE", message: "No recipients" }, true],
    ["4xx reply (try later)", { responseCode: 451, message: "451 greylisted" }, false],
    ["network timeout", { code: "ETIMEDOUT", message: "Connection timeout" }, false],
  ])("%s → permanent=%s", async (_label, err, permanent) => {
    sendMail.mockRejectedValue(Object.assign(new Error(err.message), err));
    const failure = await smtp().send(email).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(isPermanentError(failure)).toBe(permanent);
  });

  it("verify() surfaces connection problems as provider errors", async () => {
    verify.mockRejectedValue(Object.assign(new Error("Invalid login"), { code: "EAUTH" }));
    await expect(smtp().verify()).rejects.toMatchObject({ permanent: true });
  });
});

describe("Resend", () => {
  const resend = () => createTransport("RESEND", { apiKey: "re_test_123" });

  it("sends with the email id as the idempotency key", async () => {
    emailsSend.mockResolvedValue({ data: { id: "re_msg_1" }, error: null });
    await expect(resend().send({ ...email, html: "<p>Hi</p>" })).resolves.toEqual({ messageId: "re_msg_1" });
    expect(emailsSend.mock.calls[0]![1]).toEqual({ idempotencyKey: "email-1" });
  });

  it.each([
    ["validation error", { name: "validation_error", statusCode: 422 }, true],
    ["invalid from address", { name: "invalid_from_address", statusCode: 403 }, true],
    ["rate limited", { name: "rate_limit_exceeded", statusCode: 429 }, false],
    ["server error", { name: "internal_server_error", statusCode: 500 }, false],
    ["network failure (no status)", { name: "application_error", statusCode: null }, false],
  ])("%s → permanent=%s", async (_label, err, permanent) => {
    emailsSend.mockResolvedValue({ data: null, error: { ...err, message: "x" } });
    const failure = await resend().send(email).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(isPermanentError(failure)).toBe(permanent);
  });

  it("verify() checks the key without sending", async () => {
    domainsList.mockResolvedValue({ data: [], error: null });
    await expect(resend().verify()).resolves.toBeUndefined();
    expect(emailsSend).not.toHaveBeenCalled();
  });
});

describe("stored credentials", () => {
  it("invalid stored config fails permanently instead of retrying forever", () => {
    let thrown: unknown;
    try {
      createTransport("SMTP", { port: "not-a-port" });
    } catch (e) {
      thrown = e;
    }
    expect(isPermanentError(thrown)).toBe(true);
  });
});
