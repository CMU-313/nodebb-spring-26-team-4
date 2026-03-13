'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const pagination = require('../../src/pagination');

test('create returns an empty pager for a single page result set', () => {
	const data = pagination.create(1, 1);

	assert.equal(data.pageCount, 1);
	assert.equal(data.currentPage, 1);
	assert.equal(data.pages.length, 0);
	assert.equal(data.rel.length, 0);
	assert.deepEqual(data.prev, { page: 1, active: false });
	assert.deepEqual(data.next, { page: 1, active: false });
	assert.deepEqual(data.first, { page: 1, active: true });
	assert.deepEqual(data.last, { page: 1, active: true });
});

test('create includes separators and strips the transient "_" query parameter', () => {
	const data = pagination.create(6, 18, { term: 'nodebb', _: 'ignore-me' });

	assert.equal(data.pageCount, 18);
	assert.equal(data.currentPage, 6);
	assert.equal(data.prev.page, 5);
	assert.equal(data.next.page, 7);
	assert.equal(data.first.qs, 'term=nodebb&page=1');
	assert.equal(data.last.qs, 'term=nodebb&page=18');
	assert.equal(data.pages[2].qs, 'term=nodebb&page=3');
	assert.ok(data.pages.some(page => page.separator === true));
	assert.ok(data.rel.some(link => link.rel === 'next' && link.href === '?term=nodebb&page=7'));
	assert.ok(data.rel.some(link => link.rel === 'prev' && link.href === '?term=nodebb&page=5'));
});

test('create preserves adjacent page links without turning page three into a separator', () => {
	const data = pagination.create(2, 10);

	assert.equal(data.pages.length, 8);
	assert.equal(data.pages[0].page, 1);
	assert.equal(data.pages[1].page, 2);
	assert.equal(data.pages[2].page, 3);
	assert.equal(data.pages[5].separator, true);
	assert.equal(data.prev.page, 1);
	assert.equal(data.next.page, 3);
});

test('create appends query parameters to each page link', () => {
	const data = pagination.create(1, 3, { key: 'value' });

	assert.equal(data.pages.length, 3);
	assert.equal(data.rel.length, 1);
	assert.equal(data.pages[0].qs, 'key=value&page=1');
	assert.equal(data.pages[1].qs, 'key=value&page=2');
	assert.equal(data.next.qs, 'key=value&page=2');
});
