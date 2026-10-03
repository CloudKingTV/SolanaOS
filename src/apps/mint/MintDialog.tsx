import { useState } from 'react';
import { closeWindow, openApp, setCloseGuard, type AppProps } from '../../os/windows';
import { dataUrlToBytes, mintPicture, type MintResult, type MintStep } from '../../os/nft/mint';
import { FREE_LIMIT_BYTES } from '../../os/nft/irys';
import { clusterLabel, useSettings } from '../../os/settings';
import { useWallet } from '../../os/wallet/standard';
import { showBalloon } from '../../os/session';
import { Icon } from '../../shell/icons';

const STEPS: { id: MintStep; label: string }[] = [
  { id: 'upload-image', label: 'Upload the picture to permanent storage (sign 1 of 3)' },
  { id: 'upload-metadata', label: 'Upload the NFT details (sign 2 of 3)' },
  { id: 'mint', label: 'Create the NFT on Solana (approve 3 of 3)' },
];

/** Re-encode as JPEG when a PNG is over the free upload size. */
async function fitUnderLimit(dataUrl: string): Promise<{ bytes: Uint8Array; type: string }> {
  const png = dataUrlToBytes(dataUrl);
  const limit = FREE_LIMIT_BYTES - 4096;
  if (png.bytes.length <= limit) return png;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  for (const q of [0.92, 0.8, 0.65, 0.5]) {
    const jpg = dataUrlToBytes(c.toDataURL('image/jpeg', q));
    if (jpg.bytes.length <= limit) return jpg;
  }
  throw new Error('This picture is too detailed to upload for free. Try a smaller canvas (Image → New 256 × 256).');
}

export function MintDialog({ windowId, args }: AppProps) {
  const dataUrl = String(args.dataUrl ?? '');
  const conn = useWallet((s) => s.connection);
  const cluster = useSettings((s) => s.cluster);
  const [name, setName] = useState(String(args.name ?? 'Untitled').slice(0, 32));
  const [description, setDescription] = useState('Painted in SolanaOS.');
  const [step, setStep] = useState<MintStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MintResult | null>(null);
  const busy = step !== null && step !== 'done' && !error;

  const run = async () => {
    setError(null);
    setCloseGuard(windowId, () => false);
    try {
      const image = await fitUnderLimit(dataUrl);
      const r = await mintPicture(image, name.trim() || 'Untitled', description.trim(), setStep);
      setResult(r);
      showBalloon({
        title: 'NFT minted',
        icon: 'collectibles',
        message: `"${name}" is now a collectible in your wallet. Click to open My Collectibles.`,
        onClick: () => openApp('collectibles'),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloseGuard(windowId, null);
    }
  };

  const stepIndex = step ? STEPS.findIndex((s) => s.id === step) : -1;

  return (
    <div className="mint-dialog">
      <div className="mint-top">
        <img src={dataUrl} alt="Your picture" className="mint-preview" />
        <div className="mint-fields">
          <label className="field col">
            <span>Name:</span>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} disabled={busy || !!result} />
          </label>
          <label className="field col">
            <span>Description:</span>
            <textarea rows={3} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} disabled={busy || !!result} />
          </label>
          <p className="se-muted">
            Network: <b>{clusterLabel(cluster)}</b>. Storage on Irys is free for small pictures and permanent. Creating the NFT
            costs about 0.002 SOL (its account deposit) plus a tiny fee.
          </p>
        </div>
      </div>
      {step && (
        <ol className="mint-steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className={i < stepIndex || step === 'done' ? 'done' : i === stepIndex ? (error ? 'failed' : 'active') : ''}>
              {s.label}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p className="wiz-error">
          <Icon name="error" size={16} /> {error}
        </p>
      )}
      {result && (
        <p className="mint-done">
          <Icon name="collectibles" size={24} /> Minted!{' '}
          <button type="button" className="link-btn" onClick={() => openApp('solexplorer', { url: `sol://address/${result.asset}` })}>
            View the NFT
          </button>{' '}
          ·{' '}
          <button type="button" className="link-btn" onClick={() => openApp('collectibles')}>
            My Collectibles
          </button>
        </p>
      )}
      <div className="dialog-buttons">
        {!result && (
          <button type="button" className="btn" disabled={busy || !conn || !dataUrl} onClick={() => void run()}>
            {error ? 'Try Again' : busy ? 'Minting…' : 'Mint'}
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => closeWindow(windowId)}>
          {result ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
