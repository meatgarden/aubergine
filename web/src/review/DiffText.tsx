import { lineDiff } from '@aubergine/shared';

/**
 * Two texts compared line by line: what was added, what was taken out, what
 * stayed. The one comparison there is, used wherever two versions of
 * something are put side by side to be read.
 */
export function DiffText({ before, after, testId }: { before: string; after: string; testId?: string }) {
  return (
    <pre className="review-text" data-testid={testId ?? 'diff-text'}>
      {lineDiff(before, after).map((line, index) => (
        <span key={index} className={`diff-${line.kind}`}>
          {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
          {line.text}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
