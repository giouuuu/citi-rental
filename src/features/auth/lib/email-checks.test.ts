import { describe, expect, it } from "vitest";

import {
  emailDomain,
  isDisposableEmailDomain,
  suggestEmailCorrection,
} from "@/features/auth/lib/email-checks";

describe("suggestEmailCorrection", () => {
  it("fixes common domain slips", () => {
    expect(suggestEmailCorrection("juan@gmial.com")).toBe("juan@gmail.com");
    expect(suggestEmailCorrection("juan@gmai.com")).toBe("juan@gmail.com");
    expect(suggestEmailCorrection("juan@yaho.com")).toBe("juan@yahoo.com");
    expect(suggestEmailCorrection("juan@hotmial.com")).toBe("juan@hotmail.com");
    expect(suggestEmailCorrection("juan@outlok.com")).toBe("juan@outlook.com");
  });

  it("fixes known wrong endings", () => {
    expect(suggestEmailCorrection("juan@gmail.con")).toBe("juan@gmail.com");
    expect(suggestEmailCorrection("juan@gmail.com.ph")).toBe("juan@gmail.com");
    expect(suggestEmailCorrection("juan@yahoo.ph")).toBe("juan@yahoo.com.ph");
  });

  it("keeps the part before the @ as typed", () => {
    expect(suggestEmailCorrection("Juan.Dela.Cruz@Gmial.com")).toBe(
      "Juan.Dela.Cruz@gmail.com",
    );
  });

  it("leaves correct and unrelated domains alone", () => {
    expect(suggestEmailCorrection("juan@gmail.com")).toBeNull();
    expect(suggestEmailCorrection("juan@yahoo.com.ph")).toBeNull();
    expect(suggestEmailCorrection("juan@geotechengine.com")).toBeNull();
    expect(suggestEmailCorrection("juan@up.edu.ph")).toBeNull();
    expect(suggestEmailCorrection("juan@me.com")).toBeNull();
  });

  it("ignores text that is not an email yet", () => {
    expect(suggestEmailCorrection("juan")).toBeNull();
    expect(suggestEmailCorrection("juan@")).toBeNull();
    expect(suggestEmailCorrection("@gmial.com")).toBeNull();
  });
});

describe("isDisposableEmailDomain", () => {
  it("flags throwaway inboxes and their subdomains", () => {
    expect(isDisposableEmailDomain("mailinator.com")).toBe(true);
    expect(isDisposableEmailDomain("YOPMAIL.com")).toBe(true);
    expect(isDisposableEmailDomain("abc.guerrillamail.com")).toBe(true);
  });

  it("lets real providers through", () => {
    expect(isDisposableEmailDomain("gmail.com")).toBe(false);
    expect(isDisposableEmailDomain("mail.com")).toBe(false);
    expect(isDisposableEmailDomain("company.com.ph")).toBe(false);
  });
});

describe("emailDomain", () => {
  it("reads the lower-cased domain", () => {
    expect(emailDomain("Juan@Gmail.COM ")).toBe("gmail.com");
    expect(emailDomain("no-at-sign")).toBe("");
  });
});
