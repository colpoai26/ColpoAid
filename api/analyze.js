// ═══════════════════════════════════════════════════════════════
// ███  PROXY DEL MOTOR IA — ColpoAId / MedicAId  ███
// ═══════════════════════════════════════════════════════════════
// Esta función vive en el servidor (Vercel). Acá es donde se elige
// QUÉ MODELO de IA responde. La API key vive acá, oculta, nunca
// llega al navegador.
//
// ─── CÓMO CAMBIAR DE MOTOR ───────────────────────────────────────
// Solo cambiá la línea "MOTOR_ACTIVO" de abajo. Eso es todo.
//   'claude-opus'   → Claude Opus (potente, más caro)
//   'claude-sonnet' → Claude Sonnet (rápido y económico)
//   'gemini'        → Google Gemini (requiere su propia API key)
//   'propio'        → Tu futuro modelo entrenado (cuando lo tengas)
//
// Para AGREGAR un motor nuevo: copiá uno de los bloques de MOTORES
// y adaptalo. La app (index.html) NO se toca nunca.
// ═══════════════════════════════════════════════════════════════

// ┌─────────────────────────────────────────────────────────────┐
// │  ELEGÍ EL MOTOR ACTIVO ACÁ:                                  │
const MOTOR_ACTIVO = 'claude-opus';
// └─────────────────────────────────────────────────────────────┘


// ═══════════════════════════════════════════════════════════════
// CATÁLOGO DE MOTORES DISPONIBLES
// ═══════════════════════════════════════════════════════════════
const MOTORES = {

  // ── Claude Opus (Anthropic) ──────────────────────────────────
  'claude-opus': {
    nombre: 'Claude Opus 4.5',
    async analizar(base64Data, prompt) {
      return llamarAnthropic('claude-opus-4-5', base64Data, prompt);
    }
  },

  // ── Claude Sonnet (Anthropic) — más rápido y barato ──────────
  'claude-sonnet': {
    nombre: 'Claude Sonnet 4.5',
    async analizar(base64Data, prompt) {
      return llamarAnthropic('claude-sonnet-4-5', base64Data, prompt);
    }
  },

  // ── Google Gemini (ejemplo — requiere GEMINI_API_KEY) ────────
  // Descomentar y configurar cuando quieras probarlo.
  /*
  'gemini': {
    nombre: 'Gemini 1.5 Pro',
    async analizar(base64Data, prompt) {
      return llamarGemini(base64Data, prompt);
    }
  },
  */

  // ── Modelo propio entrenado (futuro) ─────────────────────────
  /*
  'propio': {
    nombre: 'ColpoAId Model v1',
    async analizar(base64Data, prompt) {
      return llamarModeloPropio(base64Data, prompt);
    }
  },
  */
};


// ═══════════════════════════════════════════════════════════════
// IMPLEMENTACIONES DE CADA PROVEEDOR
// ═══════════════════════════════════════════════════════════════

// ── Anthropic (Claude) ──────────────────────────────────────────
async function llamarAnthropic(modelo, base64Data, prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Motor IA no configurado en el servidor (falta ANTHROPIC_API_KEY).');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error ${response.status}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ── Google Gemini (plantilla lista para usar a futuro) ──────────
/*
async function llamarGemini(base64Data, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY en el servidor.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
        ]
      }]
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error ${response.status}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
*/

// ── Modelo propio (plantilla para el futuro) ────────────────────
/*
async function llamarModeloPropio(base64Data, prompt) {
  const endpoint = process.env.MODELO_PROPIO_URL;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Data, prompt }),
  });
  const data = await response.json();
  return data.text || '';
}
*/


// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL — no hace falta tocar esto
// ═══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { image, prompt } = req.body;
    if (!image || !prompt) {
      return res.status(400).json({ error: 'Faltan datos (imagen o prompt).' });
    }

    const motor = MOTORES[MOTOR_ACTIVO];
    if (!motor) {
      return res.status(500).json({ error: `Motor "${MOTOR_ACTIVO}" no configurado.` });
    }

    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const text = await motor.analizar(base64Data, prompt);

    return res.status(200).json({ text, motor: motor.nombre });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno del servidor.' });
  }
}
