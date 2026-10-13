import nodemailer, { type SendMailOptions } from "nodemailer";
import { APP_NAME } from "@/lib/app-info";
import { isSmtpConfigured, type Env } from "@/lib/env";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
  replyTo?: string;
};

export interface Mailer {
  readonly configured: boolean;
  send(message: MailMessage): Promise<{ messageId: string }>;
}

export type MailTransport = {
  sendMail(options: SendMailOptions): Promise<{ messageId: string }>;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
};

export class MailerNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL, then restart PactPlum.");
    this.name = "MailerNotConfiguredError";
  }
}

export class MailSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MailSendError";
  }
}

export function createSmtpMailer(config: SmtpConfig, transport?: MailTransport): Mailer {
  const activeTransport: MailTransport =
    transport ??
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    });

  return {
    configured: true,
    async send(message) {
      try {
        const info = await activeTransport.sendMail({
          from: { name: message.fromName ?? APP_NAME, address: config.fromEmail },
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        return { messageId: info.messageId };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new MailSendError(`Could not send email: ${reason}`, { cause: error });
      }
    },
  };
}

const unconfiguredMailer: Mailer = {
  configured: false,
  async send() {
    throw new MailerNotConfiguredError();
  },
};

export function createMailerFromEnv(env: Env): Mailer {
  if (!isSmtpConfigured(env)) return unconfiguredMailer;
  return createSmtpMailer({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    fromEmail: env.SMTP_FROM_EMAIL!,
  });
}
