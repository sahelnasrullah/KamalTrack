import { AIProvider } from './provider.js';

/**
 * MockProvider: zero-dependency, offline reflection generated from real data.
 * Used by default so the app works with no API key.
 */
export class MockProvider extends AIProvider {
  async reflect(context) {
    const { areas, trackers, entries, items } = context;

    const highlights = [];
    const suggestions = [];

    let loggedCount = 0;
    const neglected = [];

    for (const t of trackers) {
      const te = entries
        .filter((e) => e.tracker_id === t.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (te.length === 0) {
        neglected.push(t.name);
        continue;
      }
      loggedCount += te.length;
      const first = te[0].value;
      const last = te[te.length - 1].value;
      const unit = t.unit ? ` ${t.unit}` : '';
      if (last === first) {
        highlights.push(`${t.name} held steady at ${last}${unit}.`);
      } else {
        const dir = last > first ? 'up' : 'down';
        const delta = Math.round(Math.abs(last - first) * 100) / 100;
        highlights.push(
          `${t.name} moved ${dir} from ${first}${unit} to ${last}${unit} (Δ ${delta}${unit}).`,
        );
      }
    }

    for (const name of neglected) {
      suggestions.push(`Log at least one entry for "${name}" this week to keep its graph meaningful.`);
    }

    const openGoals = items.filter((i) => i.status === 'open');
    for (const g of openGoals.slice(0, 3)) {
      suggestions.push(`Take one small step on your ${g.type}: "${g.content}".`);
    }

    if (suggestions.length === 0) {
      suggestions.push('Everything looks logged — pick one tracker and set a target for next week.');
    }

    const areaCount = areas.length;
    const summary =
      `This week you logged ${loggedCount} ` +
      `${loggedCount === 1 ? 'entry' : 'entries'} across ${trackers.length} ` +
      `${trackers.length === 1 ? 'tracker' : 'trackers'} in ${areaCount} ` +
      `${areaCount === 1 ? 'area' : 'areas'}. ` +
      (neglected.length
        ? `${neglected.length} tracker${neglected.length === 1 ? '' : 's'} had no entries. `
        : 'You stayed on top of all your trackers — nice consistency. ') +
      (highlights.length ? 'See the highlights for how your numbers trended.' : '');

    return {
      summary,
      highlights,
      suggestions,
      provider: 'mock',
    };
  }
}
