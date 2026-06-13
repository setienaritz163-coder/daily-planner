// netlify/functions/setup-webhook.mjs
// Call this ONCE via browser to register your Telegram webhook
// Visit: https://YOUR-SITE.netlify.app/.netlify/functions/setup-webhook

export async function handler(event) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const SITE_URL = process.env.URL || process.env.DEPLOY_URL;

  if (!TELEGRAM_TOKEN) {
    return {
      statusCode: 500,
      body: "Missing TELEGRAM_BOT_TOKEN environment variable",
    };
  }

  if (!SITE_URL) {
    return {
      statusCode: 500,
      body: "Missing URL environment variable (set automatically by Netlify)",
    };
  }

  const webhookUrl = `${SITE_URL}/.netlify/functions/telegram-webhook`;

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    }
  );

  const result = await response.json();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl,
      telegramResponse: result,
      status: result.ok ? "✅ Webhook registered successfully!" : "❌ Error registering webhook",
    }, null, 2),
  };
}
