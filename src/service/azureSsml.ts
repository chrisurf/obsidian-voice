/**
 * Azure-specific SSML adaptations.
 *
 * The content pipeline emits one "canonical" SSML dialect, flavoured for AWS
 * Polly. Azure departs from that dialect in two prosody attributes, so every
 * SSML chunk is adapted here before it is sent. Keeping the rules in pure,
 * unit-tested functions (rather than inline in the service) means a provider
 * incompatibility can be locked down with a test instead of being rediscovered
 * in the audio.
 *
 * - `rate`: Azure reads a BARE percentage as RELATIVE — `rate="95%"` is treated
 *   as `+95%` (≈ 1.95×), which made Azure read headings/emphasis at roughly
 *   double speed (issues #56 and #77). The pipeline means the percentage
 *   absolutely (95% = 0.95×, i.e. slightly slower), matching the SSML standard
 *   and AWS Polly / Google. So an unsigned absolute percentage is converted to
 *   the equivalent signed relative value (`95%` → `-5%`). Already-signed
 *   percentages and keyword/multiplier values are left untouched.
 * - `volume`: Azure prosody does not accept decibels; map `volume="±NdB"` to a
 *   bounded relative percentage.
 */

const RATE_ATTR = /rate="([^"]*)"/g;
const VOLUME_DB_ATTR = /volume="([+-]?\d+(?:\.\d+)?)dB"/g;
const UNSIGNED_PERCENT = /^(\d+(?:\.\d+)?)%$/;

/**
 * Convert a single prosody `rate` value to the form Azure interprets correctly.
 * An unsigned absolute percentage (the pipeline's output, e.g. "95%") becomes
 * the equivalent signed relative percentage ("-5%"); a signed percentage,
 * keyword (slow/fast/…) or bare multiplier passes through unchanged.
 */
export function azureProsodyRate(value: string): string {
  const match = UNSIGNED_PERCENT.exec(value.trim());
  if (!match) {
    return value;
  }
  const relative = Math.round((parseFloat(match[1]) - 100) * 100) / 100;
  return `${relative >= 0 ? "+" : ""}${relative}%`;
}

/**
 * Map a prosody `volume` in decibels to Azure's bounded relative percentage.
 */
export function azureProsodyVolumeDb(db: number): string {
  const pct = Math.max(-50, Math.min(50, Math.round(db * 10)));
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/**
 * Apply every Azure prosody adaptation to a chunk of inner SSML (the content
 * between <speak>…</speak>, before Azure's envelope is added).
 */
export function adaptProsodyForAzure(inner: string): string {
  return inner
    .replace(
      VOLUME_DB_ATTR,
      (_match, db: string) =>
        `volume="${azureProsodyVolumeDb(parseFloat(db))}"`,
    )
    .replace(
      RATE_ATTR,
      (_match, value: string) => `rate="${azureProsodyRate(value)}"`,
    );
}
