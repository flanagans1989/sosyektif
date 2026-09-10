/**
 * Çoklu sağlayıcılı LLM yönlendirici (PLAN.md §4).
 *
 * Tek sağlayıcıya bağımlılık riski (Gemini'nin Aralık 2025'teki habersiz
 * kota kesintisi gibi) nedeniyle her çağrı bir fallback zincirinden geçer:
 * Gemini Flash-Lite -> Mistral -> Groq -> Cerebras. İlk başarılı yanıt
 * kullanılır; 429/5xx/anahtar eksikse sıradaki sağlayıcıya geçilir.
 */
import { optionalEnv } from "./env.js";

export type ProviderName = "gemini" | "mistral" | "groq" | "cerebras";

export interface ChatCompleteParams {
  systemPrompt: string;
  userPrompt: string;
  /** true ise sağlayıcıdan sıkı JSON çıktısı istenir (destekleyen sağlayıcılarda). */
  jsonMode?: boolean;
  /** Bu sağlayıcılar zincirden çıkarılır (örn. hakem modeli üreticiden farklı olsun diye). */
  exclude?: ProviderName[];
  temperature?: number;
}

export interface ChatCompleteResult {
  text: string;
  provider: ProviderName;
}

interface ProviderAdapter {
  name: ProviderName;
  isConfigured(): boolean;
  call(params: ChatCompleteParams): Promise<string>;
}

async function openAiCompatibleCall(
  baseUrl: string,
  apiKey: string,
  model: string,
  params: ChatCompleteParams
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.7,
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`${baseUrl} ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error(`${baseUrl}: boş yanıt`);
  return content;
}

const geminiAdapter: ProviderAdapter = {
  name: "gemini",
  isConfigured: () => optionalEnv("GEMINI_API_KEY") !== undefined,
  async call(params) {
    const apiKey = optionalEnv("GEMINI_API_KEY")!;
    const model = "gemini-3.5-flash-lite";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
          generationConfig: {
            temperature: params.temperature ?? 0.7,
            ...(params.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`gemini ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("gemini: boş yanıt");
    return text;
  },
};

const mistralAdapter: ProviderAdapter = {
  name: "mistral",
  isConfigured: () => optionalEnv("MISTRAL_API_KEY") !== undefined,
  call: (params) =>
    openAiCompatibleCall(
      "https://api.mistral.ai/v1",
      optionalEnv("MISTRAL_API_KEY")!,
      "mistral-small-latest",
      params
    ),
};

const groqAdapter: ProviderAdapter = {
  name: "groq",
  isConfigured: () => optionalEnv("GROQ_API_KEY") !== undefined,
  call: (params) =>
    openAiCompatibleCall(
      "https://api.groq.com/openai/v1",
      optionalEnv("GROQ_API_KEY")!,
      "openai/gpt-oss-120b",
      params
    ),
};

const cerebrasAdapter: ProviderAdapter = {
  name: "cerebras",
  isConfigured: () => optionalEnv("CEREBRAS_API_KEY") !== undefined,
  call: (params) =>
    openAiCompatibleCall(
      "https://api.cerebras.ai/v1",
      optionalEnv("CEREBRAS_API_KEY")!,
      "gpt-oss-120b",
      params
    ),
};

const PROVIDER_CHAIN: ProviderAdapter[] = [
  geminiAdapter,
  mistralAdapter,
  groqAdapter,
  cerebrasAdapter,
];

export class NoProviderAvailableError extends Error {
  constructor(public readonly attempts: { provider: ProviderName; error: string }[]) {
    super(
      "Hiçbir LLM sağlayıcısı yanıt vermedi:\n" +
        attempts.map((a) => `  - ${a.provider}: ${a.error}`).join("\n")
    );
    this.name = "NoProviderAvailableError";
  }
}

/** Zincirdeki sağlayıcıları sırayla dener, ilk başarılı yanıtı döner. */
export async function chatComplete(
  params: ChatCompleteParams
): Promise<ChatCompleteResult> {
  const attempts: { provider: ProviderName; error: string }[] = [];

  for (const adapter of PROVIDER_CHAIN) {
    if (params.exclude?.includes(adapter.name)) continue;
    if (!adapter.isConfigured()) {
      attempts.push({ provider: adapter.name, error: "API anahtarı yok" });
      continue;
    }
    try {
      const text = await adapter.call(params);
      return { text, provider: adapter.name };
    } catch (err) {
      attempts.push({
        provider: adapter.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw new NoProviderAvailableError(attempts);
}

/** Bir sağlayıcı adı verip, ondan FARKLI bir sağlayıcıdan yanıt zorunlu kılar (hakem modeli için). */
export async function chatCompleteExcluding(
  provider: ProviderName,
  params: Omit<ChatCompleteParams, "exclude">
): Promise<ChatCompleteResult> {
  return chatComplete({ ...params, exclude: [provider] });
}

export function anyProviderConfigured(): boolean {
  return PROVIDER_CHAIN.some((p) => p.isConfigured());
}
