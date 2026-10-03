import { useState, type ReactNode } from 'react';

export function Tabs({ tabs, initial = 0 }: { tabs: { label: string; content: ReactNode }[]; initial?: number }) {
  const [i, setI] = useState(initial);
  return (
    <div className="tabs">
      <div className="tab-strip" role="tablist">
        {tabs.map((t, idx) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={idx === i}
            className={`tab${idx === i ? ' selected' : ''}`}
            onClick={() => setI(idx)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {tabs[i].content}
      </div>
    </div>
  );
}
