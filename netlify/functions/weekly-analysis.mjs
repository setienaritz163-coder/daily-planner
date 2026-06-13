// netlify/functions/weekly-analysis.mjs
// Scheduled every Sunday at 20:00 (18:00 UTC)
// Sends a full AI-powered weekly report via Telegram

export const config = {
  schedule: "0 18 * * 0",
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CHAT_ID = "5474779287";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendTelegram(text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
  });
}

async function getStoredData() {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("planner");
    const data = await store.get("user-data", { type: "json" });
    return data || {};
  } catch {
    return {};
  }
}

export async function handler() {
  const data = await getStoredData();
  const stats = data.weeklyStats || {};
  const history = data.history || [];
  const pendingTasks = data.pendingTasks || [];

  // Build a summary of the week's logged data
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);

  // Filter history to this week
  const thisWeek = history.filter(entry => {
    const d = new Date(entry.date);
    return d >= weekStart && d <= now;
  });

  const trainingsCompleted = thisWeek.filter(e => e.training).length;
  const studyHours = thisWeek.reduce((acc, e) => acc + (e.studyHours || 0), 0);
  const tasksCompleted = thisWeek.reduce((acc, e) => acc + (e.tasksCompleted || 0), 0);
  const avgSleep = thisWeek.length > 0
    ? (thisWeek.reduce((acc, e) => acc + (e.sleepHours || 0), 0) / thisWeek.length).toFixed(1)
    : "?";
  const nutritionDays = thisWeek.filter(e => e.nutrition).length;

  const summaryText =
    `Semana del ${weekStart.toLocaleDateString("es-ES")} al ${now.toLocaleDateString("es-ES")}:\n` +
    `- Entrenamientos completados: ${trainingsCompleted}/5\n` +
    `- Horas de estudio totales: ${studyHours}h\n` +
    `- Tareas completadas: ${tasksCompleted}\n` +
    `- Media horas de sueño: ${avgSleep}h\n` +
    `- Días con nutrición correcta: ${nutritionDays}/7\n` +
    `- Tareas pendientes actuales: ${pendingTasks.length}`;

  // Ask Claude for deep analysis
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: `Eres el coach personal de Aritz Setien, atleta de artes marciales (K1, BJJ, NOGI, MMA) y estudiante de programación PLC Siemens. Cada domingo haces un análisis honesto, detallado y motivador de su semana. Identifies patrones, señalas áreas de mejora concretas y das 3 recomendaciones accionables para la semana siguiente. Sé directo y específico, no genérico. En español.`,
      messages: [{
        role: "user",
        content: `Analiza mi semana con estos datos:\n\n${summaryText}\n\nTareas pendientes sin hacer: ${pendingTasks.join(", ") || "ninguna"}\n\nDame:\n1. Análisis honesto de la semana\n2. Qué mejoró respecto a la semana anterior (si tienes datos)\n3. Tres recomendaciones concretas para la semana que viene\n4. Una frase de motivación final`,
      }],
    }),
  });

  const result = await response.json();
  const analysis = result.content?.[0]?.text || "No pude generar el análisis.";

  const fullMessage =
    `📊 *ANÁLISIS SEMANAL — Aritz*\n\n` +
    `*Resumen de la semana:*\n` +
    `🥊 Entrenamientos: ${trainingsCompleted}/5\n` +
    `📚 Horas estudio: ${studyHours}h\n` +
    `✅ Tareas hechas: ${tasksCompleted}\n` +
    `😴 Media sueño: ${avgSleep}h\n` +
    `🥗 Nutrición OK: ${nutritionDays}/7 días\n\n` +
    `🤖 *Análisis IA:*\n${analysis}`;

  await sendTelegram(fullMessage);

  return { statusCode: 200, body: "Weekly analysis sent" };
}
