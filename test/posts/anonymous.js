'use strict';

const assert = require('assert');
const anonymous = require('../../src/posts/anonymous');

describe('Anonymous Posts', () => {
	describe('getAnonymousUserData()', () => {
		it('should return a standardized anonymous user object', () => {
			const anonUser = anonymous.getAnonymousUserData();
			
			assert.strictEqual(anonUser.uid, 0);
			assert.strictEqual(anonUser.username, 'Anonymous');
			assert.strictEqual(anonUser.userslug, '');
			assert.strictEqual(anonUser.picture, '');
			assert.strictEqual(anonUser['icon:text'], 'A');
			assert.strictEqual(anonUser['icon:bgColor'], '#999');
			assert.strictEqual(anonUser.displayname, 'Anonymous');
			assert.strictEqual(anonUser.banned, 0);
			assert.strictEqual(anonUser.status, 'offline');
		});

		it('should return a new object on each call', () => {
			const anonUser1 = anonymous.getAnonymousUserData();
			const anonUser2 = anonymous.getAnonymousUserData();
			
			assert.notStrictEqual(anonUser1, anonUser2);
			assert.deepStrictEqual(anonUser1, anonUser2);
		});
	});

	describe('isAnonymousPost()', () => {
		it('should return true when post has isAnonymous set to 1', () => {
			const post = { isAnonymous: 1, uid: 0, realUid: 123 };
			assert.strictEqual(anonymous.isAnonymousPost(post), true);
		});

		it('should return false when post has isAnonymous set to 0', () => {
			const post = { isAnonymous: 0, uid: 123 };
			assert.strictEqual(anonymous.isAnonymousPost(post), false);
		});

		it('should return false when post has no isAnonymous property', () => {
			const post = { uid: 123, content: 'test' };
			assert.strictEqual(anonymous.isAnonymousPost(post), false);
		});

		it('should return false when post is null', () => {
			assert.strictEqual(anonymous.isAnonymousPost(null), false);
		});

		it('should return false when post is undefined', () => {
			assert.strictEqual(anonymous.isAnonymousPost(undefined), false);
		});

		it('should return false when isAnonymous is a falsy value', () => {
			assert.strictEqual(anonymous.isAnonymousPost({ isAnonymous: false }), false);
			assert.strictEqual(anonymous.isAnonymousPost({ isAnonymous: null }), false);
			assert.strictEqual(anonymous.isAnonymousPost({ isAnonymous: '' }), false);
		});

		it('should return true only when isAnonymous is exactly 1', () => {
			assert.strictEqual(anonymous.isAnonymousPost({ isAnonymous: 1 }), true);
			assert.strictEqual(anonymous.isAnonymousPost({ isAnonymous: '1' }), true);
			assert.strictEqual(anonymous.isAnonymousPost({ isAnonymous: true }), false);
			assert.strictEqual(anonymous.isAnonymousPost({ isAnonymous: 2 }), false);
		});
	});

	describe('applyAnonymousFields()', () => {
		it('should set anonymous fields on post data', () => {
			const postData = { content: 'test post', uid: 123 };
			const uid = 123;

			const result = anonymous.applyAnonymousFields(postData, uid);

			assert.strictEqual(result.isAnonymous, 1);
			assert.strictEqual(result.realUid, 123);
			assert.strictEqual(result.uid, 0);
			assert.strictEqual(result.content, 'test post');
		});

		it('should override existing uid with 0', () => {
			const postData = { content: 'test', uid: 999 };
			const uid = 123;

			anonymous.applyAnonymousFields(postData, uid);

			assert.strictEqual(postData.uid, 0);
			assert.strictEqual(postData.realUid, 123);
		});

		it('should return the modified postData object', () => {
			const postData = { content: 'test' };
			const result = anonymous.applyAnonymousFields(postData, 456);

			assert.strictEqual(result, postData);
		});

		it('should work with different uid values', () => {
			const postData1 = {};
			const postData2 = {};

			anonymous.applyAnonymousFields(postData1, 100);
			anonymous.applyAnonymousFields(postData2, 200);

			assert.strictEqual(postData1.realUid, 100);
			assert.strictEqual(postData2.realUid, 200);
			assert.strictEqual(postData1.uid, 0);
			assert.strictEqual(postData2.uid, 0);
		});
	});

	describe('overrideUserDisplay()', () => {
		it('should override user display for anonymous posts', () => {
			const post = {
				isAnonymous: 1,
				uid: 0,
				realUid: 123,
				user: { uid: 123, username: 'testuser' },
			};

			anonymous.overrideUserDisplay(post);

			assert.strictEqual(post.user.uid, 0);
			assert.strictEqual(post.user.username, 'Anonymous');
			assert.strictEqual(post.user.userslug, '');
			assert.strictEqual(post.realUid, 123);
		});

		it('should not modify non-anonymous posts', () => {
			const post = {
				isAnonymous: 0,
				uid: 123,
				user: { uid: 123, username: 'testuser', displayname: 'Test User' },
			};

			anonymous.overrideUserDisplay(post);

			assert.strictEqual(post.user.uid, 123);
			assert.strictEqual(post.user.username, 'testuser');
			assert.strictEqual(post.user.displayname, 'Test User');
		});

		it('should preserve realUid if it exists', () => {
			const post = {
				isAnonymous: 1,
				realUid: 456,
				user: { uid: 123 },
			};

			anonymous.overrideUserDisplay(post);

			assert.strictEqual(post.realUid, 456);
		});

		it('should not add realUid when it does not exist', () => {
			const post = {
				isAnonymous: 1,
				uid: 0,
				user: { uid: 123 },
			};

			anonymous.overrideUserDisplay(post);

			assert.strictEqual(post.realUid, undefined);
		});

		it('should set all anonymous user properties', () => {
			const post = {
				isAnonymous: 1,
				user: {},
			};

			anonymous.overrideUserDisplay(post);

			assert.strictEqual(post.user.uid, 0);
			assert.strictEqual(post.user.username, 'Anonymous');
			assert.strictEqual(post.user.picture, '');
			assert.strictEqual(post.user['icon:text'], 'A');
			assert.strictEqual(post.user['icon:bgColor'], '#999');
			assert.strictEqual(post.user.displayname, 'Anonymous');
			assert.strictEqual(post.user.banned, 0);
			assert.strictEqual(post.user.status, 'offline');
			assert.deepStrictEqual(post.user.custom_profile_info, []);
			assert.deepStrictEqual(post.user.selectedGroups, []);
			assert.strictEqual(post.user.signature, '');
		});
	});

	describe('getStatsUid()', () => {
		it('should return realUid for anonymous posts', () => {
			const postData = {
				isAnonymous: 1,
				uid: 0,
				realUid: 123,
			};

			assert.strictEqual(anonymous.getStatsUid(postData), 123);
		});

		it('should return uid for non-anonymous posts', () => {
			const postData = {
				isAnonymous: 0,
				uid: 456,
			};

			assert.strictEqual(anonymous.getStatsUid(postData), 456);
		});

		it('should return uid when isAnonymous is not set', () => {
			const postData = {
				uid: 789,
			};

			assert.strictEqual(anonymous.getStatsUid(postData), 789);
		});

		it('should handle posts without isAnonymous property', () => {
			const postData = { uid: 999, content: 'test' };
			assert.strictEqual(anonymous.getStatsUid(postData), 999);
		});

		it('should return realUid even if uid is non-zero for anonymous posts', () => {
			const postData = {
				isAnonymous: 1,
				uid: 100,
				realUid: 200,
			};

			assert.strictEqual(anonymous.getStatsUid(postData), 200);
		});
	});

	describe('getRealAuthorUid()', () => {
		it('should return realUid when it exists', () => {
			const postData = {
				isAnonymous: 1,
				uid: 0,
				realUid: 123,
			};

			assert.strictEqual(anonymous.getRealAuthorUid(postData, 999), 123);
		});

		it('should return fallbackUid when realUid does not exist', () => {
			const postData = {
				isAnonymous: 0,
				uid: 456,
			};

			assert.strictEqual(anonymous.getRealAuthorUid(postData, 999), 999);
		});

		it('should return fallbackUid when postData has no realUid property', () => {
			const postData = { uid: 100 };
			assert.strictEqual(anonymous.getRealAuthorUid(postData, 200), 200);
		});

		it('should return realUid even if fallbackUid is provided', () => {
			const postData = {
				realUid: 111,
				uid: 222,
			};

			assert.strictEqual(anonymous.getRealAuthorUid(postData, 333), 111);
		});

		it('should handle realUid of 0', () => {
			const postData = {
				realUid: 0,
			};

			// realUid of 0 is falsy, so fallback should be used
			assert.strictEqual(anonymous.getRealAuthorUid(postData, 100), 100);
		});

		it('should work without fallbackUid parameter', () => {
			const postData = { realUid: 150 };
			assert.strictEqual(anonymous.getRealAuthorUid(postData), 150);
		});

		it('should return undefined when no realUid and no fallbackUid', () => {
			const postData = { uid: 100 };
			assert.strictEqual(anonymous.getRealAuthorUid(postData), undefined);
		});
	});
});
