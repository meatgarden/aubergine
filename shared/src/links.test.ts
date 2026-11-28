import { describe, expect, it } from 'vitest';
import { LINK_KINDS, SEEN_MAX, SUMMARY_STALE_MS, addLink, addressProblem, addressesIn, changeLink, groupedLinks, keptBySeeing, middleCut, rememberSeen, removeLink, sortedLinks, splitAddresses, tellLink, undescribed, useSuggestedLink, type LinkKind, type SessionLink } from './links';

/** Addresses shaped like real ones, of made-up projects, and what each is told to be. */
const TOLD: Record<Exclude<LinkKind, 'link'>, [string, string][]> = {
  'pull-request': [
    ['https://github.com/acme-co/widgets/pull/54', 'PR 54'],
    ['https://github.com/acme-co/widgets/pull/54/files', 'PR 54'],
    ['https://www.github.com/acme-co/widgets/pull/7#issuecomment-1', 'PR 7'],
    ['https://gitlab.com/acme-co/widgets/-/merge_requests/12', 'PR 12'],
    ['https://gitlab.com/acme-co/widgets/merge_requests/3', 'PR 3'],
    ['https://bitbucket.org/acme-co/widgets/pull-requests/99', 'PR 99'],
    ['https://codeberg.org/acme-co/widgets/pulls/5', 'PR 5'],
    ['https://github.com/acme-co/widgets/pull/1?diff=split', 'PR 1'],
    ['http://github.com/acme-co/widgets/pull/8', 'PR 8'],
    ['https://code.example.com/demo/project/pull/7', 'PR 7'],
    ['https://github.com/acme-co/widgets.js/pull/123456', 'PR 123456'],
    ['https://GitHub.com/acme-co/widgets/pull/2', 'PR 2'],
  ],
  issue: [
    ['https://github.com/acme-co/widgets/issues/12', 'Issue 12'],
    ['https://gitlab.com/acme-co/widgets/-/issues/4', 'Issue 4'],
    ['https://codeberg.org/acme-co/widgets/issues/88', 'Issue 88'],
    ['https://bitbucket.org/acme-co/widgets/issues/3', 'Issue 3'],
    ['https://github.com/acme-co/widgets/issues/12#issuecomment-9', 'Issue 12'],
    ['https://github.com/acme-co/widgets/issues/1?q=is%3Aopen', 'Issue 1'],
    ['https://code.example.com/demo/project/issues/2', 'Issue 2'],
    ['https://gitlab.com/acme-co/widgets/issues/40', 'Issue 40'],
    ['https://www.gitlab.com/acme-co/widgets/-/issues/41', 'Issue 41'],
    ['https://github.com/a/b/issues/999999', 'Issue 999999'],
    ['http://codeberg.org/acme-co/widgets/issues/6', 'Issue 6'],
    ['https://github.com/acme-co/widgets/issues/77/', 'Issue 77'],
  ],
  branch: [
    ['https://github.com/acme-co/widgets/tree/fix-login', 'fix-login'],
    ['https://github.com/acme-co/widgets/tree/feature/links', 'feature/links'],
    ['https://gitlab.com/acme-co/widgets/-/tree/main', 'main'],
    ['https://code.example.com/demo/project/tree/fix-double-redirect', 'fix-double-redirect'],
    ['https://codeberg.org/acme-co/widgets/tree/release%2F1.2', 'release/1.2'],
    ['https://github.com/acme-co/widgets/tree/a-b_c.d', 'a-b_c.d'],
    ['https://bitbucket.org/acme-co/widgets/branch/fix-login', 'fix-login'],
    ['https://github.com/acme-co/widgets/tree/main/', 'main'],
    ['https://gitlab.com/acme-co/widgets/tree/develop', 'develop'],
    ['https://github.com/acme-co/widgets/tree/user/me/try', 'user/me/try'],
    ['http://github.com/acme-co/widgets/tree/x', 'x'],
    ['https://github.com/acme-co/widgets/tree/v2', 'v2'],
  ],
  commit: [
    ['https://github.com/acme-co/widgets/commit/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', 'Commit 1a2b3c4'],
    ['https://github.com/acme-co/widgets/commit/1a2b3c4', 'Commit 1a2b3c4'],
    ['https://gitlab.com/acme-co/widgets/-/commit/abcdef0123', 'Commit abcdef0'],
    ['https://bitbucket.org/acme-co/widgets/commits/abcdef0123456', 'Commit abcdef0'],
    ['https://codeberg.org/acme-co/widgets/commit/0000000', 'Commit 0000000'],
    ['https://code.example.com/demo/project/commit/deadbeef', 'Commit deadbee'],
    ['https://github.com/acme-co/widgets/commit/ABCDEF1', 'Commit ABCDEF1'],
    ['https://github.com/acme-co/widgets/commit/1a2b3c4#diff-1', 'Commit 1a2b3c4'],
    ['https://github.com/acme-co/widgets/commit/1a2b3c4?w=1', 'Commit 1a2b3c4'],
    ['https://gitlab.com/acme-co/widgets/commit/9f9f9f9f', 'Commit 9f9f9f9'],
    ['http://github.com/acme-co/widgets/commit/1234567', 'Commit 1234567'],
    ['https://github.com/acme-co/widgets/commit/fedcba9876543210', 'Commit fedcba9'],
  ],
  repository: [
    ['https://github.com/acme-co/widgets', 'acme-co/widgets'],
    ['https://github.com/acme-co/widgets/', 'acme-co/widgets'],
    ['https://gitlab.com/acme/tools', 'acme/tools'],
    ['https://bitbucket.org/acme/tools', 'acme/tools'],
    ['https://codeberg.org/acme/tools', 'acme/tools'],
    ['https://code.example.com/demo/project', 'demo/project'],
    ['https://www.github.com/acme/tools', 'acme/tools'],
    ['http://github.com/acme/tools', 'acme/tools'],
    ['https://github.com/acme/tools#readme', 'acme/tools'],
    ['https://github.com/acme/tools?tab=readme', 'acme/tools'],
    ['https://GITHUB.com/acme/tools', 'acme/tools'],
    ['https://gitlab.com/acme/tools/', 'acme/tools'],
  ],
  ticket: [
    ['https://acme.atlassian.net/browse/ABC-123', 'ABC-123'],
    ['https://acme.atlassian.net/browse/abc-123', 'ABC-123'],
    ['https://acme.atlassian.net/jira/software/projects/ABC/boards/1?selectedIssue=ZZZ-9', 'Link'],
    ['https://linear.app/acme/issue/ENG-42/fix-the-login', 'ENG-42'],
    ['https://linear.app/acme/issue/ENG-42', 'ENG-42'],
    ['https://acme.youtrack.cloud/issue/WEB-7', 'WEB-7'],
    ['https://tickets.example.com/browse/DEMO-12', 'DEMO-12'],
    ['https://acme.atlassian.net/browse/AB2-1', 'AB2-1'],
    ['https://team.acme.atlassian.net/browse/OPS-1000', 'OPS-1000'],
    ['https://acme.atlassian.net/browse/ABC-123?focusedCommentId=5', 'ABC-123'],
    ['http://acme.atlassian.net/browse/ABC-1', 'ABC-1'],
    ['https://acme.atlassian.net/browse/ABC-123/', 'ABC-123'],
  ],
  chat: [
    ['https://acme.slack.com/archives/C0123ABCD/p1700000000000100', 'Chat message'],
    ['https://acme.slack.com/archives/C0123ABCD/p1700000000000100?thread_ts=1700000000.000100&cid=C0123ABCD', 'Chat thread'],
    ['https://acme.slack.com/archives/C0123ABCD', 'Chat channel'],
    ['https://discord.com/channels/123456/789012', 'Chat channel'],
    ['https://discord.com/channels/123456/789012/345678', 'Chat message'],
    ['https://chat.example.com/archives/C1/p2', 'Chat message'],
    ['https://app.slack.com/client/T01/C02', 'Chat'],
    ['https://acme-co.slack.com/archives/G0123/p1', 'Chat message'],
    ['http://acme.slack.com/archives/C0123ABCD/p1', 'Chat message'],
    ['https://acme.enterprise.slack.com/archives/C9/p9', 'Chat message'],
    ['https://www.discord.com/channels/1/2', 'Chat channel'],
    ['https://acme.slack.com/archives/C0123ABCD/', 'Chat channel'],
  ],
  design: [
    ['https://www.figma.com/file/AbCdEf123/Canvas-redesign', 'Canvas redesign'],
    ['https://www.figma.com/design/AbCdEf123/Canvas-redesign?node-id=1-2', 'Canvas redesign'],
    ['https://figma.com/file/AbCdEf123/Sign%20in%20flow', 'Sign in flow'],
    ['https://www.figma.com/proto/AbCdEf123/Onboarding', 'Onboarding'],
    ['https://www.figma.com/board/AbCdEf123/Ideas_for_Q3', 'Ideas for Q3'],
    ['https://www.figma.com/file/AbCdEf123', 'Design file'],
    ['https://design.example.com/file/1/Tabs-and-panel', 'Tabs and panel'],
    ['https://www.figma.com/design/x/A', 'A'],
    ['http://figma.com/file/x/Name', 'Name'],
    ['https://www.figma.com/file/AbCdEf123/Canvas-redesign/', 'Canvas redesign'],
    ['https://www.figma.com/design/AbCdEf123/Canvas--redesign', 'Canvas redesign'],
    ['https://www.figma.com/file/AbCdEf123/Canvas-redesign#frame', 'Canvas redesign'],
  ],
  document: [
    ['https://www.notion.so/acme/Remote-access-plan-0123456789abcdef0123456789abcdef', 'Remote access plan'],
    ['https://acme.notion.site/Remote-access-plan-0123456789abcdef0123456789abcdef', 'Remote access plan'],
    ['https://www.notion.so/0123456789abcdef0123456789abcdef', 'Document'],
    ['https://docs.google.com/document/d/1AbCdEfGhIjK/edit', 'Document'],
    ['https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit#gid=0', 'Spreadsheet'],
    ['https://docs.google.com/presentation/d/1AbCdEfGhIjK/edit', 'Slides'],
    ['https://drive.google.com/file/d/1AbCdEfGhIjK/view', 'File'],
    ['https://acme.atlassian.net/wiki/spaces/ENG/pages/12345/Release+checklist', 'Release checklist'],
    ['https://docs.example.com/Launch-notes', 'Launch notes'],
    ['https://www.notion.so/acme/Plan', 'Plan'],
    ['https://drive.google.com/drive/folders/1AbCdEf', 'Folder'],
    ['https://docs.google.com/forms/d/1AbCdEf/edit', 'Form'],
  ],
  run: [
    ['https://github.com/acme-co/widgets/actions/runs/123456789', 'Run 123456789'],
    ['https://github.com/acme-co/widgets/actions/runs/123456789/job/1', 'Run 123456789'],
    ['https://gitlab.com/acme-co/widgets/-/pipelines/4567', 'Run 4567'],
    ['https://gitlab.com/acme-co/widgets/-/jobs/89', 'Run 89'],
    ['https://gitlab.com/acme-co/widgets/pipelines/1', 'Run 1'],
    ['https://code.example.com/demo/project/actions/runs/3', 'Run 3'],
    ['https://codeberg.org/acme-co/widgets/actions/runs/12', 'Run 12'],
    ['https://github.com/acme-co/widgets/actions/runs/5?check_suite_focus=true', 'Run 5'],
    ['https://bitbucket.org/acme-co/widgets/builds/7', 'Run 7'],
    ['http://github.com/acme-co/widgets/actions/runs/9', 'Run 9'],
    ['https://www.github.com/acme-co/widgets/actions/runs/10', 'Run 10'],
    ['https://github.com/acme-co/widgets/actions/runs/11/', 'Run 11'],
  ],
};

