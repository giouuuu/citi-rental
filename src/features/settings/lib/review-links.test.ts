import { describe, expect, it } from "vitest";

import { DEFAULT_THANK_YOU_MESSAGE, resolveReviewLinks } from "./review-links";

describe("resolveReviewLinks", () => {
  it("uses the saved links and message", () => {
    expect(
      resolveReviewLinks(
        {
          google: " https://g.page/r/abc/review ",
          facebook: "https://www.facebook.com/zekecars/reviews",
          thankYou: "Salamat!",
        },
        { facebook: "otherpage" },
      ),
    ).toEqual({
      google: "https://g.page/r/abc/review",
      facebook: "https://www.facebook.com/zekecars/reviews",
      thankYou: "Salamat!",
    });
  });

  it("falls back to the Facebook page's reviews tab and the default message", () => {
    expect(resolveReviewLinks({}, { facebook: "zekecars" })).toEqual({
      google: null,
      facebook: "https://www.facebook.com/zekecars/reviews",
      thankYou: DEFAULT_THANK_YOU_MESSAGE,
    });
  });

  it("hides buttons when nothing usable is set", () => {
    const links = resolveReviewLinks({ google: "g.page/r/abc", facebook: "  " }, {});
    expect(links.google).toBeNull();
    expect(links.facebook).toBeNull();
  });
});
