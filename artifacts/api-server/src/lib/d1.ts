// Cloudflare D1 REST API client
// Docs: https://developers.cloudflare.com/d1/platform/client-api/

const CF_API = "https://api.cloudflare.com/client/v4";

function getConfig() {
  const accountId = process.env["CF_ACCOUNT_ID"];
  const databaseId = process.env["CF_D1_DATABASE_ID"];
  const apiToken = process.env["CF_API_TOKEN"];
  if (!accountId || !databaseId || !apiToken) {
    throw new Error("Cloudflare D1 não configurado. Defina CF_ACCOUNT_ID, CF_D1_DATABASE_ID e CF_API_TOKEN.");
  }
  return { accountId, databaseId, apiToken };
}

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: {
    changed_db: boolean;
    changes: number;
    duration: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
    served_by: string;
    size_after: number;
  };
}

interface D1Response<T = Record<string, unknown>> {
  result: D1Result<T>[];
  success: boolean;
  errors: { code: number; message: string }[];
  messages: string[];
}

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null | boolean)[] = []
): Promise<T[]> {
  const { accountId, databaseId, apiToken } = getConfig();
  const url = `${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`D1 HTTP ${res.status}: ${text}`);
  }

  const data = await res.json() as D1Response<T>;

  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") ?? "D1 error";
    throw new Error(`D1 query error: ${msg}`);
  }

  return data.result?.[0]?.results ?? [];
}

export async function d1Run(
  sql: string,
  params: (string | number | null | boolean)[] = []
): Promise<{ changes: number; last_row_id: number }> {
  const { accountId, databaseId, apiToken } = getConfig();
  const url = `${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`D1 HTTP ${res.status}: ${text}`);
  }

  const data = await res.json() as D1Response;

  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") ?? "D1 error";
    throw new Error(`D1 run error: ${msg}`);
  }

  const meta = data.result?.[0]?.meta;
  return { changes: meta?.changes ?? 0, last_row_id: meta?.last_row_id ?? 0 };
}

export async function d1Batch(
  statements: { sql: string; params?: (string | number | null | boolean)[] }[]
): Promise<void> {
  const { accountId, databaseId, apiToken } = getConfig();
  const url = `${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`;

  for (const stmt of statements) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: stmt.sql, params: stmt.params ?? [] }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`D1 batch HTTP ${res.status}: ${text}`);
    }
  }
}

export function isD1Configured(): boolean {
  return !!(
    process.env["CF_ACCOUNT_ID"] &&
    process.env["CF_D1_DATABASE_ID"] &&
    process.env["CF_API_TOKEN"]
  );
}
