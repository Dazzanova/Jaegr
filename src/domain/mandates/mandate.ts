import { z } from "zod";

/**
 * Validates a base58 Solana address (typically 32-44 base58 characters).
 */
export const solanaAddressSchema = z
  .string()
  .trim()
  .min(32, "Solana address too short")
  .max(44, "Solana address too long")
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid base58 Solana address character");

/**
 * Standard System Program Address in Solana.
 */
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

/**
 * Zod schema for Authorization Mandate input and validation.
 * Uses string representation for lamports to prevent JavaScript number precision loss.
 */
export const authorizationMandateSchema = z.object({
  id: z.string().min(1, "Mandate ID is required"),
  name: z.string().min(1, "Mandate name is required"),
  description: z.string().optional(),
  maxLamportsPerAction: z
    .string()
    .regex(/^\d+$/, "maxLamportsPerAction must be a non-negative integer string")
    .transform((val) => BigInt(val)),
  allowedRecipients: z.array(solanaAddressSchema).min(1, "At least one allowed recipient required"),
  allowedPrograms: z
    .array(solanaAddressSchema)
    .min(1, "At least one allowed program ID required")
    .default([SYSTEM_PROGRAM_ID]),
  permittedActionTypes: z
    .array(z.string().min(1))
    .min(1, "At least one permitted action type required")
    .default(["sol_transfer"]),
  seenActionIds: z.array(z.string()).default([])
});

export type AuthorizationMandateInput = z.input<typeof authorizationMandateSchema>;
export type AuthorizationMandate = z.output<typeof authorizationMandateSchema>;

/**
 * Helper to convert SOL (string or number) to Lamports (BigInt) safely without floating-point errors.
 */
export function solToLamports(solAmount: string | number): bigint {
  const str = typeof solAmount === "number" ? solAmount.toString() : solAmount.trim();
  const parts = str.split(".");
  if (parts.length > 2) {
    throw new Error(`Invalid SOL amount format: ${str}`);
  }
  const whole = parts[0] ? BigInt(parts[0]) : 0n;
  const fractionStr = parts[1] || "";
  if (fractionStr.length > 9) {
    throw new Error("Solana amounts support a maximum of 9 decimal places (lamports)");
  }
  const paddedFraction = fractionStr.padEnd(9, "0");
  const fraction = BigInt(paddedFraction);
  return whole * 1_000_000_000n + fraction;
}

/**
 * Helper to format Lamports into readable SOL string.
 */
export function lamportsToSolString(lamports: bigint): string {
  const isNegative = lamports < 0n;
  const abs = isNegative ? -lamports : lamports;
  const whole = abs / 1_000_000_000n;
  const fraction = abs % 1_000_000_000n;
  const fractionStr = fraction.toString().padStart(9, "0").replace(/0+$/, "");
  const formatted = fractionStr.length > 0 ? `${whole}.${fractionStr}` : `${whole}`;
  return isNegative ? `-${formatted}` : formatted;
}
