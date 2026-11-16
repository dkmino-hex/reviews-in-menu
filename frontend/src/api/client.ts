export type Category = { id: number; name: string };
export type DishInput = {
  category_id: number; name: string; description: string; ingredients: string;
  price: string; portion: string | null; unit: string | null; aliases: string[];
};
export type Tone = "positive" | "negative" | "neutral" | "mixed";
export type OpinionSummary = {
  sample: number;
  tones: Partial<Record<Tone, number>>;
  highlights: { label: string; tone: Exclude<Tone, "mixed">; count: number }[];
};
export type Dish = DishInput & {
  id: number;
  photo: string | null;
  average_rating: number | null;
  rating_count: number;
  review_excerpt: string | null;
  opinions: OpinionSummary;
};
export type User = { id: number; login: string; name: string; role: "visitor" | "admin" };
export type Visitor = User & { blocked: boolean };
export type AuditEvent = { id: number; actor_id: number; action: string; entity_type: string; entity_id: number; created_at: string; details: { reason?: string } };
export type Page<T> = { items: T[]; has_more: boolean };
export type Review = { id: number; rating: number; body: string; created_at: string; tone?: Tone | null };
export type ManagedReview = Review & {
  dish_id: number;
  dish_name: string;
  publication_state: "published" | "hidden" | "archived";
  version: number;
  moderation_reason: string | null;
  archived_at: string | null;
};

export class APIError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function api<T = void>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch("/api/v1" + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new APIError(response.status, body?.error ?? `Ошибка запроса (${response.status})`);
  }
  if (response.status === 204 || response.status === 201) return undefined as T;
  return response.json() as Promise<T>;
}

export function json<T = void>(path: string, method: string, body: object) {
  return api<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось выполнить запрос";
}
