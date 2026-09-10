import type { z } from "zod";

/**
 * LLM'lerin JSON çıktısını toleranslı ayrıştırır: ```json kod bloğu ya da
 * JSON'un önüne/arkasına eklenmiş açıklama cümleleri olsa bile ilk '{' ile
 * son '}' arasını alır.
 */
export function parseJsonLoose<T>(text: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const temiz = text.replace(/```json/gi, "").replace(/```/g, "");
  const bas = temiz.indexOf("{");
  const son = temiz.lastIndexOf("}");
  const govde = bas >= 0 && son > bas ? temiz.slice(bas, son + 1) : temiz;
  return schema.parse(JSON.parse(govde));
}
