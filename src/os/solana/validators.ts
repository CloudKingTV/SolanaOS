// Validators with their self-published names (validator-info records in the Config program).
import { getVoteAccounts, rpc, type VoteAccount } from './rpc';
import { rpcUrlFor, useSettings } from '../settings';

export const CONFIG_PROGRAM = 'Config1111111111111111111111111111111111111';
export const VALIDATOR_INFO_KEY = 'Va1idator1nfo111111111111111111111111111111';

export interface ValidatorInfo {
  name?: string;
  website?: string;
  details?: string;
  iconUrl?: string;
}

export interface Validator {
  vote: string;
  identity: string;
  commission: number;
  activatedStake: number;
  lastVote: number;
  delinquent: boolean;
  info: ValidatorInfo | null;
}

interface RawInfo {
  pubkey: string;
  account: {
    data: {
      parsed?: {
        type?: string;
        info?: { keys?: { pubkey: string; signer: boolean }[]; configData?: Record<string, unknown> };
      };
    };
  };
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Map of validator identity → published info. Records can be spoofed by anyone for their own identity only. */
export function parseValidatorInfos(rows: RawInfo[]): Map<string, ValidatorInfo> {
  const out = new Map<string, ValidatorInfo>();
  for (const r of rows) {
    const p = r.account.data.parsed;
    if (p?.type !== 'validatorInfo') continue;
    const keys = p.info?.keys ?? [];
    if (keys[0]?.pubkey !== VALIDATOR_INFO_KEY) continue;
    const identity = keys.find((k, i) => i > 0 && k.signer)?.pubkey;
    if (!identity) continue;
    const d = p.info?.configData ?? {};
    const icon = str(d.iconUrl, 500);
    out.set(identity, {
      name: str(d.name, 80),
      website: str(d.website, 200),
      details: str(d.details, 300),
      iconUrl: icon && /^https:\/\//i.test(icon) ? icon : undefined,
    });
  }
  return out;
}

const infoCache = new Map<string, Promise<Map<string, ValidatorInfo>>>();

export function getValidatorInfos(): Promise<Map<string, ValidatorInfo>> {
  const endpoint = rpcUrlFor(useSettings.getState());
  let p = infoCache.get(endpoint);
  if (!p) {
    p = rpc<RawInfo[]>('getProgramAccounts', [CONFIG_PROGRAM, { encoding: 'jsonParsed' }])
      .then(parseValidatorInfos)
      .catch(() => {
        infoCache.delete(endpoint);
        return new Map<string, ValidatorInfo>();
      });
    infoCache.set(endpoint, p);
  }
  return p;
}

export function combine(vote: { current: VoteAccount[]; delinquent: VoteAccount[] }, infos: Map<string, ValidatorInfo>): Validator[] {
  const row = (v: VoteAccount, delinquent: boolean): Validator => ({
    vote: v.votePubkey,
    identity: v.nodePubkey,
    commission: v.commission,
    activatedStake: v.activatedStake,
    lastVote: v.lastVote,
    delinquent,
    info: infos.get(v.nodePubkey) ?? null,
  });
  return [...vote.current.map((v) => row(v, false)), ...vote.delinquent.map((v) => row(v, true))];
}

/** All vote accounts (current and delinquent), with names when available. */
export async function getValidators(): Promise<Validator[]> {
  const [votes, infos] = await Promise.all([getVoteAccounts(), getValidatorInfos()]);
  return combine(votes, infos);
}

export function validatorName(v: Validator): string {
  return v.info?.name ?? `${v.identity.slice(0, 4)}…${v.identity.slice(-4)}`;
}
