import { create } from 'zustand';
import type { RunRecord } from '@aubergine/shared';
import { api, forgetOnSwitch } from '../api';

/**
 * The last runs that are over. The page holds live runs only; these are
 * read from the archive, once for everyone who shows them (the panel, and
 * the mark on a terminal that handed in a list), and again when a run ends
 * or one of them is ticked.
 */

const HOW_MANY = 20;

interface EndedRuns {
  items: RunRecord[];
  refresh: () => Promise<void>;
}

let asked = 0;

export const useEndedRuns = create<EndedRuns>((set) => ({
  items: [],
  refresh: async () => {
    const mine = ++asked;
    try {
      const page = await api.listEndedRuns(HOW_MANY);
      // An answer that was overtaken by a later question is dropped.
      if (mine === asked) set({ items: page.items as RunRecord[] });
    } catch {
      // The list stays as it was.
    }
  },
}));

// Read from the server shown: another server's are not these.
forgetOnSwitch(() => {
  asked += 1;
  useEndedRuns.setState({ items: [] });
});
