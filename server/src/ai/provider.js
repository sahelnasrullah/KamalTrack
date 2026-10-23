/**
 * AIProvider is the swappable interface every provider implements.
 * To add a new provider (OpenAI, Anthropic, Ollama, ...):
 *   1. Create a file in this folder exporting a class that extends AIProvider
 *      and implements reflect(context).
 *   2. Register it in ./index.js under its key.
 * No other code in the app needs to change.
 */
export class AIProvider {
  /**
   * @param {object} context - { weekStart, weekEnd, areas, trackers, entries, items }
   * @returns {Promise<{ summary: string, highlights: string[], suggestions: string[], provider: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async reflect(context) {
    throw new Error('reflect() not implemented');
  }
}

/**
 * Builds a compact, provider-agnostic text description of the user's week.
 * Shared by every provider so prompts stay consistent.
 */
export function buildReflectionPrompt(context) {
  const { areas, trackers, entries, items, habits = [], upcomingEvents = [], recentEvents = [] } = context;

  const lines = [];
  lines.push(
    'You are a thoughtful life-planning coach. Based on the data below, write a short weekly reflection.',
    'Be concrete, encouraging, and specific. Reference actual numbers and trends where possible.',
    'Comment on habit consistency (especially core habits) and acknowledge what is coming up on the schedule.',
    '',
    'Respond as JSON with this exact shape:',
    '{ "summary": string, "highlights": string[], "suggestions": string[] }',
    '',
    '=== USER DATA (last 7 days) ===',
  );

  for (const area of areas) {
    lines.push(`\nAREA: ${area.name}`);
    const areaTrackers = trackers.filter((t) => t.area_id === area.id);
    for (const t of areaTrackers) {
      const te = entries
        .filter((e) => e.tracker_id === t.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (te.length === 0) {
        lines.push(`  - Tracker "${t.name}" (${t.unit || t.type}): no entries this week`);
      } else {
        const vals = te.map((e) => `${e.date}=${e.value}${t.unit ? t.unit : ''}`).join(', ');
        const first = te[0].value;
        const last = te[te.length - 1].value;
        const trend = last > first ? 'up' : last < first ? 'down' : 'flat';
        lines.push(`  - Tracker "${t.name}": ${vals} (trend: ${trend})`);
      }
    }
    const areaItems = items.filter((i) => i.area_id === area.id);
    for (const it of areaItems) {
      lines.push(`  - ${it.type} [${it.status}]: ${it.content}`);
    }
    if (areaTrackers.length === 0 && areaItems.length === 0) {
      lines.push('  (nothing tracked yet)');
    }
  }

  // Daily habits
  if (habits.length) {
    lines.push('\nDAILY HABITS (last 7 days):');
    for (const h of habits) {
      const tag = h.is_core ? ' [core]' : '';
      if (h.marked === 0) {
        lines.push(`  - ${h.name}${tag}: not logged this week`);
      } else {
        lines.push(`  - ${h.name}${tag}: done ${h.done}/${h.marked} days (${h.rate}%)`);
      }
    }
  }

  // Schedule
  if (recentEvents.length) {
    lines.push('\nSCHEDULE — recent (last 7 days):');
    for (const e of recentEvents) {
      lines.push(`  - ${e.date}${e.start_time ? ` ${e.start_time}` : ''}: ${e.title}`);
    }
  }
  if (upcomingEvents.length) {
    lines.push('\nSCHEDULE — upcoming (next 7 days):');
    for (const e of upcomingEvents) {
      lines.push(`  - ${e.date}${e.start_time ? ` ${e.start_time}` : ''}: ${e.title}`);
    }
  }

  lines.push('\n=== END DATA ===');
  return lines.join('\n');
}

/**
 * Tolerant JSON extraction from an LLM response that may wrap JSON in prose
 * or markdown fences.
 */
export function parseReflectionJSON(text) {
  if (!text) return null;
  let t = text.trim();
  // strip markdown fences
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1));
    return {
      summary: String(obj.summary || ''),
      highlights: Array.isArray(obj.highlights) ? obj.highlights.map(String) : [],
      suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.map(String) : [],
    };
  } catch {
    return null;
  }
}
