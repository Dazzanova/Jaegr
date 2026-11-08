/**
 * Pure, testable guard for the client-side wallet signing preconditions.
 *
 * This module deliberately contains no React or wallet SDK calls so that the
 * decision "may we ask this wallet to sign?" can be unit tested
 * deterministically. Wallet Standard invocation stays in `WalletContext`.
 */

export type WalletSigningErrorCode =
  | "DISCONNECTED"
  | "NETWORK_MISMATCH"
  | "UNSUPPORTED_SIGNING";

export class WalletSigningError extends Error {
  readonly code: WalletSigningErrorCode;

  constructor(code: WalletSigningErrorCode, message: string) {
    super(message);
    this.name = "WalletSigningError";
    this.code = code;
  }
}

export interface WalletSigningCapability {
  connected: boolean;
  /** Chain advertised by the connected account, e.g. `solana:devnet`. */
  walletChain: string | null;
  hasSignTransactionFeature: boolean;
}

/**
 * Throws unless the wallet is connected, on Devnet, and able to sign.
 * The server independently re-checks the cluster; this is a client-side
 * fail-fast guard, not the security boundary.
 */
export function assertWalletCanSign(capability: WalletSigningCapability): void {
  if (!capability.connected) {
    throw new WalletSigningError(
      "DISCONNECTED",
      "The wallet disconnected before signing. Reconnect it and prepare again."
    );
  }

  if (capability.walletChain !== "solana:devnet") {
    throw new WalletSigningError(
      "NETWORK_MISMATCH",
      "The connected wallet is not on Solana Devnet. Switch the wallet network to Devnet and reconnect."
    );
  }

  if (!capability.hasSignTransactionFeature) {
    throw new WalletSigningError(
      "UNSUPPORTED_SIGNING",
      "The connected wallet does not support solana:signTransaction."
    );
  }
}

/** True when an error message means the user rejected or cancelled the prompt. */
export function isWalletRejection(message: string): boolean {
  return /reject|denied|cancel/i.test(message);
}

/** True when an error message means the wallet disconnected mid-flow. */
export function isWalletDisconnection(message: string): boolean {
  return /disconnect/i.test(message);
}

/**
 * Turns a raw error message into a precise, non-misleading status message.
 * Unknown errors are returned unchanged rather than being relabelled.
 */
export function describeWalletSigningError(message: string): string {
  if (isWalletRejection(message)) {
    return `Wallet approval was rejected or cancelled: ${message}`;
  }
  if (isWalletDisconnection(message)) {
    return `The wallet disconnected during signing: ${message}`;
  }
  return message;
}
