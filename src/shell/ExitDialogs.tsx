import { logOff, setPhase, showExitDialog, standBy, turnOff, useSession } from '../os/session';
import { ExitBox } from './Welcome';

export function ExitDialogs() {
  const which = useSession((s) => s.exitDialog);
  if (!which) return null;
  return (
    <div className="exit-overlay">
      {which === 'turn-off' ? (
        <ExitBox
          title="Turn off computer"
          onCancel={() => showExitDialog(null)}
          buttons={[
            { icon: 'standby', label: 'Stand By', onClick: standBy },
            { icon: 'power', label: 'Turn Off', onClick: () => turnOff(false) },
            { icon: 'restart', label: 'Restart', onClick: () => turnOff(true) },
          ]}
        />
      ) : (
        <ExitBox
          title="Log Off SolanaOS"
          onCancel={() => showExitDialog(null)}
          buttons={[
            {
              icon: 'switch-user',
              label: 'Switch User',
              onClick: () => {
                showExitDialog(null);
                setPhase('welcome');
              },
            },
            { icon: 'log-off', label: 'Log Off', onClick: logOff },
          ]}
        />
      )}
    </div>
  );
}
