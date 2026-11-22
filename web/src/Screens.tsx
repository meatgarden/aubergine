import { ActivityScreen, TokenScreen } from './TokenScreen';
import { AgentToolsDialog } from './AgentToolsDialog';
import { DescribeDialog } from './workflows/DescribeDialog';
import { EnvironmentPanel } from './environment/EnvironmentPanel';
import { HelpPanel } from './HelpPanel';
import { HistoryPanel } from './HistoryPanel';
import { InventoryPanel } from './InventoryPanel';
import { LibraryScreen } from './library/LibraryScreen';
import { Picker } from './Picker';
import { ProjectsScreen } from './projects/ProjectsScreen';
import { RunsScreen } from './runs/RunsScreen';
import { ReviewScreen } from './review/ReviewScreen';
import { RunDialog } from './workflows/RunDialog';
import { RunViewDialog } from './workflows/RunViewDialog';
import { SharingScreen } from './projects/SharingScreen';
import { ShelfEditor } from './workflows/ShelfEditor';
import { SettingsDialog } from './SettingsDialog';
import { AddDeviceDialog } from './devices/Devices';
import { LinkServerDialog, UnlinkServerDialog } from './linking/LinkDialog';
import { ShortcutSheet } from './ShortcutSheet';
import { StartDialog } from './environment/StartDialog';
import { WorkflowEditor } from './workflows/WorkflowEditor';
import { WorkflowsScreen } from './workflows/WorkflowsScreen';

/**
 * The pages: the screens that are places in the app, each about a whole project. One is shown at a time, under the
 * top bar, in place of the canvas. Each draws itself only while it is the one the store names.
 */
export function Pages() {
  return (
    <>
      <RunsScreen />
      <WorkflowsScreen />
      <LibraryScreen />
    </>
  );
}

/**
 * Everything that opens over what is being looked at, a page or the canvas alike: the dialogs, the editors and the
 * panels. They are beside the canvas, not inside it, so that they are there whichever is shown.
 */
export function Screens() {
  return (
    <>
      <Picker />
      <ShortcutSheet />
      <HelpPanel />
      <SettingsDialog />
      <AddDeviceDialog />
      <LinkServerDialog />
      <UnlinkServerDialog />
      <InventoryPanel />
      <HistoryPanel />
      <TokenScreen />
      <ActivityScreen />
      <WorkflowEditor />
      <ShelfEditor />
      <DescribeDialog />
      <ReviewScreen />
      <ProjectsScreen />
      <SharingScreen />
      <StartDialog />
      <EnvironmentPanel />
      <RunDialog />
      <AgentToolsDialog />
      <RunViewDialog />
    </>
  );
}
