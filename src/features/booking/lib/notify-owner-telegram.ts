import "server-only";

type TelegramButton = {
  text: string;
  url: string;
};

type TelegramNotifyInput = {
  text: string;
  /** Tap-to-open links under the message, one per row. */
  buttons?: TelegramButton[];
};

type TelegramNotifyResult = {
  sent: boolean;
  reason?: string;
};

/**
 * Telegram rejects URL buttons that point at localhost or plain http, so in
 * dev those links fall back to text lines instead of failing the whole send.
 */
function splitButtons(buttons: TelegramButton[]): {
  inline: TelegramButton[];
  textLines: string[];
} {
  const inline: TelegramButton[] = [];
  const textLines: string[] = [];
  for (const button of buttons) {
    let usable = false;
    try {
      const url = new URL(button.url);
      usable = url.protocol === "https:" && url.hostname !== "localhost";
    } catch {
      usable = false;
    }
    if (usable) inline.push(button);
    else textLines.push(`${button.text}: ${button.url}`);
  }
  return { inline, textLines };
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)} (len ${value.length})`;
}

export async function notifyOwnerTelegram(
  input: TelegramNotifyInput,
): Promise<TelegramNotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID?.trim();

  if (!token || !chatId) {
    const reason = `Telegram is not configured (token=${token ? "set" : "missing"}, chatId=${chatId ? "set" : "missing"}).`;
    console.error("[telegram] skip notify:", reason);
    return { sent: false, reason };
  }

  const { inline, textLines } = splitButtons(input.buttons ?? []);
  const text = [input.text, ...textLines].join("\n");

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(inline.length > 0 && {
            reply_markup: {
              inline_keyboard: inline.map((button) => [button]),
            },
          }),
        }),
      },
    );

    const bodyText = await response.text();
    let description = bodyText;
    try {
      const json = JSON.parse(bodyText) as {
        ok?: boolean;
        description?: string;
        error_code?: number;
      };
      if (json.description) {
        description = `${json.error_code ?? response.status}: ${json.description}`;
      }
    } catch {
      // keep raw body
    }

    if (!response.ok) {
      const reason = `Telegram API rejected the message (${description}).`;
      console.error("[telegram] send failed", {
        status: response.status,
        description,
        chatId: maskSecret(chatId),
        token: maskSecret(token),
      });
      return { sent: false, reason };
    }

    console.info("[telegram] message sent", { chatId: maskSecret(chatId) });
    return { sent: true };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Could not reach Telegram.";
    console.error("[telegram] network error", reason, error);
    return { sent: false, reason };
  }
}

export { siteUrl } from "@/lib/site-url";
