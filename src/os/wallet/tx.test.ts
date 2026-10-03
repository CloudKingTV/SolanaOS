import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTransactionDecoder, getBase58Decoder } from '@solana/kit';
import { useWallet, type Connection } from './standard';
import { useSettings } from '../settings';
import { signAndSend, WalletError } from './tx';
import { solTransfer } from './send';

const ME = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const TO = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

function fakeWallet(sign: (bytes: Uint8Array) => Uint8Array) {
  const account = { address: ME, publicKey: new Uint8Array(32), chains: ['solana:devnet'], features: [] } as never;
  const wallet = {
    name: 'Fake',
    icon: 'data:image/svg+xml;base64,AA==',
    chains: ['solana:devnet'],
    accounts: [account],
    version: '1.0.0',
    features: {
      'solana:signTransaction': {
        version: '1.0.0',
        signTransaction: vi.fn(async (...inputs: { transaction: Uint8Array; chain?: string }[]) => inputs.map((i) => ({ signedTransaction: sign(i.transaction) }))),
      },
    },
  };
  useWallet.setState({ connection: { wallet, account, address: ME } as unknown as Connection });
  return wallet;
}

let sent: string[] = [];
beforeEach(() => {
  sent = [];
  useSettings.getState().update({ cluster: 'devnet', customRpcUrl: '', allowMainnetTransactions: false });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init: { body: string }) => {
      const { method, params, id } = JSON.parse(init.body);
      let result: unknown = null;
      if (method === 'getLatestBlockhash') result = { value: { blockhash: BLOCKHASH, lastValidBlockHeight: 100 } };
      if (method === 'sendTransaction') {
        sent.push(params[0]);
        result = 'Sig1111111111111111111111111111111111111111111111111111111111111111111111111111111111';
      }
      if (method === 'getSignatureStatuses') result = { value: [{ slot: 1, confirmations: 1, err: null, confirmationStatus: 'confirmed' }] };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  useWallet.setState({ connection: null });
});

describe('signAndSend', () => {
  it('compiles, asks the wallet to sign, then broadcasts through SolanaOS RPC', async () => {
    const wallet = fakeWallet((bytes) => {
      const out = bytes.slice();
      out.fill(7, 1, 65); // pretend signature
      return out;
    });
    const sig = await signAndSend(solTransfer(ME, TO, 1000n));
    expect(sig.startsWith('Sig')).toBe(true);
    const call = wallet.features['solana:signTransaction'].signTransaction.mock.calls[0][0];
    expect(call.chain).toBe('solana:devnet');
    const tx = getTransactionDecoder().decode(call.transaction);
    expect(Object.keys(tx.signatures)).toEqual([ME]);
    expect(sent).toHaveLength(1);
    expect(getBase58Decoder().decode(new Uint8Array(atob(sent[0]).split('').map((c) => c.charCodeAt(0))).slice(1, 65))).toBe(
      getBase58Decoder().decode(new Uint8Array(64).fill(7)),
    );
  });

  it('refuses mainnet writes until allowed', async () => {
    fakeWallet((b) => b);
    useSettings.getState().update({ cluster: 'mainnet-beta' });
    await expect(signAndSend(solTransfer(ME, TO, 1n))).rejects.toBeInstanceOf(WalletError);
    expect(sent).toHaveLength(0);
  });

  it('reports a cancelled signature request clearly', async () => {
    const wallet = fakeWallet((b) => b);
    wallet.features['solana:signTransaction'].signTransaction.mockRejectedValueOnce(new Error('User rejected the request.'));
    await expect(signAndSend(solTransfer(ME, TO, 1n))).rejects.toThrow('You cancelled the request in your wallet.');
  });
});
