import { useMemo, useState } from 'react';
import type { Validator } from '../os/solana/validators';
import { validatorName } from '../os/solana/validators';
import { formatSol } from '../os/solana/rpc';

type SortKey = 'stake' | 'commission' | 'name';

function Avatar({ v }: { v: Validator }) {
  const [broken, setBroken] = useState(false);
  if (!v.info?.iconUrl || broken)
    return <span className="vl-avatar fallback">{validatorName(v).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?'}</span>;
  return <img className="vl-avatar" src={v.info.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

/** Searchable, sortable list of every validator. */
export function ValidatorList({
  validators,
  selected,
  onSelect,
  showDelinquentToggle = true,
  height,
}: {
  validators: Validator[];
  selected?: string | null;
  onSelect?: (vote: string) => void;
  showDelinquentToggle?: boolean;
  height?: number;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'stake', desc: true });
  const [showDelinquent, setShowDelinquent] = useState(false);
  const total = useMemo(() => validators.filter((v) => !v.delinquent).reduce((s, v) => s + v.activatedStake, 0), [validators]);
  const delinquentCount = validators.filter((v) => v.delinquent).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = validators.filter(
      (v) =>
        (showDelinquent || !v.delinquent) &&
        (!q || validatorName(v).toLowerCase().includes(q) || v.vote.toLowerCase().includes(q) || v.identity.toLowerCase().includes(q) || (v.info?.website ?? '').toLowerCase().includes(q)),
    );
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      if (sort.key === 'name') return dir * validatorName(a).localeCompare(validatorName(b));
      if (sort.key === 'commission') return dir * (a.commission - b.commission) || b.activatedStake - a.activatedStake;
      return dir * (a.activatedStake - b.activatedStake);
    });
  }, [validators, query, sort, showDelinquent]);

  const header = (key: SortKey, label: string, num = false) => (
    <th
      className={`vl-sort${num ? ' num' : ''}${sort.key === key ? ' active' : ''}`}
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'commission' }))}
    >
      {label}
      {sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <div className="validator-list">
      <div className="vl-filters">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, website or address" aria-label="Search validators" />
        {showDelinquentToggle && delinquentCount > 0 && (
          <label className="check inline">
            <input type="checkbox" checked={showDelinquent} onChange={(e) => setShowDelinquent(e.target.checked)} />
            <span>Show {delinquentCount} offline</span>
          </label>
        )}
      </div>
      <div className="list-box" style={height ? { height } : undefined}>
        <table className="fv-table vl-table">
          <thead>
            <tr>
              {header('name', 'Validator')}
              {header('commission', 'Commission', true)}
              {header('stake', 'Active stake (SOL)', true)}
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr
                key={v.vote}
                className={`fv-item${selected === v.vote ? ' selected' : ''}${v.delinquent ? ' delinquent' : ''}`}
                onClick={() => onSelect?.(v.vote)}
                title={`${v.info?.details ? `${v.info.details}\n\n` : ''}Vote account: ${v.vote}\nIdentity: ${v.identity}${v.info?.website ? `\n${v.info.website}` : ''}`}
              >
                <td>
                  <span className="vl-name">
                    <Avatar v={v} />
                    <span>
                      {validatorName(v)}
                      {v.delinquent && <small className="bad"> offline</small>}
                    </span>
                  </span>
                </td>
                <td className={`num${v.commission >= 10 ? ' bad' : ''}`}>{v.commission}%</td>
                <td className="num">{formatSol(v.activatedStake, 0)}</td>
                <td className="num">{total && !v.delinquent ? `${((v.activatedStake / total) * 100).toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="fv-empty">
                  No validators match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="vl-count">
        {rows.length.toLocaleString('en-US')} of {validators.filter((v) => showDelinquent || !v.delinquent).length.toLocaleString('en-US')} validators ·{' '}
        {formatSol(total, 0)} SOL staked
      </div>
    </div>
  );
}
