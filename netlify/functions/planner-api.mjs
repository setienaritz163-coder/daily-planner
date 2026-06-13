// netlify/functions/planner-api.mjs
// REST API for the web dashboard — v2 with stats & history

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

async function getBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("planner");
}

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod === "GET") {
    try {
      const store = await getBlobStore();
      const data = await store.get("user-data", { type: "json" });
      return { statusCode: 200, headers, body: JSON.stringify(data || getDefaultData()) };
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify(getDefaultData()) };
    }
  }

  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);
      if (body.action === "log-day") {
        const store = await getBlobStore();
        let data = await store.get("user-data", { type: "json" }) || getDefaultData();
        const today = new Date().toISOString().split("T")[0];
        data.history = (data.history || []).filter(e => e.date !== today);
        data.history.push({ date: today, ...body.entry });
        data.history = data.history.slice(-90);
        data.lastModified = new Date().toISOString();
        await store.set("user-data", JSON.stringify(data));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      const store = await getBlobStore();
      body.lastModified = new Date().toISOString();
      await store.set("user-data", JSON.stringify(body));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers, body: "Method not allowed" };
}
