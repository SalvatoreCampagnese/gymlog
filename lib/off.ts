import "server-only";

export type FoodHit = {
  key: string;
  name: string;
  brand?: string;
  barcode?: string;
  image?: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  servingGrams?: number;
  source: "off" | "generic";
};

const UA = "GymLog/1.0 (personal training tracker)";
const FIELDS = "code,product_name,product_name_it,generic_name_it,brands,nutriments,serving_quantity,image_small_url,image_front_small_url";

const r1 = (n: number) => Math.round(n * 10) / 10;

function nut(n: any, k: string): number | null {
  const v = n?.[`${k}_100g`];
  const x = typeof v === "string" ? parseFloat(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export function mapProduct(p: any): FoodHit | null {
  if (!p) return null;
  const n = p.nutriments ?? {};
  let kcal = nut(n, "energy-kcal");
  if (kcal === null) {
    const kj = nut(n, "energy-kj") ?? nut(n, "energy");
    if (kj !== null) kcal = kj / 4.184;
  }
  const protein = nut(n, "proteins");
  const carbs = nut(n, "carbohydrates");
  const fat = nut(n, "fat");
  const name = (p.product_name_it || p.product_name || p.generic_name_it || "").trim();
  if (!name || kcal === null) return null;
  const sq = parseFloat(p.serving_quantity);
  return {
    key: `off:${p.code || name}`,
    name,
    brand: (p.brands || "").split(",")[0]?.trim() || undefined,
    barcode: p.code || undefined,
    image: p.image_front_small_url || p.image_small_url || undefined,
    per100: { kcal: Math.round(kcal), protein: r1(protein ?? 0), carbs: r1(carbs ?? 0), fat: r1(fat ?? 0) },
    servingGrams: Number.isFinite(sq) && sq > 0 ? sq : undefined,
    source: "off",
  };
}

async function fetchJson(url: string, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`risposta non JSON (${text.slice(0, 60)})`);
    }
  } catch (e: any) {
    throw new Error(e?.name === "AbortError" ? "timeout" : String(e?.message ?? e));
  } finally {
    clearTimeout(t);
  }
}

const memo = new Map<string, { at: number; hits: FoodHit[] }>();

/** Queries both Open Food Facts search backends in parallel and merges the results. */
export async function searchOFF(q: string): Promise<{ hits: FoodHit[]; errors: string[] }> {
  const key = q.toLowerCase().trim();
  const cached = memo.get(key);
  if (cached && Date.now() - cached.at < 3600_000) return { hits: cached.hits, errors: [] };
  const enc = encodeURIComponent(q);
  const [sal, cgi] = await Promise.allSettled([
    fetchJson(`https://search.openfoodfacts.org/search?q=${enc}&langs=it,en&page_size=24&fields=${FIELDS}`, 8000).then(
      (j) =>
        (j.hits ?? [])
          .map((h: any) =>
            mapProduct({
              ...h,
              product_name: typeof h.product_name === "object" ? h.product_name?.it ?? h.product_name?.en ?? Object.values(h.product_name ?? {})[0] : h.product_name,
              brands: Array.isArray(h.brands) ? h.brands.join(",") : h.brands,
            })
          )
          .filter(Boolean) as FoodHit[]
    ),
    fetchJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=24&lc=it&fields=${FIELDS}`,
      9000
    ).then((j) => (j.products ?? []).map(mapProduct).filter(Boolean) as FoodHit[]),
  ]);
  const errors: string[] = [];
  const seen = new Set<string>();
  const hits: FoodHit[] = [];
  for (const [label, r] of [["search", sal], ["cgi", cgi]] as const) {
    if (r.status === "rejected") {
      errors.push(`${label}: ${r.reason?.message ?? r.reason}`);
      continue;
    }
    for (const h of r.value) {
      const k = h.barcode || h.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      hits.push(h);
    }
  }
  if (hits.length || !errors.length) memo.set(key, { at: Date.now(), hits });
  if (memo.size > 300) memo.delete(memo.keys().next().value!);
  return { hits, errors: hits.length ? [] : errors };
}

export async function barcodeOFF(code: string): Promise<FoodHit | null> {
  const clean = code.replace(/\D/g, "");
  if (!clean) return null;
  const j = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${FIELDS}`);
  if (j.status !== 1 && j.status !== "success") return null;
  return mapProduct({ ...j.product, code: clean });
}
