import type { z } from 'zod';
import { ListedEnvironment } from './environment';
import { PageQuery, pageOf } from './protocol';

/** The list of everything that was prepared for a session and is still there. */
export const EnvironmentList = pageOf(ListedEnvironment);
export type EnvironmentList = z.infer<typeof EnvironmentList>;
export const EnvironmentsQuery = PageQuery;
