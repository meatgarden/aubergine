# A library source

A library source is a folder, or a Git repository, with one index file at its root and one file per item. Aubergine reads the index and the files it names, and nothing else. Nothing in a source is ever run.

The easiest way to make one is `aubergine library export <workflow> --to <folder>` (add `--element` for a saved step): it writes the item's file and adds or updates its entry in the folder's index, making the index when there is none. It never commits or pushes; that is yours to do.

## The index: `aubergine-library.json`

```json
{
  "aubergine": "library",
  "format": 1,
  "name": "Team library",
  "items": [
    {
      "id": "reproduce-fix-verify",
      "kind": "workflow",
      "name": "Reproduce, fix, verify",
      "description": "For a bug: see it fail first, fix the cause, show that it is fixed.",
      "version": "3",
      "path": "workflows/reproduce-fix-verify.json"
    },
    {
      "id": "check-before-done",
      "kind": "element",
      "name": "Check before you say done",
      "description": "Run it, read it, and name what is not finished.",
      "version": "1.2.0",
      "path": "elements/check-before-done.json",
      "retired": true,
      "replacedBy": "check-twice"
    }
  ]
}
```

| Field | What it is |
|---|---|
| `aubergine` | Always `"library"`. |
| `format` | The version of this format: `1`. A source in a later format is not read by a version of Aubergine that does not know it, and says so. |
| `name` | What the source calls itself. Optional; one line. Aubergine shows it as that, `calls itself “…”`, beside the source's address, unless the owner gave the source a name of their own: a source can call itself anything. |
| `items` | At most 500 entries. |

Each entry:

| Field | What it is |
|---|---|
| `id` | The item's ID in this source. It must mean the same item for ever and on every computer: it is how an installed copy finds its newer versions. Lower-case letters, digits, `.`, `-` and `_`, at most 100, starting with a letter or a digit. Two entries may not share one. |
| `kind` | `workflow` or `element`. An entry of a kind a version of Aubergine does not know is listed there and cannot be installed. |
| `name` | One line of plain text. |
| `description` | One line on what it is for, at most 300 characters. Optional. |
| `version` | The version you, the publisher, give it: `3`, `1.2.0`, `2026-04`. Letters, digits, `.`, `+`, `-`, `_`, at most 40. Versions are compared for being the same or not, never for order. **Change it whenever the content changes.** If the content changes and the version does not, everyone who looks at the item is told so. |
| `path` | Where the item's file is, from the root of the source: plain names with `/` between them. Not absolute, no `..`, no name starting with `.`. |
| `retired` | `true` when you no longer recommend it. Installed copies keep working; they say that it was retired. Optional. |
| `replacedBy` | For a retired item: the `id` of the one to use in its place. Optional. |

An entry that is wrong is skipped, with the reason shown to whoever added the source, and does not stop the others. Fields this version does not know, in the index or in an entry, are left alone: `aubergine library export` writes them back.

## The file of an item

A **workflow** is the file `aubergine workflow export` writes:

```json
{ "aubergine": "workflow", "format": 1, "workflow": { "name": "…", "description": "…", "standing": "…", "elements": [ { "name": "…", "instructions": "…", "doneWhen": "…" } ] } }
```

A **step** is one step in the same spirit (its file says `element`, the word the files and the commands use):

```json
{ "aubergine": "element", "format": 1, "element": { "name": "…", "instructions": "…", "doneWhen": "…", "needs": [ { "kind": "mcp", "name": "team chat" } ], "produces": "note" } }
```

What goes in a step is in [element.md](element.md). A file may be at most 512 KB. It must be a regular file inside the source: a symbolic link is not followed, wherever it points.

## What Aubergine does with a source

- It reads a source only when its owner adds it or presses Refresh. A Git source is fetched then and at no other time.
- It keeps, for each item, the version and a SHA-256 digest of the file as read. That is what "update available" is told from.
- When someone installs an item, they are first shown everything it would tell an agent. What is installed is the file whose digest they were shown, or nothing.
- Nothing installed is ever changed by a refresh. An update is offered, read and accepted like an install.
- It says so when a Git source's history was rewritten, when an item's content changed without its version changing, when an item is no longer listed, and when it was retired.