describe('what an address is, told from the address alone', () => {
  for (const kind of LINK_KINDS) {
    if (kind === 'link') continue;
    it(`${kind}: a dozen addresses`, () => {
      expect(TOLD[kind]).toHaveLength(12);
      for (const [address, label] of TOLD[kind]) {
        // One row in the ticket list is made to mislead: its key is after the question mark, and is not read.
        if (label === 'Link') expect(tellLink(address).kind, address).toBe('link');
        else expect(tellLink(address), address).toEqual({ kind, label });
      }
    });
  }

  it('anything else is a link, called by its host and the last part of its path', () => {
    expect(tellLink('https://example.org/guides/getting-started.html')).toEqual({ kind: 'link', label: 'example.org · getting started' });
    expect(tellLink('https://www.example.org/')).toEqual({ kind: 'link', label: 'example.org' });
    expect(tellLink('https://github.com/acme-co')).toEqual({ kind: 'link', label: 'github.com · acme co' });
    expect(tellLink('https://github.com/acme-co/widgets/wiki/Home').kind).toBe('link');
  });

  it('is not misled: a host is compared exactly or by a registered suffix, and a key is read from the path only', () => {
    for (const address of [
      // A host that only looks like a known one.
      'https://github.com.evil.example/acme-co/widgets/pull/54',
      'https://notgithub.com/acme-co/widgets/pull/54',
      'https://evil.example/github.com/acme-co/widgets/pull/54',
      'https://atlassian.net.evil.example/browse/ABC-123',
      'https://fakeatlassian.net/browse/ABC-123',
      'https://atlassian.net/browse/ABC-123',
      'https://slack.com.evil.example/archives/C1/p2',
      'https://figma.com.evil.example/file/x/Name',
      'https://evil.example/?next=https://github.com/acme-co/widgets/pull/54',
      // A ticket's key in what follows the question mark, or the hash.
      'https://acme.atlassian.net/secure/Dashboard.jspa?selectedIssue=ABC-123',
      'https://acme.atlassian.net/issues/?jql=key%3DABC-123',
      'https://linear.app/acme/inbox#ENG-42',
    ])
      expect(tellLink(address).kind, address).toBe('link');
    // A name before the host does not make it another host; such an address is not a link at all.
    expect(addressProblem('https://github.com@evil.example/acme-co/widgets/pull/54')).toMatch(/name or a password/);
    // A label never carries a control character, whatever the address holds.
    expect(tellLink('https://www.figma.com/file/x/Na%1B%5B31mme').label.includes(String.fromCharCode(27))).toBe(false);
    expect(tellLink('https://www.figma.com/file/x/%E2%80%AEevil').label.includes(String.fromCharCode(0x202e))).toBe(false);
  });
});

