import type { AppDef } from '../os/windows';
import { Notepad } from './notepad/Notepad';
import { Calculator } from './calc/Calculator';
import { Cmd } from './cmd/Cmd';
import { Rugsweeper } from './rugsweeper/Rugsweeper';
import { Explorer } from './explorer/Explorer';
import { BurnBin } from './burnbin/BurnBin';
import { NetworkMonitor } from './netmon/NetworkMonitor';
import { ControlPanel } from './control/ControlPanel';
import { DisplayProperties } from './control/DisplayProperties';
import { NetworkSettings } from './control/NetworkSettings';
import { Sounds } from './control/Sounds';
import { About } from './system/About';
import { Run } from './system/Run';
import { MessageBox } from './system/MessageBox';
import { FileDialog } from './system/FileDialog';

export const APPS: AppDef[] = [
  { id: 'notepad', title: 'Untitled - Notepad', icon: 'notepad', component: Notepad, width: 560, height: 400, aliases: ['notepad.exe', 'edit'] },
  { id: 'calc', title: 'Calculator', icon: 'calculator', component: Calculator, width: 260, height: 260, resizable: false, fitContent: true, aliases: ['calculator'] },
  { id: 'cmd', title: 'Command Prompt', icon: 'cmd', component: Cmd, width: 660, height: 400, aliases: ['command', 'terminal', 'solana'] },
  { id: 'rugsweeper', title: 'Rugsweeper', icon: 'rugsweeper', component: Rugsweeper, width: 170, height: 250, resizable: false, fitContent: true, aliases: ['winmine', 'minesweeper'] },
  { id: 'explorer', title: 'My Documents', icon: 'folder-open', component: Explorer, width: 680, height: 460, minWidth: 380, minHeight: 260, aliases: ['explorer.exe', 'files'] },
  { id: 'burnbin', title: 'Burn Bin', icon: 'burn-full', component: BurnBin, width: 640, height: 400, singleton: true, minWidth: 380, aliases: ['recyclebin', 'recycle', 'trash'] },
  { id: 'netmon', title: 'Network Monitor', icon: 'network-monitor', component: NetworkMonitor, width: 560, height: 520, minWidth: 420, minHeight: 420, singleton: true, aliases: ['taskmgr', 'taskmanager', 'netmon'] },
  { id: 'control', title: 'Control Panel', icon: 'control-panel', component: ControlPanel, width: 640, height: 420, singleton: true, minWidth: 420, aliases: ['control.exe', 'settings'] },
  { id: 'display', title: 'Display Properties', icon: 'display', component: DisplayProperties, width: 420, height: 500, resizable: false, singleton: true, dialog: true, fitContent: true, aliases: ['desk.cpl'] },
  { id: 'netsettings', title: 'Network Settings', icon: 'globe', component: NetworkSettings, width: 440, height: 440, resizable: false, singleton: true, dialog: true, fitContent: true, aliases: ['ncpa.cpl', 'network'] },
  { id: 'sounds', title: 'Sounds', icon: 'sound', component: Sounds, width: 360, height: 380, resizable: false, singleton: true, dialog: true, fitContent: true, aliases: ['mmsys.cpl'] },
  { id: 'about', title: 'About SolanaOS', icon: 'help', component: About, width: 420, height: 380, resizable: false, singleton: true, dialog: true, fitContent: true, aliases: ['winver'] },
  { id: 'run', title: 'Run', icon: 'run', component: Run, width: 360, height: 200, resizable: false, singleton: true, dialog: true, fitContent: true },
  { id: 'msgbox', title: 'SolanaOS', icon: 'info', component: MessageBox, width: 320, height: 140, resizable: false, dialog: true, fitContent: true, hideInTaskbar: true },
  { id: 'filedialog', title: 'Open', icon: 'folder-open', component: FileDialog, width: 520, height: 360, resizable: false, dialog: true, fitContent: true, hideInTaskbar: true },
];
