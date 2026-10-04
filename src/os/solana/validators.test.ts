import { describe, expect, it } from 'vitest';
import { combine, parseValidatorInfos, validatorName, VALIDATOR_INFO_KEY } from './validators';

const row = (identity: string, configData: Record<string, unknown>, first = VALIDATOR_INFO_KEY, type = 'validatorInfo') => ({
  pubkey: `info-${identity}`,
  account: { data: { parsed: { type, info: { keys: [{ pubkey: first, signer: false }, { pubkey: identity, signer: true }], configData } } } },
});

describe('validator info', () => {
  it('maps identities to published names, ignoring other config accounts', () => {
    const infos = parseValidatorInfos([
      row('Id1', { name: '  Helius ', website: 'https://helius.dev', iconUrl: 'https://x/icon.png' }),
      row('Id2', { name: 'Sneaky', iconUrl: 'javascript:alert(1)' }),
      row('Id3', { name: 'Not info' }, 'SomethingElse111111111111111111111111111111'),
      row('Id4', { name: 'Stake config' }, VALIDATOR_INFO_KEY, 'stakeConfig'),
    ]);
    expect(infos.get('Id1')).toEqual({ name: 'Helius', website: 'https://helius.dev', details: undefined, iconUrl: 'https://x/icon.png' });
    expect(infos.get('Id2')?.iconUrl).toBeUndefined();
    expect(infos.has('Id3')).toBe(false);
    expect(infos.has('Id4')).toBe(false);
  });

  it('keeps every validator, current and delinquent, and names them', () => {
    const va = (vote: string, node: string, stake: number) => ({ votePubkey: vote, nodePubkey: node, activatedStake: stake, commission: 5, lastVote: 1, epochVoteAccount: true });
    const vs = combine(
      { current: Array.from({ length: 450 }, (_, i) => va(`V${i}`, `N${i}`, i)), delinquent: [va('VD', 'ND', 9)] },
      new Map([['N3', { name: 'Named' }]]),
    );
    expect(vs).toHaveLength(451);
    expect(vs.find((v) => v.vote === 'VD')?.delinquent).toBe(true);
    expect(validatorName(vs[3])).toBe('Named');
    expect(validatorName(vs[4])).toBe('N4…N4');
  });
});
