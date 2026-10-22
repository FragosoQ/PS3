const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('./ps3-priority-progress.js');

const suffixes = [
  '0.1', '0.2', '0.3', '1', '2', '3', '4', '5', '6', '7.1', '7.2', '8', '9', '10',
  '11.1', '11.2', '11.3', '12.1', '12.2', '12.3', '13.1', '13.2', '13.3', '14', '15', '16',
];

function columnLabel(index) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function makeTable({ suffix = '1', start = '08:00:00', duration = '09:00:00', completion = 0, blankStartHeader = false } = {}) {
  const cols = [];
  const values = [];
  suffixes.forEach((item, index) => {
    cols.push({ id: `C${index}`, label: blankStartHeader && index === 0 ? '' : `T${item.replace('.', ',')}` });
    values.push({ v: item === suffix ? start : null });
  });
  suffixes.forEach((item, index) => {
    cols.push({ id: `D${index}`, label: `TP${item.replace('.', ',')}` });
    values.push({ v: item === suffix ? duration : null });
  });
  const normalized = suffix.replace('.', '_');
  cols.push({ id: 'E0', label: `P${normalized}` }, { id: 'E1', label: '%' });
  values.push({ v: null }, { v: completion });
  return { table: { cols }, row: { c: values } };
}

function dateAt(day, hour, minute = 0, second = 0) {
  return new Date(2026, 9, day, hour, minute, second);
}

test('calculates each of the five elapsed-work thresholds and caps before completion', () => {
  const expected = [16.6666666667, 33.3333333333, 50, 66.6666666667, 83.3333333333];
  const times = [[9, 30], [11, 0], [12, 30], [15, 30], [17, 0]];
  expected.forEach((percentage, index) => {
    const { table, row } = makeTable();
    const now = dateAt(22, times[index][0], times[index][1]);
    assert.ok(Math.abs(calculate(table, row, 'P1', now) - percentage) < 0.000001);
  });
  const { table, row } = makeTable();
  assert.equal(calculate(table, row, '1', dateAt(22, 17)), 100 * 5 / 6);
});

test('accounts for the lunch break in the PS3 work schedule', () => {
  const { table, row } = makeTable({ start: '11:49:52' });
  assert.equal(calculate(table, row, '1', dateAt(22, 14, 42)), 100 / 6);
});

test('parses gviz time values and skips the weekend with Friday hours ending at 13:00', () => {
  const gvizTimes = makeTable({
    start: 'Date(1899,11,30,8,0,0)',
    duration: 'Date(1899,11,30,9,0,0)',
  });
  assert.equal(calculate(gvizTimes.table, gvizTimes.row, '1', dateAt(22, 9, 30)), 100 / 6);

  const fridayToMonday = makeTable({ start: '23/10/2026 12:00:00', duration: '12:00:00' });
  assert.equal(calculate(fridayToMonday.table, fridayToMonday.row, '1', new Date(2026, 9, 26, 9)), 100 / 6);
});

test('matches comma and point suffixes and uses ordered fallback when a leading header is blank', () => {
  const { table, row } = makeTable({ suffix: '0.1', blankStartHeader: true });
  assert.equal(calculate(table, row, 'P0,1', dateAt(22, 9, 30)), 100 / 6);
});

test('returns no progress when start or planned duration is missing', () => {
  const missingStart = makeTable({ start: null });
  const missingDuration = makeTable({ duration: null });
  assert.equal(calculate(missingStart.table, missingStart.row, '1', dateAt(22, 9)), null);
  assert.equal(calculate(missingDuration.table, missingDuration.row, '1', dateAt(22, 9)), null);
});

test('awards 100% only for an exact completed percentage, even without timing data', () => {
  const complete = makeTable({ start: null, duration: null, completion: 1 });
  const incomplete = makeTable({ start: '08:00:00', duration: '09:00:00', completion: '99,9%' });
  assert.equal(calculate(complete.table, complete.row, '1', dateAt(22, 9)), 100);
  assert.equal(calculate(incomplete.table, incomplete.row, '1', dateAt(22, 18)), 100 * 5 / 6);
});