type RedisResponse<T> = {
  result?: T;
  error?: string;
};

type RedisArg = string | number;

export function redisConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    "";
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function hasRedis(): boolean {
  return Boolean(redisConfig());
}

export async function redisCommand<T>(
  command: RedisArg[]
): Promise<T | null> {
  const redis = redisConfig();
  if (!redis) return null;

  const res = await fetch(redis.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redis.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const body = (await res.json().catch(() => ({}))) as RedisResponse<T>;
  if (!res.ok || body.error) {
    throw new Error(
      `Redis ${command[0]} failed: ${body.error ?? res.statusText}`
    );
  }
  return body.result ?? null;
}
