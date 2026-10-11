import { describe, expect, it } from "vitest";

import { buildContactChannels, facebookPageLinks } from "./contact-channels";

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

  it("turns a pasted Facebook page link into its Messenger chat", () => {
    expect(
      hrefs({
        messenger: "https://web.facebook.com/profile.php?id=61575009880226",
      }).messenger,
    ).toBe("https://m.me/61575009880226");
    expect(
      hrefs({ messenger: "https://www.facebook.com/zekecarrentals/" }).messenger,
    ).toBe("https://m.me/zekecarrentals");
    expect(hrefs({ messenger: "61575009880226" }).messenger).toBe(
      "https://m.me/61575009880226",
    );
  });

  it("links the Facebook page from a link, username, or ID", () => {
    expect(
      hrefs({ facebook: "https://web.facebook.com/profile.php?id=61575009880226" })
        .facebook,
    ).toBe("https://www.facebook.com/profile.php?id=61575009880226");
    expect(hrefs({ facebook: "zeke.carrentals" }).facebook).toBe(
      "https://www.facebook.com/zeke.carrentals",
    );
  });

  it("finds the Facebook page and reviews from either setting", () => {
    expect(facebookPageLinks({ messenger: "https://m.me/61575009880226" })).toEqual({
      page: "https://www.facebook.com/profile.php?id=61575009880226",
      reviews: "https://www.facebook.com/profile.php?id=61575009880226&sk=reviews",
    });
    expect(
      facebookPageLinks({
        facebook: "https://www.facebook.com/zekecarrentals",
        messenger: "61575009880226",
      }),
    ).toEqual({
      page: "https://www.facebook.com/zekecarrentals",
      reviews: "https://www.facebook.com/zekecarrentals/reviews",
    });
    expect(facebookPageLinks({ facebook: "https://example.com/zeke" })).toBeNull();
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
