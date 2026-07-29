import "server-only";

type TelegramNotifyInput = {
  text: string;
};

type TelegramNotifyResult = {
  sent: boolean;
  reason?: string;
};

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

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: input.text,
          disable_web_page_preview: true,
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

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
