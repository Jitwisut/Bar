/**
 * Build a Thai PromptPay QR payload (EMVCo / Bank of Thailand standard).
 * Pure, no dependencies. Feed the returned string into makeQrDataUrl().
 *
 * Supports mobile number or 13-digit national/tax ID as the target.
 * If amount > 0 the QR is a one-time "dynamic" payment for that exact amount.
 */

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Normalise a Thai target ID to the AID sub-tag format. */
function formatTarget(id: string): { tag: string; value: string } | null {
  const digits = id.replace(/[^0-9]/g, "");
  if (digits.length === 13) {
    // National ID / tax ID
    return { tag: "02", value: digits };
  }
  if (digits.length === 10 || digits.length === 9) {
    // Mobile number → 0066 + number without leading 0
    const local = digits.replace(/^0/, "");
    return { tag: "01", value: `0066${local}` };
  }
  return null;
}

export function promptPayPayload(id: string, amountBaht = 0): string | null {
  const target = formatTarget(id);
  if (!target) return null;

  const merchantAccount = tlv(
    "29",
    tlv("00", "A000000677010111") + tlv(target.tag, target.value)
  );

  const amountField =
    amountBaht > 0 ? tlv("54", amountBaht.toFixed(2)) : "";

  const payload =
    tlv("00", "01") + // payload format indicator
    tlv("01", amountBaht > 0 ? "12" : "11") + // 11 = static, 12 = dynamic (one-time)
    merchantAccount +
    tlv("53", "764") + // currency THB
    amountField +
    tlv("58", "TH"); // country

  const withCrcTag = `${payload}6304`;
  return withCrcTag + crc16(withCrcTag);
}
