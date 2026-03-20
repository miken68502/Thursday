const test = require('node:test');
const assert = require('node:assert/strict');

const { Blackboard, BOT_MODES } = require('../src/core/blackboard');
const { StateMachine } = require('../src/core/state_machine');

class SilentLogger {
  child() { return this; }
  info() {}
  warn() {}
}

test('state machine allows IDLE -> COMBAT for immediate threat interrupts', () => {
  const blackboard = new Blackboard();
  const stateMachine = new StateMachine(blackboard, new SilentLogger());

  const transitioned = stateMachine.transition(BOT_MODES.COMBAT, 'GuardPlayerJob');
  assert.equal(transitioned, true);
  assert.equal(blackboard.get('mode'), BOT_MODES.COMBAT);
});
