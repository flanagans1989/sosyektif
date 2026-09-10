import { optionalEnv } from "../lib/env.js";

interface GraphQLResponse {
  data?: {
    viewer?: {
      zones?: {
        httpRequestsAdaptiveGroups?: {
          dimensions: { clientRequestPath: string };
          count: number;
        }[];
      }[];
    };
  };
  errors?: { message: string }[];
}

/**
 * Cloudflare GraphQL Analytics API'den son 7 günün sayfa yolu bazlı
 * istek sayılarını çeker. Cookie'siz, ücretsiz Web Analytics ile aynı veriye
 * dayanır (PLAN.md §3.7).
 */
export async function fetchPageviewsByPath(): Promise<Record<string, number>> {
  const token = optionalEnv("CLOUDFLARE_API_TOKEN");
  const zoneId = optionalEnv("CLOUDFLARE_ZONE_ID");
  if (!token || !zoneId) {
    console.warn("[analytics/cloudflare] CLOUDFLARE_API_TOKEN/ZONE_ID yok, atlanıyor");
    return {};
  }

  const simdi = new Date();
  const yediGunOnce = new Date(simdi.getTime() - 7 * 24 * 60 * 60 * 1000);

  const query = `
    query {
      viewer {
        zones(filter: { zoneTag: "${zoneId}" }) {
          httpRequestsAdaptiveGroups(
            filter: { datetime_geq: "${yediGunOnce.toISOString()}", datetime_leq: "${simdi.toISOString()}" }
            limit: 1000
          ) {
            dimensions { clientRequestPath }
            count
          }
        }
      }
    }`;

  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    console.warn(`[analytics/cloudflare] ${res.status}: ${await res.text()}`);
    return {};
  }

  const data = (await res.json()) as GraphQLResponse;
  if (data.errors?.length) {
    console.warn("[analytics/cloudflare] GraphQL hatası:", data.errors.map((e) => e.message).join("; "));
    return {};
  }

  const gruplar = data.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
  const sonuc: Record<string, number> = {};
  for (const grup of gruplar) {
    const yol = grup.dimensions.clientRequestPath.replace(/^\/|\/$/g, "");
    sonuc[yol] = (sonuc[yol] ?? 0) + grup.count;
  }
  return sonuc;
}
