import { fillInputs } from '@aubergine/shared';
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
