/**
 * Single source of truth for claims the UI makes about the pipeline.
 *
 * These used to be typed by hand into each screen, which is how the launcher
 * came to advertise a 6-hour cadence while the careers dashboard told users
 * the scan ran every 12 hours. Change the schedule here (and in Cloud
 * Scheduler) and every surface follows.
 */
export const RUN_CADENCE_HOURS = 6;
export const RUN_CADENCE_LABEL = `Cloud Run · ${RUN_CADENCE_HOURS}h cadence active`;
export const RUN_CADENCE_SENTENCE = `The pipeline rescans every ${RUN_CADENCE_HOURS} hours.`;
