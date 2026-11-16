import { useState } from 'react';
import { reportRun, tickItem } from './actions';
import { elementView, outputView, registerRunView, type RunViewProps } from './registries';
import { STATE_MARK, actorWord, took } from './run-model';

/** The run from top to bottom: every element with its state, how long it took, who moved it and the note; the current one open. */
function Pipeline({ picture, elements, live, now }: RunViewProps) {
  const { run } = picture;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="run-pipeline" data-testid="run-pipeline">
      {picture.segments.map((segment, index) => {
        const entry = run.elements.find((e) => e.elementId === segment.id);
        const element = elements.find((e) => e.id === segment.id);
        const current = segment.id === run.currentElementId;
        const shown = current || open === segment.id;
        const Detail = element ? elementView(element.kind)?.Detail : undefined;
        const Output = outputView(segment.produces)?.View;
        const time = took(entry?.startedAt ?? null, entry?.finishedAt ?? null, now);
        return (
          <li key={segment.id} className={`run-step is-${segment.state}${current ? ' is-current' : ''}`} data-testid="run-step" data-element={segment.id} data-state={segment.state}>
            <div className="run-step-head">
              <span className="run-step-mark" title={segment.state}>
                {STATE_MARK[segment.state]}
              </span>
              <button type="button" className="run-step-name" aria-expanded={shown} onClick={() => setOpen(open === segment.id ? null : segment.id)}>
                {index + 1}. {segment.name}
              </button>
              <span className="run-step-facts">
                {segment.state}
                {time && segment.state !== 'pending' ? ` · ${time}` : ''}
                {entry?.by ? ` · by ${actorWord(entry.by)}` : ''}
              </span>
              {live && !current && (
                <button type="button" className="quiet" title={`Jump to "${segment.name}"`} onClick={() => void reportRun(run.id, { type: 'goto', elementId: segment.id })} data-testid="run-goto">
                  Go to
                </button>
              )}
            </div>
            {entry?.sentBack && (
              <p className="run-step-note run-step-sent-back" data-testid="run-sent-back">
                Sent back here by {actorWord(entry.sentBack.by)}: {entry.sentBack.comment}
              </p>
            )}
            {entry?.note && <p className="run-step-note">{entry.note}</p>}
            {Output && entry && entry.output !== null && entry.output !== undefined && (
              <div className="run-step-output">
                <Output value={entry.output} ticks={entry.ticks} onTick={(item, ticked) => void tickItem(run.id, segment.id, item, ticked)} />
              </div>
            )}
            {shown && element && (Detail ? <Detail element={element} inputs={run.inputs} /> : <p className="sheet-note">This element is of a kind this version cannot show: {element.kind}.</p>)}
          </li>
        );
      })}
    </ol>
  );
}

/** Exactly what whoever is on the run is told now, and the line that sets an agent off. */
function Told({ text, kickoff, live }: RunViewProps) {
  return (
    <div className="run-told">
      <pre data-testid="run-text">{text}</pre>
      {live && kickoff && (
        <>
          <p className="sheet-note">To set an agent off on this run, give it this line. It is typed for you when a run is started on a terminal where an agent is running.</p>
          <pre className="run-kickoff">{kickoff}</pre>
        </>
      )}
    </div>
  );
}

registerRunView({ id: 'pipeline', title: 'Elements', order: 0, Component: Pipeline });
registerRunView({ id: 'told', title: 'What the agent is told', order: 10, Component: Told });
