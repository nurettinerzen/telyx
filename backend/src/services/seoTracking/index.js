/**
 * Public exports for the SEO tracking module.
 *
 * Consume this module from cronJobs (scheduled run) or scripts
 * (manual run). When migrating to the Campaign Orchestrator, copy
 * this folder over and reimport from the orchestrator's storage +
 * alerts adapters.
 */

export { runSeoCheck } from './seoMonitor.js';
export { isConfigured as isSeoTrackingConfigured } from './gscClient.js';
export { KEYWORD_TARGETS } from './keywordTargets.js';
