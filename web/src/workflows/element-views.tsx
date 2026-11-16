import { ASK_MAX, fillInputs } from '@aubergine/shared';
import { registerElementView } from './registries';

/** The one kind of element there is: instructions, and how to tell they are done. */
registerElementView({
  kind: 'instructions',
  Editor: ({ element, onChange }) => (
    <>
      <label className="wf-field">
        <span>What to do</span>
        <textarea
          rows={7}
          value={element.instructions}
          placeholder="Written for whoever does the work. {{task}} becomes the task of the run."
          onChange={(e) => onChange({ ...element, instructions: e.target.value })}
          data-testid="element-instructions"
        />
      </label>
      <label className="wf-field">
        <span>Done when</span>
        <input value={element.doneWhen} maxLength={500} placeholder="One line: how to tell it is finished" onChange={(e) => onChange({ ...element, doneWhen: e.target.value })} data-testid="element-done-when" />
      </label>
    </>
  ),
  Detail: ({ element, inputs }) => (
    <div className="wf-element-text">
      <pre>{fillInputs(element.instructions.trim(), inputs)}</pre>
      {element.doneWhen && (
        <p>
          <strong>Done when:</strong> {fillInputs(element.doneWhen, inputs)}
        </p>
      )}
    </div>
  ),
});

/** An approval: the run stops here until a person has decided. It holds a question for that person, and nothing for an agent. */
registerElementView({
  kind: 'approval',
  Editor: ({ element, onChange }) => (
    <>
      <p className="sheet-note">A run stops here until you approve it or send it back. An agent cannot do either. What you write below is shown to you beside those buttons; it is not instructions for an agent.</p>
      <label className="wf-field">
        <span>What you are asked to decide</span>
        <textarea rows={3} value={element.ask} maxLength={ASK_MAX} placeholder="For example: Is the plan what you want built?" onChange={(e) => onChange({ ...element, ask: e.target.value })} data-testid="element-ask" />
      </label>
      <label className="wf-field">
        <span>What to look at (optional)</span>
        <textarea rows={2} value={element.lookAt} maxLength={ASK_MAX} placeholder="For example: the notes of the elements before, and the diff" onChange={(e) => onChange({ ...element, lookAt: e.target.value })} data-testid="element-look-at" />
      </label>
    </>
  ),
  Detail: ({ element }) => (
    <div className="wf-element-text approval-ask" data-testid="approval-ask">
      <p>
        <strong>A person decides here.</strong> {element.ask}
      </p>
      {element.lookAt && (
        <p>
          <strong>To look at:</strong> {element.lookAt}
        </p>
      )}
    </div>
  ),
});
