import { isLikelyAddress, isLikelySignature } from '../../os/solana/rpc';

export type Route = { kind: 'home' } | { kind: 'address'; id: string } | { kind: 'tx'; id: string } | { kind: 'invalid'; input: string };

/** Accepts sol:// URLs, bare addresses/signatures, and explorer.solana.com / solscan links. */
export function parseRoute(input: string): Route {
  const s = input.trim();
  if (!s || /^sol:\/\/home\/?$/i.test(s) || /^about:home$/i.test(s)) return { kind: 'home' };
  const m = s.match(/(?:^sol:\/\/|\/)(address|account|token|tx)\/([1-9A-HJ-NP-Za-km-z]+)/i);
  if (m) {
    const kind = m[1].toLowerCase() === 'tx' ? 'tx' : 'address';
    const id = m[2];
    if (kind === 'tx' ? isLikelySignature(id) : isLikelyAddress(id)) return { kind, id };
    return { kind: 'invalid', input: s };
  }
  if (isLikelySignature(s)) return { kind: 'tx', id: s };
  if (isLikelyAddress(s)) return { kind: 'address', id: s };
  return { kind: 'invalid', input: s };
}

export function routeUrl(r: Route): string {
  switch (r.kind) {
    case 'home':
      return 'sol://home';
    case 'address':
      return `sol://address/${r.id}`;
    case 'tx':
      return `sol://tx/${r.id}`;
    case 'invalid':
      return r.input;
  }
}
