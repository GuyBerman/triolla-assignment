/**
 * Shared types. One file per area: fridge, upload, rules, ingest, analysis,
 * the inspector report, and settings. Import from here.
 *
 * The JSON the app sees is hand-mirrored in `app/src/api/types.ts`. The other
 * interfaces here are the rows and inputs the API uses on the way there.
 */
export type * from './analysis';
export type * from './fridge';
export type * from './ingest';
export type * from './report';
export type * from './rules';
export type * from './settings';
export type * from './upload';
