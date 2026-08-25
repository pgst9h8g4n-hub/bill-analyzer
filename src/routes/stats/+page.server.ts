import { getSummary, getCategoryStats, getDailyTrend } from '$lib/db/stats';

export async function load() {
  return {
    summary: await getSummary(0),
    categoryStats: await getCategoryStats(0, new Date().toISOString().slice(0, 7)),
    dailyTrend: await getDailyTrend(0, 7)
  };
}
