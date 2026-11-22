import { create } from 'zustand';
import type { ProjectFileReading } from '@aubergine/shared';
import { api, forgetOnSwitch } from '../api';
import { useApp } from '../store';

/**
 * Project files that were read and wait for the owner's yes. They are kept
 * in the page and nowhere else: the server made nothing for them, and a
 * page that is closed forgets them. What is accepted is the very text that
 * was read, named by its digest.
 */
export interface PendingFile {
  id: string;
  text: string;
  reading: ProjectFileReading;
  /** Where it came from, in words: a file's name, or a template. */
  from: string;
  name: string;
  /** Where each place is on this computer; empty: left unset. */
  places: Record<string, string>;
  shared: 'shared' | 'project';
  start: boolean;
}

interface FileStore {
  pending: PendingFile[];
  add: (file: PendingFile) => void;
  change: (id: string, change: Partial<PendingFile>) => void;
  remove: (id: string) => void;
}

export const useProjectFiles = create<FileStore>((set) => ({
  pending: [],
  add: (file) => set((state) => ({ pending: [...state.pending.filter((p) => p.id !== file.id), file] })),
  change: (id, change) => set((state) => ({ pending: state.pending.map((p) => (p.id === id ? { ...p, ...change } : p)) })),
  remove: (id) => set((state) => ({ pending: state.pending.filter((p) => p.id !== id) })),
}));

// A file read by one server is accepted by that server: not by another shown later.
forgetOnSwitch(() => useProjectFiles.setState({ pending: [] }));

let count = 0;

/** Reads the text of a project file or a template, and puts what it holds before the owner on the review screen. Makes nothing. */
export async function readForReview(text: string, from: string, name?: string): Promise<void> {
  const reading = await api.readProjectFile(text);
  const id = `file-${(count += 1)}`;
  useProjectFiles.getState().add({ id, text, reading, from, name: name?.trim() || reading.name, places: {}, shared: reading.sharedDefault, start: false });
  const store = useApp.getState();
  store.wantReview(`project-file:${id}`);
  if (store.panel !== 'review') store.togglePanel('review');
}

/** Hands the owner a file to keep: the browser saves it where they say. Nothing is sent anywhere. */
export function saveAs(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
