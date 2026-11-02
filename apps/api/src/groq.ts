export interface GroqConfig {
  key: string;
  model: string;
  url: string;
}

/** One JSON-mode chat completion; the reply text, or null when Groq is down, slow or says no. */
export async function groqJson(
  { key, model, url }: GroqConfig,
  messages: { role: "system" | "user"; content: string }[],
  options: { temperature: number; maxTokens: number },
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const response = await fetcher(`${url}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: options.temperature,
      max_completion_tokens: options.maxTokens,
      response_format: { type: "json_object" },
      messages,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return body?.choices?.[0]?.message?.content ?? null;
}
