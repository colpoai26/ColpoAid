// ═══════════════════════════════════════════════════════════════
// ███  BANCO DE PRUEBA — COMPARADOR DE MOTORES IA  ███
// ███  ColpoAId / MedicAId                          ███
// ═══════════════════════════════════════════════════════════════
// Proxy SEPARADO del de producción (analyze.js NO se toca).
// Recibe una imagen y la corre por VARIOS motores a la vez.
// Devuelve, por cada motor: descripción + grado arriesgado.
//
// Las API keys viven en variables de entorno de Vercel:
//   ANTHROPIC_API_KEY  → ya existe
//   GEMINI_API_KEY     → ya existe
//   OPENAI_API_KEY     → agregar cuando quieras activar GPT
//
// ─── MOTORES A COMPARAR ──────────────────────────────────────────
// Para activar GPT: agregá 'gpt' a esta lista Y cargá OPENAI_API_KEY
// en Vercel. Nada más que tocar.
const MOTORES_A_COMPARAR = ['claude', 'gemini'];   // + 'gpt' cuando quieras
// ═══════════════════════════════════════════════════════════════


// ─── PROMPT COMPARATIVO ──────────────────────────────────────────
// Pide las DOS cosas: descripción (como la app) + grado arriesgado
// (solo para este laboratorio de comparación, NO es lo que la app hace).
function construirPrompt() {
  return `Sos un asistente que analiza imágenes de colposcopía para una EVALUACIÓN DE LABORATORIO (comparación de modelos). Respondé ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, con esta estructura exacta:

{
  "descripcion": "Descripción objetiva de lo que se observa, en lenguaje clínico descriptivo: epitelio acetoblanco (densidad, bordes), patrón de mosaico (fino/grueso), punteado, vasos, unión escamocolumnar, yodo. Describí ubicación y características. NO uses términos diagnósticos acá.",
  "grado_arriesgado": "SOLO para esta comparación de laboratorio, arriesgá tu mejor estimación de grado histológico esperable, eligiendo UNA opción: Normal | CIN I (bajo grado) | CIN II (alto grado) | CIN III (alto grado) | Carcinoma | Insatisfactoria/No valorable",
  "confianza": "Alta | Media | Baja"
}

Reglas:
- "descripcion": lenguaje descriptivo, sin diagnosticar.
- "grado_arriesgado": es una apuesta de laboratorio para medir desempeño contra biopsia conocida. Elegí una sola categoría de la lista.
- Si la imagen no es colposcópica o es inevaluable, poné grado "Insatisfactoria/No valorable".
- Respondé SOLO el JSON.`;
}


// ═══════════════════════════════════════════════════════════════
// IMPLEMENTACIONES POR PROVEEDOR
// Cada una recibe (base64Data, prompt) y devuelve TEXTO crudo.
// ═══════════════════════════════════════════════════════════════

// ── Anthropic (Claude) ──────────────────────────────────────────
async function llamarClaude(base64Data, prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `Error ${r.status}`); }
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

// ── Google Gemini ───────────────────────────────────────────────
async function llamarGemini(base64Data, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: base64Data } },
        ],
      }],
      generationConfig: { maxOutputTokens: 1500 },
    }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `Error ${r.status}`); }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── OpenAI (GPT) — LISTO PARA ACTIVAR ───────────────────────────
// Para usarlo: agregá 'gpt' a MOTORES_A_COMPARAR y cargá OPENAI_API_KEY en Vercel.
async function llamarGPT(base64Data, prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
        ],
      }],
    }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `Error ${r.status}`); }
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

// Mapa de motores → su función + nombre lindo
const IMPL = {
  claude: { nombre: 'Claude Opus 4.5', fn: llamarClaude },
  gemini: { nombre: 'Gemini 2.0 Flash', fn: llamarGemini },
  gpt:    { nombre: 'GPT-4o',           fn: llamarGPT },
};


// ─── Limpiar y parsear el JSON que devuelve cada motor ──────────
function procesar(texto) {
  if (!texto) return { descripcion: '(sin respuesta)', grado_arriesgado: '—', confianza: '—' };
  let limpio = texto.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(limpio);
  } catch (e) {
    const i = limpio.indexOf('{'), j = limpio.lastIndexOf('}');
    if (i >= 0 && j > i) { try { return JSON.parse(limpio.slice(i, j + 1)); } catch (e2) {} }
    // Si no es JSON, devolver el texto crudo como descripción
    return { descripcion: limpio.slice(0, 600), grado_arriesgado: '(no estructurado)', confianza: '—' };
  }
}


// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Falta la imagen.' });

    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const prompt = construirPrompt();

    // Correr todos los motores EN PARALELO
    const resultados = {};
    await Promise.all(MOTORES_A_COMPARAR.map(async (clave) => {
      const motor = IMPL[clave];
      if (!motor) { resultados[clave] = { nombre: clave, error: 'Motor no definido' }; return; }
      const t0 = Date.now();
      try {
        const crudo = await motor.fn(base64Data, prompt);
        const parsed = procesar(crudo);
        resultados[clave] = {
          nombre: motor.nombre,
          descripcion: parsed.descripcion || '—',
          grado: parsed.grado_arriesgado || '—',
          confianza: parsed.confianza || '—',
          ms: Date.now() - t0,
        };
      } catch (err) {
        resultados[clave] = { nombre: motor.nombre, error: err.message, ms: Date.now() - t0 };
      }
    }));

    return res.status(200).json({ resultados });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno.' });
  }
}
