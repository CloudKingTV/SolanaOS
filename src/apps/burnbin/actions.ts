import { emptyRecycler, recycled } from '../../os/vfs';
import { messageBox } from '../../os/dialogs';
import { sounds } from '../../os/sound';

export async function emptyBurnBin(owner?: string): Promise<boolean> {
  const n = recycled().length;
  if (!n) return false;
  const answer = await messageBox({
    title: 'Confirm Multiple File Delete',
    icon: 'warning',
    message:
      n === 1
        ? 'Are you sure you want to permanently burn this item?'
        : `Are you sure you want to permanently burn these ${n} items?`,
    buttons: ['Yes', 'No'],
    owner,
  });
  if (answer !== 'Yes') return false;
  emptyRecycler();
  sounds.boom();
  return true;
}
