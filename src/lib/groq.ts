type ConvertArgs = {
  apiKey: string;
  model: string;
  imageDataUrl: string;
};

function extractCode(s: string) {
  const t = s.trim();
  if (!t.includes("```")) return t;
  const parts = t.split("```");
  if (parts.length < 3) return t.replace(/```/g, "").trim();
  return parts[1].replace(/^\w+\n/, "").trim();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function convertHandwritingToPython({ apiKey, model, imageDataUrl }: ConvertArgs) {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_completion_tokens: 1024,
          messages: [
            {
              role: "system",
              content: "Transcribe the handwritten Python code exactly as written. Output only the Python code, no markdown, no explanations. Do not add, remove, or modify any code. Do not define missing variables or add error handling. Transcribe exactly what you see.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Transcribe this handwritten Python code:" },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
        }),
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Groq API error ${r.status}${txt ? `: ${txt.slice(0, 300)}` : ""}`);
      }

      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const content = j?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("Empty model response");
      return extractCode(content);
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Groq request failed");
}

