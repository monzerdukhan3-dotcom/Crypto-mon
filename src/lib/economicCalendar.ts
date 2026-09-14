export interface UpcomingEconomicEvent {
  name: string;
  hoursUntil: number;
}

/**
 * Placeholder for an economic-calendar integration (e.g. FOMC, CPI). No live
 * calendar data source is connected yet, so this always reports "no known
 * event" instead of fabricating one — wire a real calendar API in here to
 * make the news-proximity confidence penalty actually activate.
 */
export function getUpcomingHighImpactEvent(): UpcomingEconomicEvent | null {
  return null;
}
