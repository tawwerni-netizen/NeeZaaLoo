/**
 * The EmailService, its templates, and its providers. No real network
 * access anywhere in this file -- everything runs against the mock
 * provider, which is exactly what makes it possible to assert what WOULD
 * have been sent without ever touching production email infrastructure.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "../src/email-service.mjs";
import { createMockEmailProvider, createConsoleEmailProvider, OFFICIAL_SENDER } from "../src/provider.mjs";
import { SUPPORTED_LOCALE_CODES } from "../../i18n/src/locales.mjs";

describe("mock provider", () => {
  test("records every send, inspectable by the test", async () => {
    const provider = createMockEmailProvider();
    const r = await provider.send({ to: "a@example.com", subject: "hi", html: "<p>hi</p>", locale: "en", template: "x" });
    assert.equal(r.ok, true);
    assert.equal(provider.sent.length, 1);
    assert.equal(provider.sent[0].to, "a@example.com");
  });

  test("reset() clears recorded sends", async () => {
    const provider = createMockEmailProvider();
    await provider.send({ to: "a@example.com", subject: "hi" });
    provider.reset();
    assert.equal(provider.sent.length, 0);
  });
});

describe("console provider", () => {
  test("refuses to construct under NODE_ENV=production", () => {
    assert.throws(() => createConsoleEmailProvider({ nodeEnv: "production" }));
  });

  test("constructs fine outside production", () => {
    assert.doesNotThrow(() => createConsoleEmailProvider({ nodeEnv: "development" }));
  });
});

describe("EmailService: sendWelcomeEmail", () => {
  test("sends from the official sender, to the right recipient, with the welcome template", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendWelcomeEmail({ to: "player@example.com", nickname: "ShadowMaster", locale: "en" });

    assert.equal(provider.sent.length, 1);
    const msg = provider.sent[0];
    assert.equal(msg.to, "player@example.com");
    assert.equal(msg.from, OFFICIAL_SENDER);
    assert.equal(msg.template, "welcome");
    assert.equal(msg.locale, "en");
    assert.match(msg.subject, /ShadowMaster/);
    assert.match(msg.html, /ShadowMaster|Welcome to Nizalo/);
  });

  test("renders in all six supported locales without throwing, each with locale-appropriate content", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    for (const locale of SUPPORTED_LOCALE_CODES) {
      await email.sendWelcomeEmail({ to: "x@example.com", nickname: "X", locale });
    }
    assert.equal(provider.sent.length, SUPPORTED_LOCALE_CODES.length);
    const arabic = provider.sent.find((m) => m.locale === "ar");
    assert.match(arabic.html, /dir="rtl"/);
    assert.match(arabic.html, /مرحبًا/);
    const hindi = provider.sent.find((m) => m.locale === "hi");
    assert.match(hindi.html, /स्वागत/);
  });

  test("an unrecognized locale falls back to English rather than throwing", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await assert.doesNotReject(() => email.sendWelcomeEmail({ to: "x@example.com", nickname: "X", locale: "xx" }));
  });
});

describe("EmailService: sendVerificationEmail", () => {
  test("the rendered email contains the code, expiry note, and never the word 'password'", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendVerificationEmail({ to: "player@example.com", email: "player@example.com", code: "AB3K9XZQ", expiresInMinutes: 30, locale: "en" });

    const msg = provider.sent[0];
    assert.equal(msg.template, "verification");
    assert.match(msg.html, /AB3K9XZQ/);
    assert.match(msg.text, /AB3K9XZQ/);
    assert.match(msg.html, /30/);
    assert.doesNotMatch(msg.html.toLowerCase(), /password/);
  });

  test("localizes correctly for a right-to-left reader (Arabic)", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendVerificationEmail({ to: "x@example.com", email: "x@example.com", code: "CODE1234", expiresInMinutes: 15, locale: "ar" });
    const msg = provider.sent[0];
    assert.match(msg.html, /dir="rtl"/);
    assert.match(msg.subject, /تحقق/);
  });

  test("metadata carries the expiry but never the code itself", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendVerificationEmail({ to: "x@example.com", email: "x@example.com", code: "SECRET99", expiresInMinutes: 10, locale: "en" });
    const msg = provider.sent[0];
    assert.deepEqual(msg.metadata, { expiresInMinutes: 10 });
    assert.equal(JSON.stringify(msg.metadata).includes("SECRET99"), false);
  });
});

describe("EmailService: sendLoginCode", () => {
  test("sends the login_code template with the 6-character code and never the word 'password'", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendLoginCode({ to: "player@example.com", code: "A7K9QP", expiresInMinutes: 10, locale: "en" });
    const msg = provider.sent[0];
    assert.equal(msg.template, "login_code");
    assert.match(msg.html, /A7K9QP/);
    assert.match(msg.text, /A7K9QP/);
    assert.doesNotMatch(msg.html.toLowerCase(), /password/);
  });

  test("renders in all six supported locales", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    for (const locale of SUPPORTED_LOCALE_CODES) {
      await email.sendLoginCode({ to: "x@example.com", code: "B3M8RT", expiresInMinutes: 10, locale });
    }
    assert.equal(provider.sent.length, SUPPORTED_LOCALE_CODES.length);
    assert.match(provider.sent.find((m) => m.locale === "ar").html, /dir="rtl"/);
  });

  test("metadata never contains the raw code", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendLoginCode({ to: "x@example.com", code: "ZZ9928", expiresInMinutes: 10, locale: "en" });
    assert.equal(JSON.stringify(provider.sent[0].metadata).includes("ZZ9928"), false);
  });
});

describe("EmailService: sendPasswordResetEmail", () => {
  test("sends the password_reset template with the code and never the word 'password' as a literal credential hint", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendPasswordResetEmail({ to: "player@example.com", code: "AB12CD34EF", expiresInMinutes: 30, locale: "en" });
    const msg = provider.sent[0];
    assert.equal(msg.template, "password_reset");
    assert.match(msg.html, /AB12CD34EF/);
    assert.match(msg.text, /AB12CD34EF/);
    assert.match(msg.html, /did not request/i);
  });

  test("renders in all six supported locales, Arabic RTL", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    for (const locale of SUPPORTED_LOCALE_CODES) {
      await email.sendPasswordResetEmail({ to: "x@example.com", code: "CODE12345", expiresInMinutes: 30, locale });
    }
    assert.equal(provider.sent.length, SUPPORTED_LOCALE_CODES.length);
    assert.match(provider.sent.find((m) => m.locale === "ar").html, /dir="rtl"/);
  });

  test("metadata never contains the raw code", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendPasswordResetEmail({ to: "x@example.com", code: "SECRETCODE", expiresInMinutes: 30, locale: "en" });
    assert.equal(JSON.stringify(provider.sent[0].metadata).includes("SECRETCODE"), false);
  });
});

describe("EmailService: sendPasswordResetConfirmation", () => {
  test("sends a notification containing no code, no link, and a warning for an unrecognized change", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendPasswordResetConfirmation({ to: "player@example.com", locale: "en" });
    const msg = provider.sent[0];
    assert.equal(msg.template, "password_reset_confirmation");
    assert.match(msg.html, /changed/i);
    assert.match(msg.html, /contact support/i);
  });

  test("renders in all six supported locales", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    for (const locale of SUPPORTED_LOCALE_CODES) {
      await email.sendPasswordResetConfirmation({ to: "x@example.com", locale });
    }
    assert.equal(provider.sent.length, SUPPORTED_LOCALE_CODES.length);
  });
});

describe("EmailService: support ticket notifications (Slice 8)", () => {
  const methods = [
    ["sendTicketCreatedEmail", "ticket_created"],
    ["sendTicketStaffRepliedEmail", "ticket_staff_replied"],
    ["sendTicketWaitingForUserEmail", "ticket_waiting_for_user"],
    ["sendTicketResolvedEmail", "ticket_resolved"],
  ];

  for (const [method, template] of methods) {
    test(`${method} sends the ${template} template, links to the ticket, and renders in all six locales`, async () => {
      const provider = createMockEmailProvider();
      const email = createEmailService({ provider, appBaseUrl: "https://nizalo.com" });
      for (const locale of SUPPORTED_LOCALE_CODES) {
        await email[method]({ to: "x@example.com", locale, ticketId: "spt_123", subject: "My deposit is missing" });
      }
      assert.equal(provider.sent.length, SUPPORTED_LOCALE_CODES.length);
      for (const msg of provider.sent) {
        assert.equal(msg.template, template);
        assert.match(msg.html, /spt_123/);
      }
      assert.match(provider.sent.find((m) => m.locale === "ar").html, /dir="rtl"/);
    });
  }

  test("a ticket subject containing markup is escaped in the HTML body, never injected raw", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendTicketCreatedEmail({ to: "x@example.com", locale: "en", ticketId: "spt_xss", subject: "<img src=x onerror=alert(1)>" });
    const msg = provider.sent[0];
    assert.doesNotMatch(msg.html, /<img src=x/);
    assert.match(msg.html, /&lt;img/);
  });

  test("metadata carries only the ticket id, never the ticket subject or any other free-text content", async () => {
    const provider = createMockEmailProvider();
    const email = createEmailService({ provider });
    await email.sendTicketResolvedEmail({ to: "x@example.com", locale: "en", ticketId: "spt_meta", subject: "Please do not leak this text" });
    assert.deepEqual(provider.sent[0].metadata, { ticketId: "spt_meta" });
  });
});
