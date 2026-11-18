import type { ProjectFileReading } from '@aubergine/shared';
import { api } from '../api';
import { useProjectFiles, type PendingFile } from '../projects/file-store';
import { goToProject } from '../projects/projects';
import { useApp } from '../store';
import { registerReviewSource, type ReviewDetail, type ReviewItem } from './registry';

/**
 * A project file, or a template, waiting to be read: the fourth thing the
 * review screen shows. The screen draws it like the others; what is its
 * own (a name, where its places are, what to start) is the `Choices` below.
 */

const LINE = '\n\n────────────────────────────────────────\n\n';

/** What the reviewer of a project file is shown. Pure. */
export function detailOfFile(reading: ProjectFileReading): ReviewDetail {
  const { counts } = reading;
  return {
    // Everything an agent would be told by what the file brings, in full.
    text: reading.texts.length > 0 ? reading.texts.map((one) => `${one.title}\n\n${one.text}`).join(LINE) : 'This file brings no workflow, no element and no schedule: nothing in it would be told to an agent.',
    previousText: null,
    needs: [],
    proposal: { workflow: null, element: null },
    notices: [
      reading.template ? 'A template: a project to start others from.' : 'A project that was written to a file. Someone else may have written it, and agents will follow what it brings. Read all of it before you accept.',
      ...(reading.description ? [reading.description] : []),
      `It makes ${counts.canvases} ${counts.canvases === 1 ? 'canvas' : 'canvases'}, ${counts.terminals} ${counts.terminals === 1 ? 'terminal' : 'terminals'} (${counts.agents} of them an agent’s), ${counts.frames} ${counts.frames === 1 ? 'frame' : 'frames'}, ${counts.notes} pinned ${counts.notes === 1 ? 'note' : 'notes'}, ${counts.workflows} ${counts.workflows === 1 ? 'workflow' : 'workflows'}, ${counts.elements} ${counts.elements === 1 ? 'element' : 'elements'}, ${counts.rules} ${counts.rules === 1 ? 'rule' : 'rules'} and ${counts.schedules} ${counts.schedules === 1 ? 'schedule' : 'schedules'}.`,
      ...reading.says,
      ...(reading.agents.length > 0 ? [`Were an agent’s: ${reading.agents.join(', ')}.`] : []),
      ...reading.needs.map((need) => `“${need.of}” says it needs: ${need.needs.join('; ')}. Nothing here checks that you have it.`),
      ...reading.leftOut.map((line) => `Was not written into the file: ${line}`),
    ],
  };
}

const itemOf = (file: PendingFile): ReviewItem => ({ id: file.id, title: file.name, what: file.reading.template ? 'A project from a template' : 'A project from a file', from: file.from, asked: '', state: 'waiting', comment: null, revision: 1 });

function Choices({ id }: { id: string }) {
  const file = useProjectFiles((s) => s.pending.find((p) => p.id === id));
  const change = useProjectFiles((s) => s.change);
  const taken = useApp((s) => (file ? (s.whole?.projects ?? []).some((project) => project.name.toLowerCase() === file.name.trim().toLowerCase()) : false));
  if (!file) return null;
  const { reading } = file;
  return (
    <div className="review-choices" data-testid="file-choices">
      <label className="wf-field">
        <span>The project’s name here</span>
        <input value={file.name} maxLength={80} onChange={(e) => change(id, { name: e.target.value })} data-testid="file-name" />
      </label>
      {taken && (
        <p className="dialog-error" role="alert" data-testid="file-name-taken">
          There is already a project named “{file.name.trim()}”. Choose another name: nothing is overwritten.
        </p>
      )}
      {reading.places.map((place) => (
        <label key={place.name} className="wf-field">
          <span>
            Where the place “{place.name}” is on this computer{place.hint ? ` (it was a folder called “${place.hint}”)` : ''}: {place.terminals} {place.terminals === 1 ? 'terminal starts' : 'terminals start'} there
          </span>
          <input value={file.places[place.name] ?? ''} placeholder="A folder that exists, such as /Users/you/work/garden. Left empty: not set, and those terminals start in your home folder." onChange={(e) => change(id, { places: { ...file.places, [place.name]: e.target.value } })} data-testid="file-place" data-place={place.name} />
        </label>
      ))}
      {reading.shared.length > 0 && (
        <fieldset className="token-reach" data-testid="file-shared">
          <legend>
            {reading.shared.join(', ')}: shared with every project where the file was written. Here {reading.shared.length === 1 ? 'it becomes' : 'they become'}
          </legend>
          <label>
            <input type="radio" name={`shared-${id}`} checked={file.shared === 'shared'} onChange={() => change(id, { shared: 'shared' })} />
            <span>shared with every project</span>
          </label>
          <label>
            <input type="radio" name={`shared-${id}`} checked={file.shared === 'project'} onChange={() => change(id, { shared: 'project' })} />
            <span>this new project’s own</span>
          </label>
        </fieldset>
      )}
      <label className="wf-inline">
        <input type="checkbox" checked={file.start} onChange={(e) => change(id, { start: e.target.checked })} data-testid="file-start" />
        <span>Start the terminals: a fresh shell in each. Off: each is made with a Start button. An agent is never started.</span>
      </label>
    </div>
  );
}

registerReviewSource({
  id: 'project-file',
  title: 'Projects from a file',
  useItems: () => {
    const pending = useProjectFiles((s) => s.pending);
    return pending.map(itemOf);
  },
  load: async (id) => {
    const file = useProjectFiles.getState().pending.find((p) => p.id === id);
    if (!file) throw new Error('This file is no longer waiting. Choose it again.');
    return detailOfFile(file.reading);
  },
  accept: async (id) => {
    const file = useProjectFiles.getState().pending.find((p) => p.id === id);
    if (!file) throw new Error('This file is no longer waiting. Choose it again.');
    // Exactly the text that was read, by its digest; the places as the owner wrote them, an empty one left unset.
    const made = await api.importProjectFile({ text: file.text, digest: file.reading.digest, name: file.name.trim(), places: Object.fromEntries(file.reading.places.map((place) => [place.name, (file.places[place.name] ?? '').trim() || null])), shared: file.shared, start: file.start });
    useProjectFiles.getState().remove(id);
    useApp.getState().setNotice(made.says);
    useApp.getState().togglePanel(null);
    // The state has the project by the time the answer is here, or a moment later.
    window.setTimeout(() => goToProject(made.project.id), 80);
  },
  discard: async (id) => useProjectFiles.getState().remove(id),
  Choices,
  readOnly: true,
});
