'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Iroh = require('iroh');

// Read and extract the endorse body from the real file — nothing is copied here
const apiSource = fs.readFileSync(
	path.join(__dirname, '../src/api/posts.js'), 'utf8'
);
const endorseMatch = apiSource.match(/postsAPI\.endorse = async function[\s\S]*?\n\};/);
assert.ok(endorseMatch, 'Could not locate postsAPI.endorse in src/api/posts.js');
const rawSource = endorseMatch[0];
const bodyStart = rawSource.indexOf('{');
const bodyEnd = rawSource.lastIndexOf('};');
// Strip 'await ': acorn 5 (ecmaVersion 6) cannot parse async expressions
const syncBody = rawSource.slice(bodyStart + 1, bodyEnd).replace(/\bawait /g, '');

// Build self-contained IIFE code for Iroh.
// All mock dependencies are literal values inside the code string — zero external scope.
function buildCode(dataLiteral, canResult) {
	return '(function(caller, data, privileges, posts, websockets) {\n' +
        syncBody + '\n' +
        '})({ uid: 1 }, ' + dataLiteral + ',\n' +
        '  { global: { can: function() { return ' + canResult + '; } } },\n' +
        '  { exists: function() { return true; }, setPostField: function() {}, getPostField: function() { return 10; } },\n' +
        '  { in: function() { return { emit: function() {} }; } });';
}

describe('Iroh dynamic analysis: postsAPI.endorse', () => {
	it('should parse the endorse function body without error', () => {
		const calls = [];
		var stage;
		
		assert.doesNotThrow(
			() => stage = new Iroh.Stage(buildCode('{ pid: 42 }', 'true')), // eslint-disable-line no-new
			'Iroh failed to parse endorse function body'
		);
		
		stage.addListener(Iroh.FUNCTION).on('enter', (e) => { calls.push(e.value); });
		eval(stage.script);
		assert.notEqual(calls.length, 0);
	});

	// Iroh.IF 'enter' fires when the condition is TRUE (block is entered).
	// 'fire' never emits for IF in Iroh v0.3.0; use 'enter' instead.

	it('should fire IF when data is missing (first guard)', () => {
		const branches = [];
		const stage = new Iroh.Stage(buildCode('null', 'true'));
		stage.addListener(Iroh.IF).on('enter', (e) => { branches.push(e.value); });
		try {
			// eslint-disable-next-line no-eval
			eval(stage.script);
		} catch (e) {
			if (!e.message.includes('invalid-data')) throw e;
		}
		assert.strictEqual(branches.length, 1);
		assert.strictEqual(branches[0], true);
	});

	it('should fire IF when caller lacks privilege (second guard)', () => {
		const branches = [];
		const stage = new Iroh.Stage(buildCode('{ pid: 42 }', 'false')); // no privilege
		stage.addListener(Iroh.IF).on('enter', (e) => { branches.push(e.value); });
		try {
			// eslint-disable-next-line no-eval
			eval(stage.script);
		} catch (e) {
			if (!e.message.includes('no-privileges')) throw e;
		}
		// First guard skipped (data valid), second guard fires
		assert.strictEqual(branches.length, 1);
		assert.strictEqual(branches[0], true);
	});
});