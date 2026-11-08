import {
  bytesEqual,
  getBase64Encoder,
  getBase58Decoder,
  getTransactionDecoder,
  type Base64EncodedWireTransaction
} from "@solana/kit";

export interface DecodedWireTransaction {
  messageBytes: Uint8Array;
  feePayer: string;
  signature: string;
  signatureCount: number;
}

function decodeWireTransaction(wireTransactionBase64: string, requireSignature: boolean): DecodedWireTransaction {
  const bytes = getBase64Encoder().encode(wireTransactionBase64);
  const transaction = getTransactionDecoder().decode(bytes);
  const entries = Object.entries(transaction.signatures);
  const [feePayerEntry] = entries;

  if (!feePayerEntry) {
    throw new Error("Transaction is missing its fee-payer account");
  }
  if (requireSignature && !feePayerEntry[1]) {
    throw new Error("Signed transaction is missing its fee-payer signature");
  }

  return {
    messageBytes: Uint8Array.from(transaction.messageBytes),
    feePayer: feePayerEntry[0],
    signature: feePayerEntry[1] ? getBase58Decoder().decode(feePayerEntry[1]) : "",
    signatureCount: entries.length
  };
}

export function validateSignedWireTransaction(input: {
  signedWireTransaction: string;
  unsignedWireTransaction: string;
  expectedFeePayer: string;
}): DecodedWireTransaction {
  const expected = decodeWireTransaction(input.unsignedWireTransaction, false);
  const signed = decodeWireTransaction(input.signedWireTransaction, true);

  if (expected.feePayer !== input.expectedFeePayer || signed.feePayer !== input.expectedFeePayer) {
    throw new Error("Signed transaction fee payer does not match the connected wallet");
  }

  if (!bytesEqual(expected.messageBytes, signed.messageBytes)) {
    throw new Error("Signed transaction message differs from the inspected proposal");
  }

  return signed;
}

export function asBase64EncodedWireTransaction(value: string): Base64EncodedWireTransaction {
  return value as Base64EncodedWireTransaction;
}
