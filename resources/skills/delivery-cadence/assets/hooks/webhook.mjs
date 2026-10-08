/** Register after setting CADENCE_WEBHOOK_URL (and optional CADENCE_WEBHOOK_TOKEN). */
export default async function run(event, { signal, idempotencyKey, env }) {
  if (!env.CADENCE_WEBHOOK_URL) return { status: 'failed', effects: 'none' };
  const url = new URL(env.CADENCE_WEBHOOK_URL);
  if (url.protocol !== 'https:') return { status: 'failed', effects: 'none' };
  const headers = { 'content-type': 'application/json', 'idempotency-key': idempotencyKey };
  if (env.CADENCE_WEBHOOK_TOKEN) headers.authorization = `Bearer ${env.CADENCE_WEBHOOK_TOKEN}`;
  const response = await fetch(url, { method: 'POST', signal, headers, body: JSON.stringify(event) });
  if (!response.ok) throw new Error('Webhook did not confirm acceptance.');
  return { status: 'succeeded' };
}
