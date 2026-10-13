import type { SendMailOptions } from "nodemailer";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import {
  createMailerFromEnv,
  createSmtpMailer,
  MailerNotConfiguredError,
  MailSendError,
  type MailTransport,
} from "@/server/mail/mailer";
import { escapeHtml, invitationEmail } from "@/server/mail/templates";
import { sendTestEmail } from "@/server/org/test-email";

const config = { host: "smtp.example.com", port: 587, secure: false, fromEmail: "noreply@example.com" };

function capturingTransport() {
  const sent: SendMailOptions[] = [];
  const transport: MailTransport = {
    async sendMail(options) {
      sent.push(options);
      return { messageId: "<test@example.com>" };
    },
  };
  return { sent, transport };
}

describe("SMTP mailer", () => {
  it("sends with the organization sender name and reply-to", async () => {
    const { sent, transport } = capturingTransport();
    const mailer = createSmtpMailer(config, transport);
    const result = await mailer.send({
      to: "client@example.com",
      subject: "Hello",
      text: "Body",
      fromName: "Acme Proposals",
      replyTo: "sales@acme.com",
    });
    expect(result.messageId).toBe("<test@example.com>");
    expect(sent[0].from).toEqual({ name: "Acme Proposals", address: "noreply@example.com" });
    expect(sent[0].replyTo).toBe("sales@acme.com");
    expect(sent[0].to).toBe("client@example.com");
  });

  it("falls back to the product name when no sender name is given", async () => {
    const { sent, transport } = capturingTransport();
    await createSmtpMailer(config, transport).send({ to: "a@b.com", subject: "s", text: "t" });
    expect(sent[0].from).toEqual({ name: "PactPlum", address: "noreply@example.com" });
  });

  it("wraps transport failures in a readable MailSendError", async () => {
    const failing: MailTransport = {
      async sendMail() {
        throw new Error("Invalid login: 535 Authentication failed");
      },
    };
    const mailer = createSmtpMailer(config, failing);
    await expect(mailer.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(MailSendError);
    await expect(mailer.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(/Authentication failed/);
  });
});

describe("createMailerFromEnv", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@localhost/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
  };

  it("returns an unconfigured mailer when SMTP is missing", async () => {
    const mailer = createMailerFromEnv(parseEnv(base));
    expect(mailer.configured).toBe(false);
    await expect(mailer.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(MailerNotConfiguredError);
  });

  it("returns a configured mailer when host and from address are set", () => {
    const mailer = createMailerFromEnv(
      parseEnv({ ...base, SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "noreply@example.com" }),
    );
    expect(mailer.configured).toBe(true);
  });
});

describe("templates", () => {
  it("escapes HTML in names", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
    const email = invitationEmail({ organizationName: "<Acme>", inviterName: "Ann", url: "https://x.test/i" });
    expect(email.html).toContain("&lt;Acme&gt;");
    expect(email.text).toContain("https://x.test/i");
  });
});

describe("sendTestEmail", () => {
  const org = { name: "Acme", senderName: null, replyToEmail: null };

  it("reports a readable error when SMTP is not configured", async () => {
    const mailer = createMailerFromEnv(
      parseEnv({
        DATABASE_URL: "postgres://u:p@localhost/db",
        BETTER_AUTH_SECRET: "x".repeat(32),
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    );
    const result = await sendTestEmail(mailer, org, "owner@acme.com");
    expect(result).toEqual({
      ok: false,
      error: "Email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL, then restart PactPlum.",
    });
  });

  it("reports the SMTP error message on failure", async () => {
    const failing: MailTransport = {
      async sendMail() {
        throw new Error("Connection timeout");
      },
    };
    const result = await sendTestEmail(createSmtpMailer(config, failing), org, "owner@acme.com");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Connection timeout/);
  });

  it("succeeds with a working transport", async () => {
    const { sent, transport } = capturingTransport();
    const result = await sendTestEmail(createSmtpMailer(config, transport), org, "owner@acme.com");
    expect(result).toEqual({ ok: true });
    expect(sent[0].subject).toContain("Acme");
  });
});
