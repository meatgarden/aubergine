/// <reference types="vite/client" />

/**
 * Loads every section of the side panel: each module in `sections/` registers
 * itself when it is loaded. Adding a section is adding a file there; nothing
 * here, and nothing in the panel, needs to change.
 */
import.meta.glob('./sections/*.tsx', { eager: true });
