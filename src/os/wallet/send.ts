// Instructions for sending SOL and tokens.
import { address, createNoopSigner, type Instruction } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction, getTransferCheckedInstruction } from '@solana-program/token';
import { getAccountInfo, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type ParsedTokenAccount } from '../solana/rpc';

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
/** Base fee for one signature. Priority fees aren't added. */
export const BASE_FEE_LAMPORTS = 5000;
/** Rent-exempt deposit for a 165-byte token account. */
export const TOKEN_ACCOUNT_RENT = 2_039_280;

export function solTransfer(from: string, to: string, lamports: bigint): Instruction[] {
  return [getTransferSolInstruction({ source: createNoopSigner(address(from)), destination: address(to), amount: lamports })];
}

export async function recipientTokenAccount(recipient: string, mint: string, tokenProgram: string): Promise<string> {
  const [ata] = await findAssociatedTokenPda({ owner: address(recipient), mint: address(mint), tokenProgram: address(tokenProgram) });
  return ata;
}

export async function tokenTransfer(
  from: string,
  source: ParsedTokenAccount,
  recipient: string,
  amount: bigint,
  createAta: boolean,
): Promise<Instruction[]> {
  const signer = createNoopSigner(address(from));
  const ata = await recipientTokenAccount(recipient, source.mint, source.programId);
  const ixs: Instruction[] = [];
  if (createAta) {
    ixs.push(
      getCreateAssociatedTokenIdempotentInstruction({
        payer: signer,
        ata: address(ata),
        owner: address(recipient),
        mint: address(source.mint),
        tokenProgram: address(source.programId),
      }),
    );
  }
  ixs.push(
    getTransferCheckedInstruction(
      {
        source: address(source.pubkey),
        mint: address(source.mint),
        destination: address(ata),
        authority: signer,
        amount,
        decimals: source.decimals,
      },
      { programAddress: address(source.programId) },
    ),
  );
  return ixs;
}

export interface RecipientCheck {
  exists: boolean;
  /** A warning to show before sending, e.g. when the address is a token account or a program. */
  warning?: string;
  needsAta?: boolean;
}

/** Look at the recipient before sending, to catch common mistakes. */
export async function checkRecipient(recipient: string, mint?: string, tokenProgram?: string): Promise<RecipientCheck> {
  const info = await getAccountInfo(recipient);
  const out: RecipientCheck = { exists: !!info };
  if (info?.executable) out.warning = 'This address is a program, not a wallet. Funds sent to it are usually lost.';
  else if (info && (info.owner === TOKEN_PROGRAM || info.owner === TOKEN_2022_PROGRAM))
    out.warning = 'This address is a token account, not a wallet. Send to the wallet address that owns it instead.';
  else if (info && info.owner !== SYSTEM_PROGRAM) out.warning = "This address is owned by a program, so it may not be a regular wallet. Make sure it's correct.";
  if (mint && tokenProgram) {
    const ata = await recipientTokenAccount(recipient, mint, tokenProgram);
    out.needsAta = !(await getAccountInfo(ata));
  }
  return out;
}
