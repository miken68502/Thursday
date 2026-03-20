const test = require('node:test');
const assert = require('node:assert/strict');

const { DiagnosticsService } = require('../src/services/diagnostics_service');

test('diagnostics formats compact status report', () => {
  const blackboard = {
    get(path, fallback = null) {
      const map = {
        mode: 'WORK',
        activeJob: { type: 'MineResourceJob', stepId: 'move_to_block' },
        currentTarget: { id: 'ore' },
        survival: { health: 18, food: 15 },
        inventory: { fullness: 0.5 },
        recentFailures: [{ code: 'NO_PATH' }]
      };
      return path in map ? map[path] : fallback;
    }
  };
  const d = new DiagnosticsService({ blackboard });
  const line = d.formatReport();
  assert.ok(line.includes('State=WORK'));
  assert.ok(line.includes('Job=MineResourceJob'));
});