/**
 * Cloud consoles and delivery: addresses shaped like the ones a tool prints, with made-up names, IDs and regions.
 * A console's page is a plain link with words for whose it is; a run of a plan or an update is a run.
 */
const CLOUD: Record<string, [string, LinkKind, string | null][]> = {
  'the AWS console': [
    ['https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/stackinfo?stackId=made-up', 'link', 'AWS CloudFormation · eu-west-1'],
    ['https://console.aws.amazon.com/cloudformation/home', 'link', 'AWS CloudFormation'],
    ['https://us-east-2.console.aws.amazon.com/ecs/v2/clusters/shop/services/checkout/health', 'link', 'AWS ECS · us-east-2'],
    ['https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/functions/resize-pictures', 'link', 'AWS Lambda · ap-southeast-2'],
    ['https://s3.console.aws.amazon.com/s3/buckets/made-up-bucket?region=eu-north-1&tab=objects', 'link', 'AWS S3'],
    ['https://eu-north-1.console.aws.amazon.com/s3/buckets/made-up-bucket', 'link', 'AWS S3 · eu-north-1'],
    ['https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups', 'link', 'AWS CloudWatch · eu-central-1'],
    ['https://us-west-2.console.aws.amazon.com/ec2/home?region=us-west-2#Instances:', 'link', 'AWS EC2 · us-west-2'],
    // A service of no region says none, whatever its page's host names.
    ['https://us-east-1.console.aws.amazon.com/iam/home#/roles', 'link', 'AWS IAM'],
    ['https://eu-west-3.console.aws.amazon.com/rds/home?region=eu-west-3#databases:', 'link', 'AWS RDS · eu-west-3'],
    ['https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/release/view', 'link', 'AWS CodePipeline · eu-west-1'],
    // A host with an account's own part before the region, as a console signed in to several accounts has.
    ['https://000000000000-abcd1234.eu-west-1.console.aws.amazon.com/cloudformation/home', 'link', 'AWS CloudFormation · eu-west-1'],
    // A service the table does not list is not guessed at; mixed case and a port change nothing.
    ['https://eu-west-1.console.aws.amazon.com/some-new-service/home', 'link', 'AWS console · eu-west-1'],
    ['https://EU-WEST-1.Console.AWS.Amazon.com/CloudFormation/home', 'link', 'AWS CloudFormation · eu-west-1'],
    ['https://eu-west-1.console.aws.amazon.com:443/sqs/v3/home', 'link', 'AWS SQS · eu-west-1'],
    ['https://www.console.aws.amazon.com/console/home', 'link', 'AWS console'],
    // What does not match: a host that only looks like the console's, a trailing dot, the console's name in a path.
    ['https://console.aws.amazon.com.example.org/cloudformation/home', 'link', null],
    ['https://evilconsole.aws.amazon.com/cloudformation/home', 'link', null],
    ['https://eu-west-1.console.aws.amazon.com.example.org/lambda/home', 'link', null],
    ['https://console.aws.amazon.com./cloudformation/home', 'link', null],
    ['https://example.org/console.aws.amazon.com/cloudformation/home', 'link', null],
    ['https://console-aws.amazon.com/cloudformation/home', 'link', null],
  ],
  'signing in to AWS from a command line': [
    ['https://device.sso.eu-west-1.amazonaws.com/', 'link', 'AWS sign-in'],
    ['https://device.sso.eu-west-1.amazonaws.com/?user_code=ABCD-EFGH', 'link', 'AWS sign-in'],
    ['https://device.sso.us-east-2.amazonaws.com/', 'link', 'AWS sign-in'],
    ['https://DEVICE.SSO.ap-southeast-2.amazonaws.com/', 'link', 'AWS sign-in'],
    ['https://d-abc123.awsapps.com/start', 'link', 'AWS access portal'],
    ['https://d-abc123.awsapps.com/start/', 'link', 'AWS access portal'],
    ['https://made-up-company.awsapps.com/start#/device?user_code=ABCD-EFGH', 'link', 'AWS access portal'],
    ['https://made-up-company.awsapps.com/start/#/', 'link', 'AWS access portal'],
    // Nothing else under those suffixes is told, and no look-alike.
    ['https://made-up-bucket.s3.eu-west-1.amazonaws.com/device/sso', 'link', null],
    ['https://device.sso.amazonaws.com/', 'link', null],
    ['https://device.sso.not-a-region.amazonaws.com/', 'link', null],
    ['https://x.device.sso.eu-west-1.amazonaws.com/', 'link', null],
    ['https://device.sso.eu-west-1.amazonaws.com.example.org/', 'link', null],
    ['https://awsapps.com/start', 'link', null],
    ['https://d-abc123.awsapps.com/other', 'link', null],
    ['https://d-abc123.awsapps.com.example.org/start', 'link', null],
  ],
  'the Google Cloud console': [
    ['https://console.cloud.google.com/run/detail/europe-west1/checkout/metrics?project=made-up-project', 'link', 'Google Cloud · Cloud Run'],
    ['https://console.cloud.google.com/compute/instances?project=made-up-project', 'link', 'Google Cloud · Compute Engine'],
    ['https://console.cloud.google.com/kubernetes/list/overview', 'link', 'Google Cloud · Kubernetes Engine'],
    ['https://console.cloud.google.com/storage/browser/made-up-bucket', 'link', 'Google Cloud · Cloud Storage'],
    ['https://console.cloud.google.com/sql/instances', 'link', 'Google Cloud · Cloud SQL'],
    ['https://console.cloud.google.com/iam-admin/iam?project=made-up-project', 'link', 'Google Cloud · IAM'],
    ['https://console.cloud.google.com/logs/query;query=severity%3DERROR?project=made-up-project', 'link', 'Google Cloud · Logging'],
    ['https://console.cloud.google.com/cloud-build/builds;region=europe-west1/0a1b2c3d?project=made-up-project', 'link', 'Google Cloud · Cloud Build'],
    ['https://console.cloud.google.com/functions/list', 'link', 'Google Cloud · Cloud Functions'],
    ['https://console.cloud.google.com/bigquery?project=made-up-project', 'link', 'Google Cloud · BigQuery'],
    ['https://Console.Cloud.Google.com/Monitoring/dashboards', 'link', 'Google Cloud · Monitoring'],
    ['https://console.cloud.google.com/', 'link', 'Google Cloud console'],
    ['https://console.cloud.google.com/a-product-not-listed/x', 'link', 'Google Cloud console'],
    ['https://console.cloud.google.com:443/artifacts', 'link', 'Google Cloud · Artifact Registry'],
    // What does not match.
    ['https://console.cloud.google.com.example.org/run', 'link', null],
    ['https://evil.console.cloud.google.com/run', 'link', null],
    ['https://cloud.google.com/run', 'link', null],
    ['https://console.cloud.google.com./run', 'link', null],
    ['https://example.org/?next=https://console.cloud.google.com/run', 'link', null],
  ],
  'the Azure portal': [
    ['https://portal.azure.com/', 'link', 'Azure portal'],
    ['https://portal.azure.com', 'link', 'Azure portal'],
    ['https://portal.azure.com/#home', 'link', 'Azure portal'],
    ['https://portal.azure.com/#@made-up.example/resource/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/shop/overview', 'link', 'Azure portal'],
    ['https://portal.azure.com/#view/HubsExtension/BrowseResourceGroups', 'link', 'Azure portal'],
    ['https://portal.azure.com/made-up.example', 'link', 'Azure portal'],
    ['https://Portal.Azure.com/#home', 'link', 'Azure portal'],
    ['https://portal.azure.com:443/#home', 'link', 'Azure portal'],
    ['http://portal.azure.com/', 'link', 'Azure portal'],
    ['https://www.portal.azure.com/', 'link', 'Azure portal'],
    // What does not match.
    ['https://portal.azure.com.example.org/', 'link', null],
    ['https://evilportal.azure.com/', 'link', null],
    ['https://x.portal.azure.com/', 'link', null],
    ['https://portal.azure.com./', 'link', null],
    ['https://example.org/portal.azure.com', 'link', null],
  ],
  'HCP Terraform': [
    // As the command line prints a run, and as the pages spell it.
    ['https://app.terraform.io/app/acme-co/network-prod/runs/run-CZcmD7eagjhyX0vN', 'run', 'network-prod · run-CZcmD7eagjhyX0vN'],
    ['https://app.terraform.io/app/acme-co/workspaces/network-prod/runs/run-CZcmD7eagjhyX0vN', 'run', 'network-prod · run-CZcmD7eagjhyX0vN'],
    ['https://app.eu.terraform.io/app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'run', 'network-prod · run-AbCd1234EfGh5678'],
    ['https://app.terraform.io/app/acme-co/workspaces/network_prod/runs/run-AbCd1234EfGh5678/', 'run', 'network_prod · run-AbCd1234EfGh5678'],
    ['https://app.terraform.io/app/acme-co/workspaces/network-prod/runs/run-AbCd1234EfGh5678?tab=plan', 'run', 'network-prod · run-AbCd1234EfGh5678'],
    ['https://APP.Terraform.io/app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'run', 'network-prod · run-AbCd1234EfGh5678'],
    ['https://app.terraform.io:443/app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'run', 'network-prod · run-AbCd1234EfGh5678'],
    ['https://app.terraform.io/app/acme-co/workspaces/network-prod', 'link', 'Terraform · acme-co/network-prod'],
    ['https://app.terraform.io/app/acme-co/workspaces/network-prod/runs', 'link', 'Terraform · acme-co/network-prod'],
    ['https://app.terraform.io/app/acme-co/workspaces/network-prod/states', 'link', 'Terraform · acme-co/network-prod'],
    // Not told: a page that is not a workspace's, a run that is not shaped like one, a look-alike host.
    ['https://app.terraform.io/app/acme-co/settings/general', 'link', null],
    ['https://app.terraform.io/app/acme-co/network-prod/runs/latest', 'link', null],
    ['https://app.terraform.io/app/acme-co/workspaces', 'link', null],
    ['https://app.terraform.io/session', 'link', null],
    ['https://app.terraform.io.example.org/app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'link', null],
    ['https://evilapp.terraform.io/app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'link', null],
    ['https://terraform.io/app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'link', null],
    ['https://app.terraform.io./app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'link', null],
    // A run named only after the question mark is not read.
    ['https://app.terraform.io/app/acme-co?run=run-AbCd1234EfGh5678', 'link', null],
  ],
  'Pulumi Cloud': [
    ['https://app.pulumi.com/acmecorp/webserver/dev', 'link', 'Pulumi · acmecorp/webserver/dev'],
    ['https://app.pulumi.com/acmecorp/webserver/dev/', 'link', 'Pulumi · acmecorp/webserver/dev'],
    ['https://app.pulumi.com/acmecorp/webserver/dev/updates/12', 'run', 'webserver/dev · update 12'],
    ['https://app.pulumi.com/acmecorp/webserver/dev/updates/12?explain=true', 'run', 'webserver/dev · update 12'],
    ['https://app.pulumi.com/acmecorp/webserver/dev/previews/0a1b2c3d-0000-4000-8000-0123456789ab', 'run', 'webserver/dev · preview'],
    ['https://app.pulumi.com/a-person/site.infra/prod_eu/updates/3', 'run', 'site.infra/prod_eu · update 3'],
    ['https://App.Pulumi.com/acmecorp/webserver/dev/updates/7', 'run', 'webserver/dev · update 7'],
    ['https://app.pulumi.com:443/acmecorp/webserver/dev', 'link', 'Pulumi · acmecorp/webserver/dev'],
    ['http://app.pulumi.com/acmecorp/webserver/staging', 'link', 'Pulumi · acmecorp/webserver/staging'],
    // Not told: pages that are not a stack's, and look-alike hosts.
    ['https://app.pulumi.com/signin', 'link', null],
    ['https://app.pulumi.com/acmecorp/settings/members', 'link', null],
    ['https://app.pulumi.com/acmecorp/environments/shop/prod', 'link', null],
    ['https://app.pulumi.com/user/settings/tokens', 'link', null],
    ['https://app.pulumi.com/acmecorp/webserver', 'link', null],
    ['https://app.pulumi.com/acmecorp/webserver/dev/updates/latest', 'link', null],
    ['https://app.pulumi.com/acmecorp/webserver/dev/updates/12/extra', 'link', null],
    ['https://app.pulumi.com.example.org/acmecorp/webserver/dev', 'link', null],
    ['https://evilapp.pulumi.com/acmecorp/webserver/dev', 'link', null],
    ['https://pulumi.com/acmecorp/webserver/dev', 'link', null],
    ['https://app.pulumi.com./acmecorp/webserver/dev', 'link', null],
  ],
  Datadog: [
    ['https://app.datadoghq.com/monitors/1234567', 'link', 'Datadog monitor 1234567'],
    ['https://app.datadoghq.eu/monitors/1234567', 'link', 'Datadog monitor 1234567'],
    ['https://us5.datadoghq.com/monitors/42?view=spans', 'link', 'Datadog monitor 42'],
    ['https://us3.datadoghq.com/dashboard/abc-123-xyz/checkout-latency', 'link', 'Datadog · checkout latency'],
    ['https://ap1.datadoghq.com/dashboard/abc-123-xyz/checkout-latency?from_ts=1&to_ts=2', 'link', 'Datadog · checkout latency'],
    ['https://ap2.datadoghq.com/logs', 'link', 'Datadog'],
    ['https://app.ddog-gov.com/monitors/9', 'link', 'Datadog monitor 9'],
    ['https://app.datadoghq.com/apm/traces', 'link', 'Datadog'],
    ['https://App.DatadogHQ.com/monitors/5', 'link', 'Datadog monitor 5'],
    ['https://app.datadoghq.com:443/monitors/6', 'link', 'Datadog monitor 6'],
    ['https://app.datadoghq.com/monitors/manage', 'link', 'Datadog'],
    // Not told: an organisation's own host (it would have to be guessed), and look-alikes.
    ['https://acme.datadoghq.com/monitors/1', 'link', null],
    ['https://datadoghq.com/monitors/1', 'link', null],
    ['https://app.datadoghq.com.example.org/monitors/1', 'link', null],
    ['https://evilapp.datadoghq.com/monitors/1', 'link', null],
    ['https://app.datadoghq.com./monitors/1', 'link', null],
    ['https://app.datadoghq.co/monitors/1', 'link', null],
  ],
};

describe('cloud consoles and delivery, told from the address alone', () => {
  for (const [row, addresses] of Object.entries(CLOUD)) {
    it(`${row}: a dozen addresses and more, with the hosts that only look like it`, () => {
      expect(addresses.length).toBeGreaterThanOrEqual(12);
      for (const [address, kind, label] of addresses) {
        if (label !== null) expect(tellLink(address), address).toEqual({ kind, label });
        else expect(tellLink(address), address).toEqual({ kind: 'link', label: expect.stringMatching(new RegExp(`^${new URL(address).hostname.slice(0, 20).replace(/\./g, '\\.')}`)) });
      }
    });
  }

  it('a name before the host does not make it a console: such an address is not a link at all', () => {
    for (const address of ['https://console.aws.amazon.com@example.org/', 'https://eu-west-1.console.aws.amazon.com:x@example.org/cloudformation/home', 'https://app.terraform.io@example.org/app/acme-co/network-prod/runs/run-AbCd1234EfGh5678', 'https://portal.azure.com@example.org/']) {
      expect(addressProblem(address), address).toMatch(/name or a password/);
      expect(tellLink(address).label.startsWith('AWS'), address).toBe(false);
      expect(keptBySeeing(address), address).toBe(false);
    }
  });

  it("a console's page and a sign-in page are never kept only because a terminal showed them; a run named in the path is", () => {
    // Where a code or a name of something may be: never kept, with or without it.
    for (const address of [
      'https://device.sso.eu-west-1.amazonaws.com/?user_code=ABCD-EFGH',
      'https://device.sso.eu-west-1.amazonaws.com/',
      'https://d-abc123.awsapps.com/start/#/device?user_code=ABCD-EFGH',
      'https://d-abc123.awsapps.com/start',
      'https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks',
      'https://eu-west-1.console.aws.amazon.com/cloudformation/home',
      'https://console.cloud.google.com/run?project=made-up-project',
      'https://portal.azure.com/#home',
      'https://app.pulumi.com/acmecorp/webserver/dev',
      'https://app.datadoghq.com/monitors/1234567',
    ])
      expect(keptBySeeing(address), address).toBe(false);
    expect(keptBySeeing('https://app.terraform.io/app/acme-co/network-prod/runs/run-CZcmD7eagjhyX0vN')).toBe(true);
    expect(keptBySeeing('https://app.pulumi.com/acmecorp/webserver/dev/updates/12')).toBe(true);
    expect(keptBySeeing('https://app.terraform.io/app/acme-co/network-prod/runs/run-CZcmD7eagjhyX0vN?token=abc')).toBe(false);
  });

  it('a label never carries a control character or more than a label may hold', () => {
    for (const address of ['https://app.terraform.io/app/acme-co/workspaces/net%1Bwork/runs/run-AbCd1234EfGh5678', 'https://app.pulumi.com/acmecorp/web%E2%80%AEserver/dev', `https://app.pulumi.com/${'a'.repeat(90)}/${'b'.repeat(90)}/${'c'.repeat(90)}`, 'https://us3.datadoghq.com/dashboard/abc/Na%1B%5B31mme']) {
      const { label } = tellLink(address);
      expect(label.includes(String.fromCharCode(27)), address).toBe(false);
      expect(label.includes(String.fromCharCode(0x202e)), address).toBe(false);
      expect(label.length, address).toBeLessThanOrEqual(80);
    }
  });
});

describe('only http and https addresses are links', () => {
  it('refuses anything else with one sentence', () => {
    for (const text of ['', 'not an address', 'ftp://example.org/file', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'mailto:someone@example.org', 'ssh://git@example.org/x', 'https://', 'https://exa mple.org', 'https://user:secret@example.org/x', `https://example.org/${'a'.repeat(2100)}`, 'https://example.org/\u0007']) {
      const problem = addressProblem(text);
      expect(problem, text).toMatch(/^[A-Z].*\.$/);
      expect(problem?.includes('\n')).toBe(false);
      const added = addLink([], { url: text }, { source: 'owner' }, '2026-01-01T00:00:00.000Z', () => 'x');
      expect('problem' in added, text).toBe(true);
    }
    expect(addressProblem('https://example.org/a?b=c#d')).toBeNull();
    expect(addressProblem('  http://localhost:3000/x  ')).toBeNull();
  });
});

const at = (n: number): string => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
let made = 0;
const id = (): string => `link-${(made += 1)}`;

describe('the links of a terminal', () => {
  it("the owner's value wins: what an agent says of the same address is kept as a suggestion", () => {
    const first = addLink([], { url: 'https://acme.atlassian.net/browse/ABC-1' }, { source: 'agent' }, at(1), id);
    if ('problem' in first) throw new Error(first.problem);
    expect(first.link).toMatchObject({ kind: 'ticket', label: 'ABC-1', source: 'agent' });
    // The owner changes its label: it is the owner's now.
    const owned = changeLink(first.links, first.link.id, { label: 'The login ticket' }, 'owner', at(2));
    if ('problem' in owned) throw new Error(owned.problem);
    expect(owned.link).toMatchObject({ label: 'The login ticket', ownerSet: true });
    // The agent says again what it is: nothing changes, and what it said is beside the owner's words.
    const again = addLink(owned.links, { url: 'https://acme.atlassian.net/browse/ABC-1', label: 'ABC-1 login', kind: 'issue' }, { source: 'agent' }, at(3), id);
    if ('problem' in again) throw new Error(again.problem);
    expect(again.links).toHaveLength(1);
    expect(again.link).toMatchObject({ label: 'The login ticket', kind: 'ticket', suggested: { label: 'ABC-1 login', kind: 'issue' } });
    const changed = changeLink(again.links, first.link.id, { label: 'Mine' }, 'agent', at(4));
    if ('problem' in changed) throw new Error(changed.problem);
    expect(changed.link.label).toBe('The login ticket');
    expect(changed.link.suggested?.label).toBe('Mine');
    // What is found by looking changes nothing that somebody wrote.
    const found = addLink(changed.links, { url: 'https://acme.atlassian.net/browse/ABC-1' }, { source: 'found', fromTerminal: true }, at(5), id);
    if ('problem' in found) throw new Error(found.problem);
    expect(found.links).toEqual(changed.links);
    // The agent may not remove it; the owner may. The owner may also use what was suggested.
    expect(removeLink(changed.links, first.link.id, 'agent')).toEqual({ problem: 'That link is the owner’s: only the owner removes it.' });
    expect(useSuggestedLink(changed.links, first.link.id)[0]).toMatchObject({ label: 'Mine', kind: 'ticket' });
    expect(useSuggestedLink(changed.links, first.link.id)[0]?.suggested).toBeUndefined();
    expect(removeLink(changed.links, first.link.id, 'owner')).toEqual({ links: [] });
  });

  it('an agent changes and removes what it added, and a link that was only found becomes its own when it says so', () => {
    const seen = addLink([], { url: 'https://github.com/acme-co/widgets/pull/54' }, { source: 'found', fromTerminal: true }, at(1), id);
    if ('problem' in seen) throw new Error(seen.problem);
    expect(seen.link).toMatchObject({ source: 'found', fromTerminal: true, label: 'PR 54' });
    const said = addLink(seen.links, { url: 'https://github.com/acme-co/widgets/pull/54', label: 'The fix' }, { source: 'agent', by: 'build script' }, at(2), id);
    if ('problem' in said) throw new Error(said.problem);
    expect(said.link).toMatchObject({ source: 'agent', by: 'build script', label: 'The fix' });
    expect(said.link.fromTerminal).toBeUndefined();
    expect(removeLink(said.links, said.link.id, 'agent')).toEqual({ links: [] });
    expect(removeLink(said.links, 'nothing', 'owner')).toEqual({ problem: 'There is no such link on this terminal.' });
  });

  it('are sorted with the ticket, the pull request and the branch first, and grouped under three headings', () => {
    const links = (['document', 'chat', 'branch', 'link', 'pull-request', 'ticket', 'design', 'repository', 'commit', 'run', 'issue'] as LinkKind[]).map((kind, index) => ({ kind, at: at(index) }));
    expect(sortedLinks(links).map((link) => link.kind)).toEqual(['ticket', 'pull-request', 'branch', 'issue', 'commit', 'run', 'design', 'document', 'repository', 'link', 'chat']);
    expect(groupedLinks(links).map((group) => [group.title, group.links.length])).toEqual([
      ['Work', 6],
      ['Reference', 4],
      ['Conversation', 1],
    ]);
    expect(groupedLinks([{ kind: 'chat' as LinkKind, at: at(1) }]).map((group) => group.title)).toEqual(['Conversation']);
  });

  it('a label that is long is cut in the middle', () => {
    expect(middleCut('short')).toBe('short');
    const cut = middleCut('feature/a-very-long-branch-name-for-the-sign-in-redirect');
    expect(cut.length).toBeLessThanOrEqual(28);
    expect(cut.startsWith('feature/a-ver')).toBe(true);
    expect(cut.endsWith('redirect')).toBe(true);
    expect(cut).toContain('…');
  });
});

describe('addresses in text', () => {
  it('are found without the punctuation of the sentence, and the pieces put together are the text', () => {
    const text = 'See https://acme.atlassian.net/browse/ABC-1, then (https://example.org/a_(b)) and https://example.org/x. Not ftp://example.org/y or https://user:pw@example.org/z';
    const pieces = splitAddresses(text);
    expect(pieces.map((piece) => ('address' in piece ? piece.address : piece.text)).join('')).toBe(text);
    expect(addressesIn(text)).toEqual(['https://acme.atlassian.net/browse/ABC-1', 'https://example.org/a_(b)', 'https://example.org/x']);
    expect(addressesIn('nothing here')).toEqual([]);
    expect(addressesIn('twice https://example.org/x and https://example.org/x')).toEqual(['https://example.org/x']);
  });

  it('seen addresses are capped at twenty and not repeated, newest last', () => {
    const many = Array.from({ length: 30 }, (_, n) => `https://example.org/${n}`);
    const kept = rememberSeen([], many);
    expect(kept).toHaveLength(SEEN_MAX);
    expect(kept.at(-1)).toBe('https://example.org/29');
    expect(kept[0]).toBe('https://example.org/10');
    // Seen again: it moves to the end, and is there once.
    const again = rememberSeen(kept, ['https://example.org/12', 'https://example.org/12']);
    expect(again).toHaveLength(SEEN_MAX);
    expect(again.filter((address) => address === 'https://example.org/12')).toHaveLength(1);
    expect(again.at(-1)).toBe('https://example.org/12');
  });

  it('one seen in a terminal is kept by itself only when its kind is known and nothing follows a question mark or a hash', () => {
    expect(keptBySeeing('https://github.com/acme-co/widgets/pull/54')).toBe(true);
    expect(keptBySeeing('https://github.com/acme-co/widgets/pull/54?token=abc')).toBe(false);
    expect(keptBySeeing('https://github.com/acme-co/widgets/pull/54#x')).toBe(false);
    expect(keptBySeeing('https://example.org/anything')).toBe(false);
    expect(keptBySeeing('ftp://github.com/acme-co/widgets/pull/54')).toBe(false);
  });
});

describe('whether a terminal is described', () => {
  const base = { note: '', written: {}, lastInputAt: null, lastOutputAt: null };
  it('needs a name someone gave it and a summary written within the last hour of its work', () => {
    expect(undescribed(base)).toEqual(['name', 'summary']);
    expect(undescribed({ ...base, written: { name: { by: 'agent', at: at(1) } } })).toEqual(['summary']);
    const described = { note: 'Fixing the login.', written: { name: { by: 'owner' as const, at: at(1) }, summary: { by: 'agent' as const, at: at(2) } }, lastInputAt: at(30), lastOutputAt: at(40) };
    expect(undescribed(described)).toEqual([]);
    // More than an hour of work since it was written: it is taken to be out of date.
    const later = new Date(Date.parse(at(2)) + SUMMARY_STALE_MS + 60_000).toISOString();
    expect(undescribed({ ...described, lastOutputAt: later })).toEqual(['summary']);
    // A summary nobody is on record as writing is not called old.
    expect(undescribed({ ...described, written: { name: described.written.name }, lastOutputAt: later })).toEqual([]);
  });
});

/** A link as it is stored, for a place that needs one. */
export const sampleLink = (over: Partial<SessionLink> = {}): SessionLink => ({ id: 'l1', url: 'https://example.org/x', kind: 'link', label: 'example.org · x', source: 'owner', at: at(1), ...over });
