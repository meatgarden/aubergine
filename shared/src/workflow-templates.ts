import { WorkflowContent, type WorkflowContent as Content } from './workflows';

/**
 * The workflows that come with the server. Each is a starting point: using
 * one makes an ordinary workflow that can be edited like any other.
 */
export interface BuiltInTemplate {
  name: string;
  title: string;
  description: string;
  content: Content;
}

const STANDING = [
  'Work on one element at a time and do not start the next before reporting this one done.',
  'Keep the change as small as the task allows. If something is unclear and guessing would be risky, report blocked and say what you need.',
].join('\n');

const template = (name: string, title: string, description: string, elements: { id: string; name: string; instructions: string; doneWhen: string }[]): BuiltInTemplate => ({
  name,
  title,
  description,
  content: WorkflowContent.parse({ name: title, description, standing: STANDING, elements: elements.map((e) => ({ ...e, origin: { kind: 'template', name } })) }),
});

export const WORKFLOW_TEMPLATES: readonly BuiltInTemplate[] = [
  template('plan-build-check', 'Plan, build, check', 'Think first, then make the change, then check it against the plan.', [
    {
      id: 'plan',
      name: 'Plan',
      instructions: 'The task: {{task}}\n\nRead the code the task touches. Write a short plan: what will change, in which files, and how you will know it works. Do not change any file yet.',
      doneWhen: 'There is a plan a reviewer could follow, and its open questions are listed.',
    },
    {
      id: 'build',
      name: 'Build',
      instructions: 'Carry out the plan from the element before. Keep to it; where you have to depart from it, say why in your note.',
      doneWhen: 'The change is made and the project builds.',
    },
    {
      id: 'check',
      name: 'Check',
      instructions: "Run the project's tests and checks. Read your own change once more as a reviewer would, against the plan. Fix what you find.",
      doneWhen: 'The checks pass, and the note says what was run and what the result was.',
    },
  ]),
  template('fix-a-bug', 'Fix a bug', 'Reproduce it, find the cause, fix it, test it, and write down what happened.', [
    {
      id: 'reproduce',
      name: 'Reproduce',
      instructions: 'The bug: {{task}}\n\nMake it happen. Find the shortest way to show the wrong behaviour, as a failing test if the project has tests.',
      doneWhen: 'There is a command or a test that shows the bug every time.',
    },
    {
      id: 'find-the-cause',
      name: 'Find the cause',
      instructions: 'Find out why it happens, not only where. Do not fix anything yet. Name the line or the decision that is wrong, and what else relies on it.',
      doneWhen: 'The note explains the cause in a way someone else could verify.',
    },
    {
      id: 'fix',
      name: 'Fix',
      instructions: 'Fix the cause, not the symptom. Change as little as possible.',
      doneWhen: 'The way of reproducing it no longer shows the bug.',
    },
    {
      id: 'test',
      name: 'Test',
      instructions: 'Make sure a test covers the bug so that it cannot come back unnoticed, and run all the tests of the project.',
      doneWhen: 'All tests pass, including one that fails without the fix.',
    },
    {
      id: 'summarise',
      name: 'Summarise',
      instructions: 'Write a short summary for the person who reported it: what was wrong, what was changed, and how it was tested.',
      doneWhen: 'The note holds that summary.',
    },
  ]),
  template('review-a-change', 'Review a change', 'Understand a change, look for what is wrong with it, and report.', [
    {
      id: 'understand',
      name: 'Understand',
      instructions: 'The change to review: {{task}}\n\nRead the whole change and what it touches. Say in your own words what it is meant to do. Change no files during this review.',
      doneWhen: 'The note says what the change does and why.',
    },
    {
      id: 'look-for-problems',
      name: 'Look for problems',
      instructions: 'Look for mistakes: cases not handled, behaviour that changed by accident, missing tests, names that mislead. Run the tests if you can. For each finding, give the file, the line and why it matters.',
      doneWhen: 'There is a list of findings, each one checked rather than guessed, or a statement that none were found.',
    },
    {
      id: 'report',
      name: 'Report',
      instructions: 'Write the review: the findings in order of importance, what must change before the change is accepted and what is only a suggestion.',
      doneWhen: 'The note holds the review, ready to hand to the author.',
    },
  ]),
  template('specify-design-build', 'Specify, design, then build', 'Agree on what is wanted before deciding how, and decide how before building.', [
    {
      id: 'specify',
      name: 'Specify',
      instructions: 'What is wanted: {{task}}\n\nWrite down what the result must do, seen from outside: behaviour, limits, and what is deliberately left out. Do not describe how it will be built.',
      doneWhen: 'There is a specification someone could test the result against.',
    },
    {
      id: 'design',
      name: 'Design',
      instructions: 'Decide how to build what was specified: the parts, what each is responsible for, what changes in existing code, and the order of work. Name the choices you made and what you chose against.',
      doneWhen: 'There is a design that covers every point of the specification.',
    },
    {
      id: 'build',
      name: 'Build',
      instructions: 'Build it as designed, with tests. Where the design turns out wrong, say so in your note rather than quietly doing something else.',
      doneWhen: 'It is built and the project builds.',
    },
    {
      id: 'check',
      name: 'Check against the specification',
      instructions: "Go through the specification point by point and show that the result does each. Run the project's checks.",
      doneWhen: 'Every point of the specification is shown to hold, or listed as not done.',
    },
  ]),
];

export const workflowTemplate = (name: string): BuiltInTemplate | undefined => WORKFLOW_TEMPLATES.find((t) => t.name === name);
