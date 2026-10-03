// Friendly names for well-known programs.
export const PROGRAM_NAMES: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022 Program',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Program',
  ComputeBudget111111111111111111111111111111: 'Compute Budget Program',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo Program',
  Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: 'Memo Program (v1)',
  Vote111111111111111111111111111111111111111: 'Vote Program',
  Stake11111111111111111111111111111111111111: 'Stake Program',
  Config1111111111111111111111111111111111111: 'Config Program',
  BPFLoaderUpgradeab1e11111111111111111111111: 'BPF Upgradeable Loader',
  BPFLoader2111111111111111111111111111111111: 'BPF Loader 2',
  AddressLookupTab1e1111111111111111111111111: 'Address Lookup Table Program',
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: 'Metaplex Token Metadata',
  CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d: 'Metaplex Core',
  BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY: 'Metaplex Bubblegum',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter Aggregator v6',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca Whirlpools',
  SysvarC1ock11111111111111111111111111111111: 'Sysvar: Clock',
  SysvarRent111111111111111111111111111111111: 'Sysvar: Rent',
};

export function programName(id: string): string | undefined {
  return PROGRAM_NAMES[id];
}
