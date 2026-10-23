import { AIProvider } from './provider.js';

/**
 * MockProvider: zero-dependency, offline reflection generated from real data.
 * Used by default so the app works with no API key.
 */
export class MockProvider extends AIProvider {
  async reflect(context) {
    const { areas, trackers, entries, items, habits = [], upcomingEvents = [] } = context;

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

    // Habits: summarize consistency, call out best and weakest (esp. core).
    const loggedHabits = habits.filter((h) => h.marked > 0);
    let habitSentence = '';
    if (habits.length) {
      if (loggedHabits.length === 0) {
        habitSentence = `You have ${habits.length} habit${habits.length === 1 ? '' : 's'} set up but logged none this week. `;
        suggestions.push('Log your daily habits each day — even a quick Yes/No keeps the streak honest.');
      } else {
        const avg = Math.round(
          loggedHabits.reduce((s, h) => s + h.rate, 0) / loggedHabits.length,
        );
        habitSentence = `Across ${loggedHabits.length} tracked habit${loggedHabits.length === 1 ? '' : 's'}, you averaged ${avg}% completion. `;

        const best = [...loggedHabits].sort((a, b) => b.rate - a.rate)[0];
        if (best && best.rate >= 80) {
          highlights.push(`Strong consistency on "${best.name}" — ${best.done}/${best.marked} days (${best.rate}%).`);
        }
        // Weakest core habit gets a targeted nudge.
        const weakCore = loggedHabits
          .filter((h) => h.is_core && h.rate < 60)
          .sort((a, b) => a.rate - b.rate)[0];
        if (weakCore) {
          suggestions.push(
            `Your core habit "${weakCore.name}" slipped to ${weakCore.rate}% — protect it first next week (never two misses in a row).`,
          );
        }
      }
    }

    // Upcoming schedule: acknowledge what's coming.
    let scheduleSentence = '';
    if (upcomingEvents.length) {
      const next = upcomingEvents[0];
      scheduleSentence = `You have ${upcomingEvents.length} event${upcomingEvents.length === 1 ? '' : 's'} coming up in the next 7 days — next is "${next.title}" on ${next.date}${next.start_time ? ` at ${next.start_time}` : ''}. `;
      suggestions.push(`Plan around your schedule: block time for "${next.title}" on ${next.date}.`);
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
        : trackers.length
          ? 'You stayed on top of all your trackers — nice consistency. '
          : '') +
      habitSentence +
      scheduleSentence +
      (highlights.length ? 'See the highlights for how things trended.' : '');

    return {
      summary,
      highlights,
      suggestions,
      provider: 'mock',
    };
  }
}
