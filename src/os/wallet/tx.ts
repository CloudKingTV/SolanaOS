// Build, sign (in the user's wallet) and send transactions.
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
  type TransactionSigner,
  type Transaction,
} from '@solana/kit';
import { chainFor, clusterLabel, useSettings } from '../settings';
import { confirmSignature, getLatestBlockhash, sendRawTransaction } from '../solana/rpc';
import { SIGN_AND_SEND, SIGN_MESSAGE, SIGN_TX, feature, useWallet, type SignAndSendFeature, type SignMessageFeature, type SignTxFeature } from './standard';

export class WalletError extends Error {}

/** A signer placeholder for building messages; the real signature comes from the wallet. */
export function walletSigner(): TransactionSigner {
  const conn = useWallet.getState().connection;
  if (!conn) throw new WalletError('Connect a wallet first.');
  return createNoopSigner(address(conn.address));
}

export function assertCanWrite() {
  const s = useSettings.getState();
  if (chainFor(s) === 'solana:mainnet' && !s.allowMainnetTransactions) {
    throw new WalletError(
      `SolanaOS is connected to ${clusterLabel(s.cluster)}, where transactions move real funds. Turn on "Allow transactions on Mainnet" in Network Settings first.`,
    );
  }
}

/** Compile instructions into an unsigned transaction paid for by the connected wallet. */
export async function buildTransaction(instructions: Instruction[]): Promise<Transaction> {
  const payer = walletSigner();
  const { blockhash, lastValidBlockHeight } = await getLatestBlockhash();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash as never, lastValidBlockHeight: BigInt(lastValidBlockHeight) }, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return compileTransaction(message);
}

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(msg)) return new WalletError('You cancelled the request in your wallet.');
  return e instanceof Error ? e : new Error(msg);
}

/**
 * Ask the wallet to sign one or more transactions, then send them through SolanaOS's RPC
 * (so they land on the cluster SolanaOS is showing). Returns signatures in order.
 */
export async function signAndSendAll(
  txs: Transaction[],
  onProgress?: (done: number, total: number, signature: string) => void,
): Promise<string[]> {
  assertCanWrite();
  const conn = useWallet.getState().connection;
  if (!conn) throw new WalletError('Connect a wallet first.');
  const chain = chainFor(useSettings.getState());
  const encoder = getTransactionEncoder();
  const bytes = txs.map((t) => new Uint8Array(encoder.encode(t)));
  const signatures: string[] = [];

  const signTx = feature<SignTxFeature>(conn.wallet, SIGN_TX);
  if (signTx) {
    let signed: readonly { signedTransaction: Uint8Array }[];
    try {
      signed = await signTx.signTransaction(...bytes.map((transaction) => ({ account: conn.account, transaction, chain })));
    } catch (e) {
      throw friendly(e);
    }
    const decoder = getTransactionDecoder();
    for (const out of signed) {
      const tx = decoder.decode(out.signedTransaction);
      const sig = await sendRawTransaction(getBase64EncodedWireTransaction(tx));
      await confirmSignature(sig);
      signatures.push(sig);
      onProgress?.(signatures.length, txs.length, sig);
    }
    return signatures;
  }

  const signAndSend = feature<SignAndSendFeature>(conn.wallet, SIGN_AND_SEND);
  if (!signAndSend) throw new WalletError(`${conn.wallet.name} can't sign transactions.`);
  const b58 = getBase58Decoder();
  for (const transaction of bytes) {
    let out: readonly { signature: Uint8Array }[];
    try {
      out = await signAndSend.signAndSendTransaction({ account: conn.account, transaction, chain });
    } catch (e) {
      throw friendly(e);
    }
    const sig = b58.decode(out[0].signature);
    await confirmSignature(sig);
    signatures.push(sig);
    onProgress?.(signatures.length, txs.length, sig);
  }
  return signatures;
}

export async function signAndSend(instructions: Instruction[]): Promise<string> {
  assertCanWrite();
  const [sig] = await signAndSendAll([await buildTransaction(instructions)]);
  return sig;
}

export async function signMessage(text: string): Promise<{ address: string; signature: string }> {
  const conn = useWallet.getState().connection;
  if (!conn) throw new WalletError('Connect a wallet first.');
  const f = feature<SignMessageFeature>(conn.wallet, SIGN_MESSAGE);
  if (!f) throw new WalletError(`${conn.wallet.name} doesn't support signing messages.`);
  try {
    const [out] = await f.signMessage({ account: conn.account, message: new TextEncoder().encode(text) });
    return { address: conn.address, signature: getBase58Decoder().decode(out.signature) };
  } catch (e) {
    throw friendly(e);
  }
}
