// netlify/functions/nightly-planner.mjs
// Scheduled function: runs every day at 21:30 (Europe/Madrid = 19:30 UTC)
// Cron: "30 19 * * *"

export const config = {
  schedule: "30 19 * * *",
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
    return data || getDefaultData();
  } catch {
    return getDefaultData();
  }
}

function getDefaultData() {
  return {
    routines: {
      monday:    ["K1 training 19:00", "Estudiar TIA Portal"],
      tuesday:   ["BJJ 19:00"],
      wednesday: ["K1 training 19:00", "Estudiar"],
      thursday:  ["NOGI/Grappling 19:00"],
      friday:    ["MMA 19:00"],
      saturday:  ["Descanso activo", "Conducir / teoría"],
      sunday:    ["Descanso", "Planificación semana"],
    },
    pendingTasks: [],
    todayPlan: [],
    history: [],
  };
}

function getTomorrowKey() {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  return days[(new Date().getDay() + 1) % 7];
}

function getTomorrowName() {
  const names = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  return names[(new Date().getDay() + 1) % 7];
}

export async function handler() {
  const data = await getStoredData();
  const tomorrowKey = getTomorrowKey();
  const tomorrowName = getTomorrowName();
  const tomorrowRoutine = data.routines[tomorrowKey] || [];
  const pendingTasks = data.pendingTasks || [];

  // Ask Claude for a smart plan suggestion
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `Eres el asistente personal de Aritz Setien, atleta de artes marciales (K1, BJJ, NOGI, MMA) y estudiante de programación PLC (TIA Portal/SCL, Siemens). También está sacándose el carnet. Cada noche le mandas un resumen motivador del día siguiente con el plan base y una sugerencia inteligente. Sé breve, directo y práctico. En español.`,
      messages: [{
        role: "user",
        content: `Mañana es ${tomorrowName}. 
Rutina base: ${tomorrowRoutine.length > 0 ? tomorrowRoutine.join(", ") : "día libre"}
Tareas pendientes importantes: ${pendingTasks.slice(0, 3).join(", ") || "ninguna"}

Genera un mensaje nocturno motivador con:
1. El plan del día siguiente
2. Una sugerencia de qué tarea pendiente encajar
3. Un mensaje de ánimo corto
Termina preguntando si quiere cambiar algo del plan.`,
      }],
    }),
  });

  const result = await response.json();
  const suggestion = result.content?.[0]?.text || "";

  const planLines = tomorrowRoutine.length > 0
    ? tomorrowRoutine.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "  Día libre 🟢";

  const fullMessage =
    `🌙 *Buenas noches, Aritz!*\n\n` +
    `📅 *Mañana (${tomorrowName}):*\n${planLines}\n\n` +
    `🤖 *Sugerencia IA:*\n${suggestion}\n\n` +
    `_Escríbeme si quieres cambiar algo del plan o añadir tareas_ ✏️`;

  await sendTelegram(fullMessage);

  return { statusCode: 200, body: "Nightly message sent" };
}
