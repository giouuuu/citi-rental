import { describe, expect, it } from "vitest";

import { buildContactChannels } from "./contact-channels";

const hrefs = (values: Parameters<typeof buildContactChannels>[0]) =>
  Object.fromEntries(
    buildContactChannels(values, "Hi!").map((c) => [c.key, c.href]),
  );

describe("buildContactChannels", () => {
  it("hides channels the owner left empty", () => {
    expect(buildContactChannels({ whatsapp: "  ", viber: "" }, "Hi!")).toEqual(
      [],
    );
  });

  it("keeps the fixed channel order regardless of input order", () => {
    const keys = buildContactChannels(
      { phone: "+63 917 000 0000", kakaotalk: "zeke", whatsapp: "+639170000000" },
      "Hi!",
    ).map((c) => c.key);
    expect(keys).toEqual(["whatsapp", "kakaotalk", "phone"]);
  });

  it("builds number links from any formatting", () => {
    expect(
      hrefs({
        whatsapp: "+63 (917) 123-4567",
        viber: "+63 917 123 4567",
        phone: "0063 917 123 4567",
      }),
    ).toEqual({
      whatsapp: "https://wa.me/639171234567?text=Hi!",
      viber: "viber://chat?number=%2B639171234567",
      phone: "tel:+639171234567",
    });
  });

  it("treats a local 0 number as Philippine", () => {
    expect(hrefs({ whatsapp: "0917 123 4567" }).whatsapp).toBe(
      "https://wa.me/639171234567?text=Hi!",
    );
  });

  it("links handles and passes full URLs through", () => {
    expect(
      hrefs({
        telegram: "@zekecars",
        messenger: "https://m.me/zekecarrentals",
        line: "@zekecars",
        kakaotalk: "https://open.kakao.com/o/abc123",
      }),
    ).toEqual({
      kakaotalk: "https://open.kakao.com/o/abc123",
      line: "https://line.me/R/ti/p/%40zekecars",
      telegram: "https://t.me/zekecars",
      messenger: "https://m.me/zekecarrentals",
    });
  });

  it("uses the ~ form for personal LINE IDs", () => {
    expect(hrefs({ line: "zeke.cebu" }).line).toBe(
      "https://line.me/R/ti/p/~zeke.cebu",
    );
  });

  it("offers WeChat and plain Kakao IDs to copy", () => {
    const channels = buildContactChannels(
      { wechat: "zekecars", kakaotalk: "zeke_kakao" },
      "Hi!",
    );
    expect(channels.map((c) => [c.key, c.href, c.detail])).toEqual([
      ["wechat", null, "zekecars"],
      ["kakaotalk", null, "zeke_kakao"],
    ]);
  });
});
