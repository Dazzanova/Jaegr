import { describe, expect, it } from "vitest";
import {
  assertWalletCanSign,
  describeWalletSigningError,
  isWalletRejection,
  WalletSigningError
} from "@/lib/wallet/signing-guard";

const DEVNET = "solana:devnet";

describe("wallet signing guard", () => {
  it("allows a connected Devnet wallet that supports solana:signTransaction", () => {
    expect(() =>
      assertWalletCanSign({
        connected: true,
        walletChain: DEVNET,
        hasSignTransactionFeature: true
      })
    ).not.toThrow();
  });

  it("blocks signing when the wallet is disconnected", () => {
    expect(() =>
      assertWalletCanSign({ connected: false, walletChain: null, hasSignTransactionFeature: false })
    ).toThrow(WalletSigningError);

    try {
      assertWalletCanSign({ connected: false, walletChain: null, hasSignTransactionFeature: false });
    } catch (error) {
      expect((error as WalletSigningError).code).toBe("DISCONNECTED");
    }
  });

  it("blocks signing when the wallet is not on Devnet", () => {
    try {
      assertWalletCanSign({
        connected: true,
        walletChain: "solana:mainnet",
        hasSignTransactionFeature: true
      });
      throw new Error("expected the guard to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WalletSigningError);
      expect((error as WalletSigningError).code).toBe("NETWORK_MISMATCH");
    }
  });

  it("blocks signing when the wallet lacks solana:signTransaction", () => {
    try {
      assertWalletCanSign({
        connected: true,
        walletChain: DEVNET,
        hasSignTransactionFeature: false
      });
      throw new Error("expected the guard to throw");
    } catch (error) {
      expect((error as WalletSigningError).code).toBe("UNSUPPORTED_SIGNING");
    }
  });

  it("detects wallet rejection and cancellation messages", () => {
    expect(isWalletRejection("User rejected the request")).toBe(true);
    expect(isWalletRejection("Approval denied by wallet")).toBe(true);
    expect(isWalletRejection("Transaction was cancelled")).toBe(true);
    expect(isWalletRejection("RPC timeout while sending")).toBe(false);
  });

  it("describes wallet rejection and disconnection honestly", () => {
    expect(describeWalletSigningError("User rejected the request")).toMatch(
      /rejected or cancelled/i
    );
    expect(describeWalletSigningError("Wallet disconnected during signing")).toMatch(
      /disconnected/i
    );
    expect(describeWalletSigningError("RPC timeout")).toBe("RPC timeout");
  });
});
