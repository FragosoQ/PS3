(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PS3PriorityProgress = api;
  }
})(globalThis, function () {
  const PRIORITY_SUFFIXES = [
    '0.1', '0.2', '0.3', '1', '2', '3', '4', '5', '6', '7.1', '7.2', '8', '9', '10',
    '11.1', '11.2', '11.3', '12.1', '12.2', '12.3', '13.1', '13.2', '13.3', '14', '15', '16',
  ];
  const BLOCKS = {
    T: { firstColumn: 'DX' },
    TP: { firstColumn: 'EX' },
  };

  function normalizePrioritySuffix(value, prefix = '') {
    let suffix = String(value == null ? '' : value).trim().replace(/\s+/g, '');
    if (prefix && suffix.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
      suffix = suffix.slice(prefix.length);
    } else {
      suffix = suffix.replace(/^(?:TP|T|P)/i, '');
    }
    suffix = suffix.replace(/,/g, '.').replace(/_/g, '.');
    if (/^\d+(?:\.\d+)?$/.test(suffix)) {
      return String(Number(suffix));
    }
    return suffix.toLowerCase();
  }

  function columnLetterToIndex(value) {
    const letters = String(value || '').trim().toUpperCase();
    if (!/^[A-Z]+$/.test(letters)) return -1;
    let index = 0;
    for (const letter of letters) {
      index = index * 26 + letter.charCodeAt(0) - 64;
    }
    return index - 1;
  }

  function getColumnLabel(column) {
    return String(column && (column.label || column.id) || '').trim();
  }

  function getCellValue(row, index) {
    const cell = row && Array.isArray(row.c) ? row.c[index] : null;
    if (cell == null) return null;
    if (typeof cell !== 'object') return cell;
    return cell.v != null ? cell.v : (cell.f != null ? cell.f : null);
  }

  function findBlockValue(table, row, prefix, suffix) {
    if (!table || !Array.isArray(table.cols) || !Array.isArray(row && row.c)) return null;
    const targetSuffix = normalizePrioritySuffix(suffix);
    const targetPosition = PRIORITY_SUFFIXES.indexOf(targetSuffix);
    if (targetPosition < 0) return null;

    const entries = table.cols.map((column, index) => {
      const label = getColumnLabel(column);
      const prefixPattern = prefix === 'T' ? 'T(?!P)' : prefix;
      const match = label.match(new RegExp(`^${prefixPattern}\\s*(.+)$`, 'i'));
      return {
        index,
        suffix: match ? normalizePrioritySuffix(match[1]) : null,
        physicalIndex: columnLetterToIndex(column && column.id),
      };
    });
    const matchingHeader = entries.find(entry => entry.suffix === targetSuffix);
    if (matchingHeader) return getCellValue(row, matchingHeader.index);

    const firstPhysicalIndex = columnLetterToIndex(BLOCKS[prefix].firstColumn);
    const targetPhysicalIndex = firstPhysicalIndex + targetPosition;
    const physicalColumn = entries.find(entry => entry.physicalIndex === targetPhysicalIndex);
    if (physicalColumn) return getCellValue(row, physicalColumn.index);

    const inferredStarts = new Map();
    entries.forEach(entry => {
      const position = PRIORITY_SUFFIXES.indexOf(entry.suffix);
      if (position < 0) return;
      const start = entry.index - position;
      inferredStarts.set(start, (inferredStarts.get(start) || 0) + 1);
    });
    const inferredStart = [...inferredStarts.entries()]
      .sort((left, right) => right[1] - left[1])[0];
    const blockStart = inferredStart
      ? inferredStart[0]
      : table.cols.length === PRIORITY_SUFFIXES.length
        ? 0
        : firstPhysicalIndex < table.cols.length
          ? firstPhysicalIndex
          : -1;
    const targetIndex = blockStart + targetPosition;
    return targetIndex >= 0 && targetIndex < table.cols.length
      ? getCellValue(row, targetIndex)
      : null;
  }

  function findCompletionValue(table, row, suffix) {
    if (!table || !Array.isArray(table.cols)) return null;
    const targetSuffix = normalizePrioritySuffix(suffix);
    for (let index = 0; index + 1 < table.cols.length; index += 1) {
      const label = getColumnLabel(table.cols[index]);
      const match = label.match(/^P\s*(.+)$/i);
      if (!match || normalizePrioritySuffix(match[1]) !== targetSuffix) continue;
      if (getColumnLabel(table.cols[index + 1]).trim() !== '%') return null;
      return getCellValue(row, index + 1);
    }
    return null;
  }

  function isExactlyComplete(value) {
    if (typeof value === 'number') return value === 1 || value === 100;
    if (value == null) return false;
    const text = String(value).trim();
    const percent = text.match(/^(-?\d+(?:[.,]\d+)?)\s*%$/);
    if (percent) return Number(percent[1].replace(',', '.')) === 100;
    const numeric = Number(text.replace(',', '.'));
    return Number.isFinite(numeric) && (numeric === 1 || numeric === 100);
  }

  function dateFromSerial(value) {
    const milliseconds = value * 86400000;
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + milliseconds);
  }

  function dateFromValue(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value === 'number') {
      return value > 1 ? dateFromSerial(value) : null;
    }
    if (value == null) return null;
    const text = String(value).trim();
    const gviz = text.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+)(?:,(\d+))?)?\)$/);
    if (gviz) {
      return new Date(
        Number(gviz[1]), Number(gviz[2]), Number(gviz[3]), Number(gviz[4] || 0),
        Number(gviz[5] || 0), Number(gviz[6] || 0), Number(gviz[7] || 0)
      );
    }
    const localized = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (localized) {
      return new Date(
        Number(localized[3]), Number(localized[2]) - 1, Number(localized[1]),
        Number(localized[4] || 0), Number(localized[5] || 0), Number(localized[6] || 0)
      );
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseGvizClock(value) {
    const match = String(value == null ? '' : value).match(/^Date\(1899,11,30,(\d+),(\d+),(\d+)(?:,\d+)?\)$/);
    if (!match) return null;
    const clock = { hours: Number(match[1]), minutes: Number(match[2]), seconds: Number(match[3]) };
    if (clock.hours > 23 || clock.minutes > 59 || clock.seconds > 59) return null;
    return clock;
  }

  function parseStart(value, now) {
    if (typeof value === 'number' && value >= 0 && value <= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      date.setSeconds(Math.round(value * 86400));
      return date;
    }
    if (typeof value === 'string') {
      const text = value.trim();
      const gvizClock = parseGvizClock(text);
      if (gvizClock) {
        return new Date(
          now.getFullYear(), now.getMonth(), now.getDate(),
          gvizClock.hours, gvizClock.minutes, gvizClock.seconds
        );
      }
      const time = text.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
      if (time) {
        let hour = Number(time[1]);
        const meridiem = (time[4] || '').toUpperCase();
        if (meridiem === 'PM' && hour < 12) hour += 12;
        if (meridiem === 'AM' && hour === 12) hour = 0;
        if (hour > 23 || Number(time[2]) > 59 || Number(time[3] || 0) > 59) return null;
        return new Date(
          now.getFullYear(), now.getMonth(), now.getDate(), hour, Number(time[2]), Number(time[3] || 0)
        );
      }
    }
    return dateFromValue(value);
  }

  function parseDurationSeconds(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) return null;
      return value < 1 ? value * 86400 : value * 3600;
    }
    if (value == null) return null;
    const text = String(value).trim();
    const gvizClock = parseGvizClock(text);
    if (gvizClock) {
      return gvizClock.hours * 3600 + gvizClock.minutes * 60 + gvizClock.seconds;
    }
    const time = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?$/);
    if (time) {
      const minutes = Number(time[2]);
      const seconds = Number(time[3] || 0);
      if (minutes > 59 || seconds > 59) return null;
      return Number(time[1]) * 3600 + minutes * 60 + seconds + Number(`0.${time[4] || 0}`);
    }
    const units = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|horas?)$/i);
    if (units) return Number(units[1].replace(',', '.')) * 3600;
    const numeric = Number(text.replace(',', '.'));
    return Number.isFinite(numeric) && numeric > 0 ? numeric * 3600 : null;
  }

  function isWorkingDay(date) {
    const day = date.getDay();
    if (day < 1 || day > 5) return false;
    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const holidays = ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-25'];
    if (holidays.includes(monthDay)) return false;
    return date.getFullYear() !== 2026 || !['02-17', '04-17'].includes(monthDay);
  }

  function getWorkSecondsBetween(start, end) {
    if (end <= start) return 0;
    let seconds = 0;
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (day <= lastDay) {
      if (isWorkingDay(day)) {
        const intervals = day.getDay() === 5
          ? [[8, 13]]
          : [[8, 13], [14, 18]];
        intervals.forEach(([fromHour, toHour]) => {
          const intervalStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), fromHour);
          const intervalEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), toHour);
          const elapsedStart = Math.max(start.getTime(), intervalStart.getTime());
          const elapsedEnd = Math.min(end.getTime(), intervalEnd.getTime());
          if (elapsedEnd > elapsedStart) seconds += (elapsedEnd - elapsedStart) / 1000;
        });
      }
      day.setDate(day.getDate() + 1);
    }
    return seconds;
  }

  function calculate(table, row, activePriority, now = new Date()) {
    const suffix = normalizePrioritySuffix(activePriority);
    if (!suffix || !PRIORITY_SUFFIXES.includes(suffix)) return null;

    if (isExactlyComplete(findCompletionValue(table, row, suffix))) return 100;

    const startValue = findBlockValue(table, row, 'T', suffix);
    const durationValue = findBlockValue(table, row, 'TP', suffix);
    const start = parseStart(startValue, now);
    const durationSeconds = parseDurationSeconds(durationValue);
    if (!start || durationSeconds == null || durationSeconds <= 0) return null;

    const elapsedSeconds = getWorkSecondsBetween(start, now);
    const completeParts = Math.min(5, Math.floor((elapsedSeconds + 0.000001) / (durationSeconds / 6)));
    return completeParts * 100 / 6;
  }

  return { calculate, normalizePrioritySuffix, parseDurationSeconds };
});