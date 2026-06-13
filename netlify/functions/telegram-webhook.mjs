// netlify/functions/telegram-webhook.mjs
// Handles incoming Telegram messages and processes them with Claude AI

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CHAT_ID = "5474779287";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendTelegram(text, parse_mode = "Markdown") {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode }),
  });
}

async function getStoredData() {
  // We use a simple KV via environment or fallback to empty state
  // In production this reads from Netlify Blobs
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("planner");
    const data = await store.get("user-data", { type: "json" });
    return data || getDefaultData();
  } catch {
    return getDefaultData();
  }
}

async function saveStoredData(data) {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("planner");
    await store.set("user-data", JSON.stringify(data));
  } catch (e) {
    console.error("Save error:", e);
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
    pendingTasks: [
      "Repasar encoders y PID",
      "Ejercicio Factory I/O",
      "Teoría de conducir",
    ],
    todayPlan: [],
    history: [],
    lastModified: new Date().toISOString(),
  };
}

async function askClaude(systemPrompt, userMessage, data) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const result = await response.json();
  return result.content?.[0]?.text || "No pude generar respuesta.";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "OK" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 200, body: "OK" };
  }

  const message = body?.message;
  if (!message || String(message.chat.id) !== CHAT_ID) {
    return { statusCode: 200, body: "OK" };
  }

  const text = message.text?.trim() || "";
  const data = await getStoredData();

  // --- Commands ---
  if (text === "/start" || text === "/hola") {
    await sendTelegram(
      `👋 *¡Hola Aritz!* Soy tu planificador diario.\n\n` +
      `Comandos disponibles:\n` +
      `📅 /plan → Ver tu plan de hoy\n` +
      `📋 /semana → Ver la semana completa\n` +
      `✅ /tareas → Lista de tareas pendientes\n` +
      `✏️ /cambiar → Modificar el plan de mañana\n` +
      `➕ /añadir [tarea] → Añadir tarea pendiente\n` +
      `💡 /consejo → Consejo del día de la IA`
    );
    return { statusCode: 200, body: "OK" };
  }

  if (text === "/plan") {
    const today = new Date().toLocaleDateString("es-ES", { weekday: "long" });
    const dayKey = getDayKey();
    const routine = data.routines[dayKey] || [];
    const todayPlan = data.todayPlan.length > 0 ? data.todayPlan : routine;

    const planText = todayPlan.length > 0
      ? todayPlan.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "No hay nada planificado aún.";

    await sendTelegram(`📅 *Plan de hoy (${today}):*\n\n${planText}`);
    return { statusCode: 200, body: "OK" };
  }

  if (text === "/semana") {
    const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    const names = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
    let msg = "📆 *Tu semana:*\n\n";
    days.forEach((d, i) => {
      const items = data.routines[d];
      msg += `*${names[i]}:*\n`;
      msg += items.length > 0 ? items.map(t => `  • ${t}`).join("\n") : "  • Libre";
      msg += "\n";
    });
    await sendTelegram(msg);
    return { statusCode: 200, body: "OK" };
  }

  if (text === "/tareas") {
    const tasks = data.pendingTasks;
    const msg = tasks.length > 0
      ? `✅ *Tareas pendientes:*\n\n${tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "✅ No tienes tareas pendientes. ¡Bien hecho!";
    await sendTelegram(msg);
    return { statusCode: 200, body: "OK" };
  }

  if (text.startsWith("/añadir ")) {
    const newTask = text.replace("/añadir ", "").trim();
    if (newTask) {
      data.pendingTasks.push(newTask);
      await saveStoredData(data);
      await sendTelegram(`✅ Tarea añadida: *${newTask}*`);
    }
    return { statusCode: 200, body: "OK" };
  }

  if (text === "/consejo") {
    const systemPrompt = `Eres el asistente personal de Aritz Setien, un joven que entrena K1, BJJ, NOGI y MMA, estudia programación PLC (TIA Portal/SCL) y está sacándose el carnet de conducir. Conoces sus rutinas semanales y sus tareas pendientes. Da un consejo corto, práctico y motivador sobre su día o semana. Sé directo, sin rodeos, en español.`;
    const userMsg = `Rutinas: ${JSON.stringify(data.routines)}\nTareas pendientes: ${data.pendingTasks.join(", ")}\nDame un consejo motivador y práctico para hoy.`;
    const advice = await askClaude(systemPrompt, userMsg, data);
    await sendTelegram(`💡 *Consejo del día:*\n\n${advice}`);
    return { statusCode: 200, body: "OK" };
  }

  if (text === "/cambiar") {
    await sendTelegram(
      `✏️ Dime qué quieres cambiar del plan de mañana. Puedes escribir en lenguaje natural, por ejemplo:\n\n` +
      `_"Mañana quiero añadir estudiar 2 horas de PLC después del entrenamiento"_\n` +
      `_"Quita el BJJ de mañana, tengo que descansar"_\n` +
      `_"Añade llamar al médico por la mañana"`
    );
    return { statusCode: 200, body: "OK" };
  }

  // --- Free text: process with Claude as plan modification ---
  const systemPrompt = `Eres el asistente personal de Aritz Setien. Procesas sus mensajes en lenguaje natural para modificar su planificación diaria. 
  
Rutinas actuales: ${JSON.stringify(data.routines)}
Tareas pendientes: ${data.pendingTasks.join(", ")}
Plan de hoy: ${data.todayPlan.join(", ") || "basado en rutina habitual"}

El usuario te dice algo sobre su día o mañana. Responde en JSON con este formato exacto:
{
  "respuesta": "mensaje amigable confirmando los cambios",
  "nuevoPlanManana": ["tarea1", "tarea2", "tarea3"],
  "tareasActualizadas": ["tarea pendiente 1", "tarea pendiente 2"]
}

Si no hay cambios que hacer, devuelve los arrays con los valores actuales.
Responde SOLO con el JSON, sin texto adicional.`;

  try {
    const rawResponse = await askClaude(systemPrompt, text, data);
    const clean = rawResponse.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Update tomorrow's plan
    const tomorrowKey = getTomorrowKey();
    if (parsed.nuevoPlanManana?.length > 0) {
      data.routines[tomorrowKey] = parsed.nuevoPlanManana;
    }
    if (parsed.tareasActualizadas?.length > 0) {
      data.pendingTasks = parsed.tareasActualizadas;
    }
    data.lastModified = new Date().toISOString();
    await saveStoredData(data);

    await sendTelegram(parsed.respuesta || "✅ Plan actualizado.");
  } catch {
    // Fallback: just have a conversation
    const convSystem = `Eres el asistente personal de Aritz Setien, joven que entrena artes marciales (K1, BJJ, NOGI, MMA) y estudia programación PLC. Responde en español, de forma amigable y concisa. Si no entiendes el mensaje, pide aclaración.`;
    const reply = await askClaude(convSystem, text, data);
    await sendTelegram(reply);
  }

  return { statusCode: 200, body: "OK" };
}

function getDayKey() {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  return days[new Date().getDay()];
}

function getTomorrowKey() {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  return days[(new Date().getDay() + 1) % 7];
}
