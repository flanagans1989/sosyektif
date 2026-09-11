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

async function birGunlukVeriCek(
  token: string,
  zoneId: string,
  baslangic: Date,
  bitis: Date
): Promise<{ dimensions: { clientRequestPath: string }; count: number }[]> {
  const query = `
    query {
      viewer {
        zones(filter: { zoneTag: "${zoneId}" }) {
          httpRequestsAdaptiveGroups(
            filter: { datetime_geq: "${baslangic.toISOString()}", datetime_leq: "${bitis.toISOString()}" }
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
    return [];
  }

  const data = (await res.json()) as GraphQLResponse;
  if (data.errors?.length) {
    console.warn("[analytics/cloudflare] GraphQL hatası:", data.errors.map((e) => e.message).join("; "));
    return [];
  }

  return data.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
}

/**
 * Cloudflare GraphQL Analytics API'den son 7 günün sayfa yolu bazlı
 * istek sayılarını çeker. Cookie'siz, ücretsiz Web Analytics ile aynı veriye
 * dayanır (PLAN.md §3.7).
 *
 * Ücretsiz plan httpRequestsAdaptiveGroups sorgularını 1 günden geniş bir
 * aralıkla kabul etmiyor ("cannot request a time range wider than 1d"),
 * bu yüzden 7 günü ayrı ayrı sorgulayıp topluyoruz.
 */
export async function fetchPageviewsByPath(): Promise<Record<string, number>> {
  const token = optionalEnv("CLOUDFLARE_API_TOKEN");
  const zoneId = optionalEnv("CLOUDFLARE_ZONE_ID");
  if (!token || !zoneId) {
    console.warn("[analytics/cloudflare] CLOUDFLARE_API_TOKEN/ZONE_ID yok, atlanıyor");
    return {};
  }

  const simdi = new Date();
  const sonuc: Record<string, number> = {};

  for (let i = 0; i < 7; i++) {
    const bitis = new Date(simdi.getTime() - i * 24 * 60 * 60 * 1000);
    const baslangic = new Date(bitis.getTime() - 24 * 60 * 60 * 1000);
    const gruplar = await birGunlukVeriCek(token, zoneId, baslangic, bitis);
    for (const grup of gruplar) {
      const yol = grup.dimensions.clientRequestPath.replace(/^\/|\/$/g, "");
      sonuc[yol] = (sonuc[yol] ?? 0) + grup.count;
    }
  }

  return sonuc;
}
