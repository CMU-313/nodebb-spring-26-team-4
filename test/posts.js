'use strict';


const assert = require('assert');

const nconf = require('nconf');
const path = require('path');
const util = require('util');

const sleep = util.promisify(setTimeout);

const db = require('./mocks/databasemock');
const topics = require('../src/topics');
const posts = require('../src/posts');
const categories = require('../src/categories');
const privileges = require('../src/privileges');
const user = require('../src/user');
const groups = require('../src/groups');
const socketPosts = require('../src/socket.io/posts');
const apiPosts = require('../src/api/posts');
const apiTopics = require('../src/api/topics');
const meta = require('../src/meta');
const file = require('../src/file');
const helpers = require('./helpers');
const utils = require('../src/utils');
const request = require('../src/request');

describe('Post\'s', () => {
	let voterUid;
	let voteeUid;
	let globalModUid;
	let postData;
	let topicData;
	let cid;

	before(async () => {
		voterUid = await user.create({ username: 'upvoter' });
		voteeUid = await user.create({ username: 'upvotee' });
		globalModUid = await user.create({ username: 'globalmod', password: 'globalmodpwd' });
		({ cid } = await categories.create({
			name: 'Test Category',
			description: 'Test category created by testing script',
		}));

		({ topicData, postData } = await topics.post({
			uid: voteeUid,
			cid: cid,
			title: 'Test Topic Title',
			content: 'The content of test topic',
		}));
		await groups.join('Global Moderators', globalModUid);
	});

	it('should update category teaser properly', async () => {
		const getCategoriesAsync = async () => (await request.get(`${nconf.get('url')}/api/categories`, { })).body;
		const postResult = await topics.post({ uid: globalModUid, cid: cid, title: 'topic title', content: '123456789' });

		let data = await getCategoriesAsync();
		assert.equal(data.categories[0].teaser.pid, postResult.postData.pid);
		assert.equal(data.categories[0].posts[0].content, '123456789');
		assert.equal(data.categories[0].posts[0].pid, postResult.postData.pid);

		const newUid = await user.create({ username: 'teaserdelete' });
		const newPostResult = await topics.post({ uid: newUid, cid: cid, title: 'topic title', content: 'xxxxxxxx' });

		data = await getCategoriesAsync();
		assert.equal(data.categories[0].teaser.pid, newPostResult.postData.pid);
		assert.equal(data.categories[0].posts[0].content, 'xxxxxxxx');
		assert.equal(data.categories[0].posts[0].pid, newPostResult.postData.pid);

		await user.delete(1, newUid);

		data = await getCategoriesAsync();
		assert.equal(data.categories[0].teaser.pid, postResult.postData.pid);
		assert.equal(data.categories[0].posts[0].content, '123456789');
		assert.equal(data.categories[0].posts[0].pid, postResult.postData.pid);
	});

	it('should change owner of post and topic properly', async () => {
		const oldUid = await user.create({ username: 'olduser' });
		const newUid = await user.create({ username: 'newuser' });
		const postResult = await topics.post({ uid: oldUid, cid: cid, title: 'change owner', content: 'original post' });
		const postData = await topics.reply({ uid: oldUid, tid: postResult.topicData.tid, content: 'firstReply' });
		const pid1 = postResult.postData.pid;
		const pid2 = postData.pid;

		assert.deepStrictEqual(await db.sortedSetScores(`tid:${postResult.topicData.tid}:posters`, [oldUid, newUid]), [2, null]);

		await socketPosts.changeOwner({ uid: globalModUid }, { pids: [pid1, pid2], toUid: newUid });

		assert.deepStrictEqual(await db.sortedSetScores(`tid:${postResult.topicData.tid}:posters`, [oldUid, newUid]), [null, 2]);

		assert.deepStrictEqual(await posts.isOwner([pid1, pid2], oldUid), [false, false]);
		assert.deepStrictEqual(await posts.isOwner([pid1, pid2], newUid), [true, true]);

		assert.strictEqual(await user.getUserField(oldUid, 'postcount'), 0);
		assert.strictEqual(await user.getUserField(newUid, 'postcount'), 2);

		assert.strictEqual(await user.getUserField(oldUid, 'topiccount'), 0);
		assert.strictEqual(await user.getUserField(newUid, 'topiccount'), 1);

		assert.strictEqual(await db.sortedSetScore('users:postcount', oldUid), 0);
		assert.strictEqual(await db.sortedSetScore('users:postcount', newUid), 2);

		assert.strictEqual(await topics.isOwner(postResult.topicData.tid, oldUid), false);
		assert.strictEqual(await topics.isOwner(postResult.topicData.tid, newUid), true);

		assert.strictEqual(await topics.getTopicField(postResult.topicData.tid, 'postercount'), 1);
	});

	it('should fail to change owner if new owner does not exist', async () => {
		try {
			await posts.changeOwner([1], '9999999');
		} catch (err) {
			assert.strictEqual(err.message, '[[error:no-user]]');
		}
	});

	it('should fail to change owner if user is not authorized', async () => {
		try {
			await apiPosts.changeOwner({ uid: voterUid }, { pids: [1, 2], uid: voterUid });
		} catch (err) {
			assert.strictEqual(err.message, '[[error:no-privileges]]');
		}
	});

	it('should return falsy if post does not exist', (done) => {
		posts.getPostData(9999, (err, postData) => {
			assert.ifError(err);
			assert.equal(postData, null);
			done();
		});
	});

	describe('voting', () => {
		it('should fail to upvote post if group does not have upvote permission', async () => {
			await privileges.categories.rescind(['groups:posts:upvote', 'groups:posts:downvote'], cid, 'registered-users');
			let err;
			try {
				await apiPosts.upvote({ uid: voterUid }, { pid: postData.pid, room_id: 'topic_1' });
			} catch (_err) {
				err = _err;
			}
			assert.equal(err.message, '[[error:no-privileges]]');
			try {
				await apiPosts.downvote({ uid: voterUid }, { pid: postData.pid, room_id: 'topic_1' });
			} catch (_err) {
				err = _err;
			}
			assert.equal(err.message, '[[error:no-privileges]]');
			await privileges.categories.give(['groups:posts:upvote', 'groups:posts:downvote'], cid, 'registered-users');
		});

		it('should upvote a post', async () => {
			const result = await apiPosts.upvote({ uid: voterUid }, { pid: postData.pid, room_id: 'topic_1' });
			assert.equal(result.post.upvotes, 1);
			assert.equal(result.post.downvotes, 0);
			assert.equal(result.post.votes, 1);
			assert.equal(result.user.reputation, 1);
			const data = await posts.hasVoted(postData.pid, voterUid);
			assert.equal(data.upvoted, true);
			assert.equal(data.downvoted, false);
		});

		it('should add the pid to the :votes sorted set for that user', async () => {
			const cid = await posts.getCidByPid(postData.pid);
			const { uid, pid } = postData;

			const score = await db.sortedSetScore(`cid:${cid}:uid:${uid}:pids:votes`, pid);
			assert.strictEqual(score, 1);
		});

		it('should get voters', (done) => {
			socketPosts.getVoters({ uid: globalModUid }, { pid: postData.pid, cid: cid }, (err, data) => {
				assert.ifError(err);
				assert.equal(data.upvoteCount, 1);
				assert.equal(data.downvoteCount, 0);
				assert(Array.isArray(data.upvoters));
				assert.equal(data.upvoters[0].username, 'upvoter');
				done();
			});
		});

		it('should get upvoters', (done) => {
			socketPosts.getUpvoters({ uid: globalModUid }, [postData.pid], (err, data) => {
				assert.ifError(err);
				assert.equal(data.otherCount, 0);
				assert.equal(data.usernames, 'upvoter');
				done();
			});
		});

		it('should fail to get upvoters if user does not have read privilege', async () => {
			await privileges.categories.rescind(['groups:topics:read'], cid, 'guests');
			await assert.rejects(socketPosts.getUpvoters({ uid: 0 }, [postData.pid]), {
				message: '[[error:no-privileges]]',
			});
			await privileges.categories.give(['groups:topics:read'], cid, 'guests');
		});

		it('should unvote a post', async () => {
			const result = await apiPosts.unvote({ uid: voterUid }, { pid: postData.pid, room_id: 'topic_1' });
			assert.equal(result.post.upvotes, 0);
			assert.equal(result.post.downvotes, 0);
			assert.equal(result.post.votes, 0);
			assert.equal(result.user.reputation, 0);
			const data = await posts.hasVoted(postData.pid, voterUid);
			assert.equal(data.upvoted, false);
			assert.equal(data.downvoted, false);
		});

		it('should downvote a post', async () => {
			const result = await apiPosts.downvote({ uid: voterUid }, { pid: postData.pid, room_id: 'topic_1' });
			assert.equal(result.post.upvotes, 0);
			assert.equal(result.post.downvotes, 1);
			assert.equal(result.post.votes, -1);
			assert.equal(result.user.reputation, -1);
			const data = await posts.hasVoted(postData.pid, voterUid);
			assert.equal(data.upvoted, false);
			assert.equal(data.downvoted, true);
		});

		it('should add the pid to the :votes sorted set for that user', async () => {
			const cid = await posts.getCidByPid(postData.pid);
			const { uid, pid } = postData;

			const score = await db.sortedSetScore(`cid:${cid}:uid:${uid}:pids:votes`, pid);
			assert.strictEqual(score, -1);
		});

		it('should prevent downvoting more than total daily limit', async () => {
			const oldValue = meta.config.downvotesPerDay;
			meta.config.downvotesPerDay = 1;
			let err;
			const p1 = await topics.reply({
				uid: voteeUid,
				tid: topicData.tid,
				content: 'raw content',
			});
			try {
				await apiPosts.downvote({ uid: voterUid }, { pid: p1.pid, room_id: 'topic_1' });
			} catch (_err) {
				err = _err;
			}
			assert.equal(err.message, '[[error:too-many-downvotes-today, 1]]');
			meta.config.downvotesPerDay = oldValue;
		});

		it('should prevent downvoting target user more than total daily limit', async () => {
			const oldValue = meta.config.downvotesPerUserPerDay;
			meta.config.downvotesPerUserPerDay = 1;
			let err;
			const p1 = await topics.reply({
				uid: voteeUid,
				tid: topicData.tid,
				content: 'raw content',
			});
			try {
				await apiPosts.downvote({ uid: voterUid }, { pid: p1.pid, room_id: 'topic_1' });
			} catch (_err) {
				err = _err;
			}
			assert.equal(err.message, '[[error:too-many-downvotes-today-user, 1]]');
			meta.config.downvotesPerUserPerDay = oldValue;
		});
	});

	describe('bookmarking', () => {
		it('should bookmark a post', async () => {
			const data = await apiPosts.bookmark({ uid: voterUid }, { pid: postData.pid, room_id: `topic_${postData.tid}` });
			assert.equal(data.isBookmarked, true);
			const hasBookmarked = await posts.hasBookmarked(postData.pid, voterUid);
			assert.equal(hasBookmarked, true);
		});

		it('should unbookmark a post', async () => {
			const data = await apiPosts.unbookmark({ uid: voterUid }, { pid: postData.pid, room_id: `topic_${postData.tid}` });
			assert.equal(data.isBookmarked, false);
			const hasBookmarked = await posts.hasBookmarked([postData.pid], voterUid);
			assert.equal(hasBookmarked[0], false);
		});
	});

	describe('post tools', () => {
		it('should error if data is invalid', (done) => {
			socketPosts.loadPostTools({ uid: globalModUid }, null, (err) => {
				assert.equal(err.message, '[[error:invalid-data]]');
				done();
			});
		});

		it('should load post tools', (done) => {
			socketPosts.loadPostTools({ uid: globalModUid }, { pid: postData.pid, cid: cid }, (err, data) => {
				assert.ifError(err);
				assert(data.posts.display_edit_tools);
				assert(data.posts.display_delete_tools);
				assert(data.posts.display_moderator_tools);
				assert(data.posts.display_move_tools);
				done();
			});
		});
	});

	describe('delete/restore/purge', () => {
		async function createTopicWithReply() {
			const topicPostData = await topics.post({
				uid: voterUid,
				cid: cid,
				title: 'topic to delete/restore/purge',
				content: 'A post to delete/restore/purge',
			});

			const replyData = await topics.reply({
				uid: voterUid,
				tid: topicPostData.topicData.tid,
				timestamp: Date.now(),
				content: 'A post to delete/restore and purge',
			});
			return [topicPostData, replyData];
		}

		let tid;
		let mainPid;
		let replyPid;

		before(async () => {
			const [topicPostData, replyData] = await createTopicWithReply();
			tid = topicPostData.topicData.tid;
			mainPid = topicPostData.postData.pid;
			replyPid = replyData.pid;
			await privileges.categories.give(['groups:purge'], cid, 'registered-users');
		});

		it('should error with invalid data', async () => {
			try {
				await apiPosts.delete({ uid: voterUid }, null);
			} catch (err) {
				return assert.equal(err.message, '[[error:invalid-data]]');
			}
			assert(false);
		});

		it('should delete a post', async () => {
			await apiPosts.delete({ uid: voterUid }, { pid: replyPid, tid: tid });
			const isDeleted = await posts.getPostField(replyPid, 'deleted');
			assert.strictEqual(isDeleted, 1);
		});

		it('should not see post content if global mod does not have posts:view_deleted privilege', async () => {
			const uid = await user.create({ username: 'global mod', password: '123456' });
			await groups.join('Global Moderators', uid);
			await privileges.categories.rescind(['groups:posts:view_deleted'], cid, 'Global Moderators');
			const { jar } = await helpers.loginUser('global mod', '123456');
			const { body } = await request.get(`${nconf.get('url')}/api/topic/${tid}`, { jar });
			assert.equal(body.posts[1].content, '[[topic:post-is-deleted]]');
			await privileges.categories.give(['groups:posts:view_deleted'], cid, 'Global Moderators');
		});

		it('should restore a post', async () => {
			await apiPosts.restore({ uid: voterUid }, { pid: replyPid, tid: tid });
			const isDeleted = await posts.getPostField(replyPid, 'deleted');
			assert.strictEqual(isDeleted, 0);
		});

		it('should delete topic if last main post is deleted', async () => {
			const data = await topics.post({ uid: voterUid, cid: cid, title: 'test topic', content: 'test topic' });
			await apiPosts.delete({ uid: globalModUid }, { pid: data.postData.pid });
			const deleted = await topics.getTopicField(data.topicData.tid, 'deleted');
			assert.strictEqual(deleted, 1);
		});

		it('should purge posts and purge topic', async () => {
			const [topicPostData, replyData] = await createTopicWithReply();
			await apiPosts.purge({ uid: voterUid }, { pid: replyData.pid });
			await apiPosts.purge({ uid: voterUid }, { pid: topicPostData.postData.pid });
			const pidExists = await posts.exists(replyData.pid);
			assert.strictEqual(pidExists, false);
			const tidExists = await topics.exists(topicPostData.topicData.tid);
			assert.strictEqual(tidExists, false);
		});
	});

	describe('edit', () => {
		let pid;
		let replyPid;
		let tid;
		before((done) => {
			topics.post({
				uid: voterUid,
				cid: cid,
				title: 'topic to edit',
				content: 'A post to edit',
				tags: ['nodebb'],
			}, (err, data) => {
				assert.ifError(err);
				pid = data.postData.pid;
				tid = data.topicData.tid;
				topics.reply({
					uid: voterUid,
					tid: tid,
					timestamp: Date.now(),
					content: 'A reply to edit',
				}, (err, data) => {
					assert.ifError(err);
					replyPid = data.pid;
					privileges.categories.give(['groups:posts:edit'], cid, 'registered-users', done);
				});
			});
		});

		it('should error if user is not logged in', async () => {
			try {
				await apiPosts.edit({ uid: 0 }, { pid: pid, content: 'gg' });
			} catch (err) {
				return assert.equal(err.message, '[[error:not-logged-in]]');
			}
			assert(false);
		});

		it('should error if data is invalid or missing', async () => {
			try {
				await apiPosts.edit({ uid: voterUid }, {});
			} catch (err) {
				return assert.equal(err.message, '[[error:invalid-data]]');
			}
			assert(false);
		});

		it('should error if title is too short', async () => {
			try {
				await apiPosts.edit({ uid: voterUid }, { pid: pid, content: 'edited post content', title: 'a' });
			} catch (err) {
				return assert.equal(err.message, `[[error:title-too-short, ${meta.config.minimumTitleLength}]]`);
			}
			assert(false);
		});

		it('should error if title is too long', async () => {
			const longTitle = new Array(meta.config.maximumTitleLength + 2).join('a');
			try {
				await apiPosts.edit({ uid: voterUid }, { pid: pid, content: 'edited post content', title: longTitle });
			} catch (err) {
				return assert.equal(err.message, `[[error:title-too-long, ${meta.config.maximumTitleLength}]]`);
			}
			assert(false);
		});

		it('should error with too few tags', async () => {
			const oldValue = meta.config.minimumTagsPerTopic;
			meta.config.minimumTagsPerTopic = 1;
			try {
				await apiPosts.edit({ uid: voterUid }, { pid: pid, content: 'edited post content', tags: [] });
			} catch (err) {
				assert.equal(err.message, `[[error:not-enough-tags, ${meta.config.minimumTagsPerTopic}]]`);
				meta.config.minimumTagsPerTopic = oldValue;
				return;
			}
			assert(false);
		});

		it('should error with too many tags', async () => {
			const tags = [];
			for (let i = 0; i < meta.config.maximumTagsPerTopic + 1; i += 1) {
				tags.push(`tag${i}`);
			}
			try {
				await apiPosts.edit({ uid: voterUid }, { pid: pid, content: 'edited post content', tags: tags });
			} catch (err) {
				return assert.equal(err.message, `[[error:too-many-tags, ${meta.config.maximumTagsPerTopic}]]`);
			}
			assert(false);
		});

		it('should error if content is too short', async () => {
			try {
				await apiPosts.edit({ uid: voterUid }, { pid: pid, content: 'e' });
			} catch (err) {
				return assert.equal(err.message, `[[error:content-too-short, ${meta.config.minimumPostLength}]]`);
			}
			assert(false);
		});

		it('should error if content is too long', async () => {
			const longContent = new Array(meta.config.maximumPostLength + 2).join('a');
			try {
				await apiPosts.edit({ uid: voterUid }, { pid: pid, content: longContent });
			} catch (err) {
				return assert.equal(err.message, `[[error:content-too-long, ${meta.config.maximumPostLength}]]`);
			}
			assert(false);
		});

		it('should edit post', async () => {
			const data = await apiPosts.edit({ uid: voterUid }, {
				pid: pid,
				content: 'edited post content',
				title: 'edited title',
				tags: ['edited'],
			});

			assert.strictEqual(data.content, 'edited post content');
			assert.strictEqual(data.editor, voterUid);
			assert.strictEqual(data.topic.title, 'edited title');
			assert.strictEqual(data.topic.tags[0].value, 'edited');
			const res = await db.getObject(`post:${pid}`);
			assert(!res.hasOwnProperty('bookmarks'));
		});

		it('should disallow post editing for new users if post was made past the threshold for editing', async () => {
			meta.config.newbiePostEditDuration = 1;
			await sleep(1000);
			try {
				await apiPosts.edit({ uid: voterUid }, { pid: pid, content: 'edited post content again', title: 'edited title again', tags: ['edited-twice'] });
			} catch (err) {
				assert.equal(err.message, '[[error:post-edit-duration-expired, 1]]');
				meta.config.newbiePostEditDuration = 3600;
				return;
			}
			assert(false);
		});

		it('should edit a deleted post', async () => {
			await apiPosts.delete({ uid: voterUid }, { pid: pid, tid: tid });
			const data = await apiPosts.edit({ uid: voterUid }, { pid: pid, content: 'edited deleted content', title: 'edited deleted title', tags: ['deleted'] });
			assert.equal(data.content, 'edited deleted content');
			assert.equal(data.editor, voterUid);
			assert.equal(data.topic.title, 'edited deleted title');
			assert.equal(data.topic.tags[0].value, 'deleted');
		});

		it('should edit a reply post', async () => {
			const data = await apiPosts.edit({ uid: voterUid }, { pid: replyPid, content: 'edited reply' });
			assert.equal(data.content, 'edited reply');
			assert.equal(data.editor, voterUid);
			assert.equal(data.topic.isMainPost, false);
			assert.equal(data.topic.renamed, false);
		});

		it('should return diffs', (done) => {
			posts.diffs.get(replyPid, 0, (err, data) => {
				assert.ifError(err);
				assert(Array.isArray(data));
				assert(data[0].pid, replyPid);
				assert(data[0].patch);
				done();
			});
		});

		it('should load diffs and reconstruct post', (done) => {
			posts.diffs.load(replyPid, 0, voterUid, (err, data) => {
				assert.ifError(err);
				assert.equal(data.content, 'A reply to edit');
				done();
			});
		});

		it('should not allow guests to view diffs', async () => {
			let err = {};
			try {
				await apiPosts.getDiffs({ uid: 0 }, { pid: 1 });
			} catch (_err) {
				err = _err;
			}
			assert.strictEqual(err.message, '[[error:no-privileges]]');
		});

		it('should allow registered-users group to view diffs', async () => {
			const data = await apiPosts.getDiffs({ uid: 1 }, { pid: 1 });

			assert.strictEqual('boolean', typeof data.editable);
			assert.strictEqual(false, data.editable);

			assert.equal(true, Array.isArray(data.timestamps));
			assert.strictEqual(1, data.timestamps.length);

			assert.equal(true, Array.isArray(data.revisions));
			assert.strictEqual(data.timestamps.length, data.revisions.length);
			['timestamp', 'username'].every(prop => Object.keys(data.revisions[0]).includes(prop));
		});

		it('should not delete first diff of a post', async () => {
			const timestamps = await posts.diffs.list(replyPid);
			await assert.rejects(
				posts.diffs.delete(replyPid, timestamps[0], voterUid),
				{ message: '[[error:invalid-data]]' }
			);
		});

		it('should delete a post diff', async () => {
			await apiPosts.edit({ uid: voterUid }, { pid: replyPid, content: 'another edit has been made' });
			await apiPosts.edit({ uid: voterUid }, { pid: replyPid, content: 'most recent edit' });
			const timestamp = (await posts.diffs.list(replyPid)).pop();
			await posts.diffs.delete(replyPid, timestamp, voterUid);
			const differentTimestamp = (await posts.diffs.list(replyPid)).pop();
			assert.notStrictEqual(timestamp, differentTimestamp);
		});

		it('should load (oldest) diff and reconstruct post correctly after a diff deletion', async () => {
			const data = await posts.diffs.load(replyPid, 0, voterUid);
			assert.strictEqual(data.content, 'A reply to edit');
		});
	});

	describe('move', () => {
		let replyPid;
		let tid;
		let moveTid;

		before(async () => {
			const topic1 = await topics.post({
				uid: voterUid,
				cid: cid,
				title: 'topic 1',
				content: 'some content',
			});
			tid = topic1.topicData.tid;
			const topic2 = await topics.post({
				uid: voterUid,
				cid: cid,
				title: 'topic 2',
				content: 'some content',
			});
			moveTid = topic2.topicData.tid;

			const reply = await topics.reply({
				uid: voterUid,
				tid: tid,
				timestamp: Date.now(),
				content: 'A reply to move',
			});
			replyPid = reply.pid;
		});

		it('should error if uid is not logged in', async () => {
			try {
				await apiPosts.move({ uid: 0 }, {});
			} catch (err) {
				return assert.equal(err.message, '[[error:not-logged-in]]');
			}
			assert(false);
		});

		it('should error if data is invalid', async () => {
			try {
				await apiPosts.move({ uid: globalModUid }, {});
			} catch (err) {
				return assert.equal(err.message, '[[error:invalid-data]]');
			}
			assert(false);
		});

		it('should error if user does not have move privilege', async () => {
			try {
				await apiPosts.move({ uid: voterUid }, { pid: replyPid, tid: moveTid });
			} catch (err) {
				return assert.equal(err.message, '[[error:no-privileges]]');
			}
			assert(false);
		});

		it('should move a post', async () => {
			await apiPosts.move({ uid: globalModUid }, { pid: replyPid, tid: moveTid });
			const tid = await posts.getPostField(replyPid, 'tid');
			assert(tid, moveTid);
		});

		it('should fail to move post if not moderator of target category', async () => {
			const cat1 = await categories.create({ name: 'Test Category', description: 'Test category created by testing script' });
			const cat2 = await categories.create({ name: 'Test Category', description: 'Test category created by testing script' });
			const result = await apiTopics.create({ uid: globalModUid }, { title: 'target topic', content: 'queued topic', cid: cat2.cid });
			const modUid = await user.create({ username: 'modofcat1' });
			const userPrivilegeList = await privileges.categories.getUserPrivilegeList();
			await privileges.categories.give(userPrivilegeList, cat1.cid, modUid);
			let err;
			try {
				await apiPosts.move({ uid: modUid }, { pid: replyPid, tid: result.tid });
			} catch (_err) {
				err = _err;
			}
			assert.strictEqual(err.message, '[[error:no-privileges]]');
		});
	});

	describe('getPostSummaryByPids', () => {
		it('should return empty array for empty pids', (done) => {
			posts.getPostSummaryByPids([], 0, {}, (err, data) => {
				assert.ifError(err);
				assert.equal(data.length, 0);
				done();
			});
		});

		it('should get post summaries', (done) => {
			posts.getPostSummaryByPids([postData.pid], 0, {}, (err, data) => {
				assert.ifError(err);
				assert(data[0].user);
				assert(data[0].topic);
				assert(data[0].category);
				done();
			});
		});
	});

	it('should get recent poster uids', (done) => {
		topics.reply({
			uid: voterUid,
			tid: topicData.tid,
			timestamp: Date.now(),
			content: 'some content',
		}, (err) => {
			assert.ifError(err);
			posts.getRecentPosterUids(0, 1, (err, uids) => {
				assert.ifError(err);
				assert(Array.isArray(uids));
				assert.equal(uids.length, 2);
				assert.equal(uids[0], voterUid);
				done();
			});
		});
	});

	describe('parse', () => {
		it('should not crash and return falsy if post data is falsy', (done) => {
			posts.parsePost(null, (err, postData) => {
				assert.ifError(err);
				assert.strictEqual(postData, null);
				done();
			});
		});

		it('should store post content in cache', (done) => {
			const oldValue = global.env;
			global.env = 'production';
			const postData = {
				pid: 9999,
				content: 'some post content',
			};
			posts.parsePost(postData, (err) => {
				assert.ifError(err);
				posts.parsePost(postData, (err) => {
					assert.ifError(err);
					global.env = oldValue;
					done();
				});
			});
		});

		it('should parse signature and remove links and images', (done) => {
			meta.config['signatures:disableLinks'] = 1;
			meta.config['signatures:disableImages'] = 1;
			const userData = {
				signature: '<img src="boop"/><a href="link">test</a> derp',
			};

			posts.parseSignature(userData, 1, (err, data) => {
				assert.ifError(err);
				assert.equal(data.userData.signature, 'test derp');
				meta.config['signatures:disableLinks'] = 0;
				meta.config['signatures:disableImages'] = 0;
				done();
			});
		});

		it('should turn relative links in post body to absolute urls', (done) => {
			const nconf = require('nconf');
			const content = '<a href="/users">test</a> <a href="//youtube.com">youtube</a>';
			const parsedContent = posts.relativeToAbsolute(content, posts.urlRegex);
			assert.equal(parsedContent, `<a href="${nconf.get('base_url')}/users">test</a> <a href="${nconf.get('url_parsed').protocol}//youtube.com/">youtube</a>`);
			done();
		});

		it('should turn relative links in post body to absolute urls', (done) => {
			const nconf = require('nconf');
			const content = '<a href="/users">test</a> <a href="//youtube.com">youtube</a> some test <img src="/path/to/img"/>';
			let parsedContent = posts.relativeToAbsolute(content, posts.urlRegex);
			parsedContent = posts.relativeToAbsolute(parsedContent, posts.imgRegex);
			assert.equal(parsedContent, `<a href="${nconf.get('base_url')}/users">test</a> <a href="${nconf.get('url_parsed').protocol}//youtube.com/">youtube</a> some test <img src="${nconf.get('base_url')}/path/to/img"/>`);
			done();
		});
	});

	describe('socket methods', () => {
		let pid;
		before((done) => {
			topics.reply({
				uid: voterUid,
				tid: topicData.tid,
				timestamp: Date.now(),
				content: 'raw content',
			}, (err, postData) => {
				assert.ifError(err);
				pid = postData.pid;
				privileges.categories.rescind(['groups:topics:read'], cid, 'guests', done);
			});
		});

		it('should error with invalid data', async () => {
			try {
				await apiTopics.reply({ uid: 0 }, null);
				assert(false);
			} catch (err) {
				assert.equal(err.message, '[[error:invalid-data]]');
			}
		});

		it('should error with invalid tid', async () => {
			try {
				await apiTopics.reply({ uid: 0 }, { tid: 0, content: 'derp' });
				assert(false);
			} catch (err) {
				assert.equal(err.message, '[[error:invalid-data]]');
			}
		});

		it('should fail to get raw post because of privilege', async () => {
			const content = await apiPosts.getRaw({ uid: 0 }, { pid });
			assert.strictEqual(content, null);
		});

		it('should fail to get raw post because post is deleted', async () => {
			await posts.setPostField(pid, 'deleted', 1);
			const content = await apiPosts.getRaw({ uid: voterUid }, { pid });
			assert.strictEqual(content, null);
		});

		it('should allow privileged users to view the deleted post\'s raw content', async () => {
			await posts.setPostField(pid, 'deleted', 1);
			const content = await apiPosts.getRaw({ uid: globalModUid }, { pid });
			assert.strictEqual(content, 'raw content');
		});

		it('should get raw post content', async () => {
			await posts.setPostField(pid, 'deleted', 0);
			const postContent = await apiPosts.getRaw({ uid: voterUid }, { pid });
			assert.equal(postContent, 'raw content');
		});

		it('should get post', async () => {
			const postData = await apiPosts.get({ uid: voterUid }, { pid });
			assert(postData);
		});

		it('should get post summary', async () => {
			const summary = await apiPosts.getSummary({ uid: voterUid }, { pid });
			assert(summary);
		});

		it('should get raw post content', async () => {
			const postContent = await socketPosts.getRawPost({ uid: voterUid }, pid);
			assert.equal(postContent, 'raw content');
		});

		it('should get post summary by index', async () => {
			const summary = await socketPosts.getPostSummaryByIndex({ uid: voterUid }, {
				index: 1,
				tid: topicData.tid,
			});
			assert(summary);
		});

		it('should get post timestamp by index', async () => {
			const timestamp = await socketPosts.getPostTimestampByIndex({ uid: voterUid }, {
				index: 1,
				tid: topicData.tid,
			});
			assert(utils.isNumber(timestamp));
		});

		it('should get post timestamp by index', async () => {
			const summary = await socketPosts.getPostSummaryByPid({ uid: voterUid }, {
				pid: pid,
			});
			assert(summary);
		});

		it('should get post category', async () => {
			const postCid = await socketPosts.getCategory({ uid: voterUid }, pid);
			assert.equal(cid, postCid);
		});

		it('should get pid index', async () => {
			const index = await socketPosts.getPidIndex({ uid: voterUid }, { pid: pid, tid: topicData.tid, topicPostSort: 'oldest_to_newest' });
			assert.equal(index, 4);
		});

		it('should get pid index', async () => {
			const index = await apiPosts.getIndex({ uid: voterUid }, { pid: pid, sort: 'oldest_to_newest' });
			assert.strictEqual(index, 4);
		});

		it('should get pid index in reverse', async () => {
			const postData = await topics.reply({
				uid: voterUid,
				tid: topicData.tid,
				content: 'raw content',
			});

			const index = await apiPosts.getIndex({ uid: voterUid }, { pid: postData.pid, sort: 'newest_to_oldest' });
			assert.equal(index, 1);
		});
	});

	describe('filterPidsByCid', () => {
		it('should return pids as is if cid is falsy', (done) => {
			posts.filterPidsByCid([1, 2, 3], null, (err, pids) => {
				assert.ifError(err);
				assert.deepEqual([1, 2, 3], pids);
				done();
			});
		});

		it('should filter pids by single cid', (done) => {
			posts.filterPidsByCid([postData.pid, 100, 101], cid, (err, pids) => {
				assert.ifError(err);
				assert.deepEqual([postData.pid], pids);
				done();
			});
		});

		it('should filter pids by multiple cids', (done) => {
			posts.filterPidsByCid([postData.pid, 100, 101], [cid, 2, 3], (err, pids) => {
				assert.ifError(err);
				assert.deepEqual([postData.pid], pids);
				done();
			});
		});

		it('should filter pids by multiple cids', (done) => {
			posts.filterPidsByCid([postData.pid, 100, 101], [cid], (err, pids) => {
				assert.ifError(err);
				assert.deepEqual([postData.pid], pids);
				done();
			});
		});
	});

	it('should error if user does not exist', (done) => {
		user.isReadyToPost(21123123, 1, (err) => {
			assert.equal(err.message, '[[error:no-user]]');
			done();
		});
	});

	describe('post queue', () => {
		let uid;
		let queueId;
		let topicQueueId;
		let jar;
		before((done) => {
			meta.config.postQueue = 1;
			user.create({ username: 'newuser' }, (err, _uid) => {
				assert.ifError(err);
				uid = _uid;
				done();
			});
		});

		after((done) => {
			meta.config.postQueue = 0;
			meta.config.groupsExemptFromPostQueue = [];
			done();
		});

		it('should add topic to post queue', async () => {
			const result = await apiTopics.create({ uid: uid }, { title: 'should be queued', content: 'queued topic content', cid: cid });
			assert.strictEqual(result.queued, true);
			assert.equal(result.message, '[[success:post-queued]]');
			topicQueueId = result.id;
		});

		it('should add reply to post queue', async () => {
			const result = await apiTopics.reply({ uid: uid }, { content: 'this is a queued reply', tid: topicData.tid });
			assert.strictEqual(result.queued, true);
			assert.equal(result.message, '[[success:post-queued]]');
			queueId = result.id;
		});

		it('should load queued posts', async () => {
			({ jar } = await helpers.loginUser('globalmod', 'globalmodpwd'));
			const { body } = await request.get(`${nconf.get('url')}/api/post-queue`, { jar });
			const { posts } = body;
			assert.equal(posts[0].type, 'topic');
			assert.equal(posts[0].data.content, 'queued topic content');
			assert.equal(posts[1].type, 'reply');
			assert.equal(posts[1].data.content, 'this is a queued reply');
		});

		it('should error if data is invalid', async () => {
			await assert.rejects(
				apiPosts.editQueuedPost({ uid: globalModUid }, null),
				{ message: '[[error:invalid-data]]' },
			);
		});

		it('should edit post in queue', async () => {
			await apiPosts.editQueuedPost({ uid: globalModUid }, { id: queueId, content: 'newContent' });
			const { body } = await request.get(`${nconf.get('url')}/api/post-queue`, { jar });
			const { posts } = body;
			assert.equal(posts[1].type, 'reply');
			assert.equal(posts[1].data.content, 'newContent');
		});

		it('should edit topic title in queue', async () => {
			await apiPosts.editQueuedPost({ uid: globalModUid }, { id: topicQueueId, title: 'new topic title' });
			const { body } = await request.get(`${nconf.get('url')}/api/post-queue`, { jar });
			const { posts } = body;
			assert.equal(posts[0].type, 'topic');
			assert.equal(posts[0].data.title, 'new topic title');
		});

		it('should edit topic category in queue', async () => {
			await apiPosts.editQueuedPost({ uid: globalModUid }, { id: topicQueueId, cid: 2 });
			const { body } = await request.get(`${nconf.get('url')}/api/post-queue`, { jar });
			const { posts } = body;
			assert.equal(posts[0].type, 'topic');
			assert.equal(posts[0].data.cid, 2);
			await apiPosts.editQueuedPost({ uid: globalModUid }, { id: topicQueueId, cid: cid });
		});

		it('should prevent regular users from approving posts', async () => {
			await assert.rejects(
				apiPosts.acceptQueuedPost({ uid: uid }, { id: queueId }),
				{ message: '[[error:no-privileges]]' },
			);
		});

		it('should prevent regular users from approving non existing posts', async () => {
			await assert.rejects(
				apiPosts.acceptQueuedPost({ uid: uid }, { id: 123123 }),
				{ message: '[[error:no-post]]' },
			);
		});

		it('should accept queued posts and submit', async () => {
			const ids = await db.getSortedSetRange('post:queue', 0, -1);
			await apiPosts.acceptQueuedPost({ uid: globalModUid }, { id: ids[0] });
			await apiPosts.acceptQueuedPost({ uid: globalModUid }, { id: ids[1] });
		});

		it('should not crash if id does not exist', async () => {
			await assert.rejects(
				apiPosts.removeQueuedPost({ uid: globalModUid }, { id: '123123123' }),
				{ message: '[[error:no-post]]' },
			);
		});

		it('should bypass post queue if user is in exempt group', async () => {
			const oldValue = meta.config.groupsExemptFromPostQueue;
			meta.config.groupsExemptFromPostQueue = ['registered-users'];
			const uid = await user.create({ username: 'mergeexemptuser' });
			const result = await apiTopics.create({ uid: uid, emit: () => {} }, { title: 'should not be queued', content: 'topic content', cid: cid });
			assert.strictEqual(result.title, 'should not be queued');
			meta.config.groupsExemptFromPostQueue = oldValue;
		});

		it('should update queued post\'s topic if target topic is merged', async () => {
			const uid = await user.create({ username: 'mergetestsuser' });
			const result1 = await apiTopics.create({ uid: globalModUid }, { title: 'topic A', content: 'topic A content', cid: cid });
			const result2 = await apiTopics.create({ uid: globalModUid }, { title: 'topic B', content: 'topic B content', cid: cid });

			const result = await apiTopics.reply({ uid: uid }, { content: 'the moved queued post', tid: result1.tid });

			await topics.merge([
				result1.tid, result2.tid,
			], globalModUid, { mainTid: result2.tid });

			let postData = await posts.getQueuedPosts();
			postData = postData.filter(p => parseInt(p.data.tid, 10) === parseInt(result2.tid, 10));
			assert.strictEqual(postData.length, 1);
			assert.strictEqual(postData[0].data.content, 'the moved queued post');
			assert.strictEqual(postData[0].data.tid, result2.tid);
		});
	});

	describe('post editors', () => {
		it('should fail with invalid data', async () => {
			await assert.rejects(
				socketPosts.saveEditors({ uid: 0 }, {
					pid: 1,
					uids: [1],
				}),
				{ message: '[[error:no-privileges]]' },
			);
			await assert.rejects(
				socketPosts.saveEditors({ uid: 0 }, null),
				{ message: '[[error:invalid-data]]' },
			);
			await assert.rejects(
				socketPosts.saveEditors({ uid: 0 }, {
					pid: null,
					uids: [1],
				}),
				{ message: '[[error:invalid-data]]' },
			);
			await assert.rejects(
				socketPosts.saveEditors({ uid: 0 }, {
					pid: 1,
					uids: null,
				}),
				{ message: '[[error:invalid-data]]' },
			);

			await assert.rejects(
				socketPosts.getEditors({ uid: 0 }, null),
				{ message: '[[error:invalid-data]]' },
			);

			await assert.rejects(
				socketPosts.saveEditors({ uid: 0 }, { pid: null }),
				{ message: '[[error:invalid-data]]' },
			);
		});

		it('should add another user to post editors', async () => {
			const ownerUid = await user.create({ username: 'owner user' });
			const editorUid = await user.create({ username: 'editor user' });
			const topic = await topics.post({
				uid: ownerUid,
				cid,
				title: 'just a topic for multi editor testing',
				content: `Some text here for the OP`,
			});
			const { pid } = topic.postData;
			await socketPosts.saveEditors({ uid: ownerUid }, {
				pid: pid,
				uids: [editorUid],
			});

			const userData = await socketPosts.getEditors({ uid: ownerUid }, { pid: pid });
			assert.strictEqual(userData[0].username, 'editor user');
		});
	});

	describe('Topic Backlinks', () => {
		let tid1;
		before(async () => {
			tid1 = await topics.post({
				uid: 1,
				cid,
				title: 'Topic backlink testing - topic 1',
				content: 'Some text here for the OP',
			});
			tid1 = tid1.topicData.tid;
		});

		describe('.syncBacklinks()', () => {
			it('should error on invalid data', async () => {
				try {
					await topics.syncBacklinks();
				} catch (e) {
					assert(e);
					assert.strictEqual(e.message, '[[error:invalid-data]]');
				}
			});

			it('should do nothing if the post does not contain a link to a topic', async () => {
				const backlinks = await topics.syncBacklinks({
					content: 'This is a post\'s content',
				});

				assert.strictEqual(backlinks, 0);
			});

			it('should create a backlink if it detects a topic link in a post', async () => {
				const count = await topics.syncBacklinks({
					pid: 2,
					content: `This is a link to [topic 1](${nconf.get('url')}/topic/1/abcdef)`,
				});
				const events = await topics.events.get(1, 1);
				const backlinks = await db.getSortedSetMembers('pid:2:backlinks');

				assert.strictEqual(count, 1);
				assert(events);
				assert.strictEqual(events.length, 1);
				assert(backlinks);
				assert(backlinks.includes('1'));
			});

			it('should remove the backlink (but keep the event) if the post no longer contains a link to a topic', async () => {
				const count = await topics.syncBacklinks({
					pid: 2,
					content: 'This is a link to [nothing](http://example.org)',
				});
				const events = await topics.events.get(1, 1);
				const backlinks = await db.getSortedSetMembers('pid:2:backlinks');

				assert.strictEqual(count, 0);
				assert(events);
				assert.strictEqual(events.length, 1);
				assert(backlinks);
				assert.strictEqual(backlinks.length, 0);
			});

			it('should not detect backlinks if they are in quotes', async () => {
				const content = `
					@baris said in [ok testing backlinks](/post/32145):
					> here is a back link to a topic
					>
					>
					> This is a link to [topic 1](${nconf.get('url')}/topic/1/abcdef

					This should not generate backlink
				`;
				const count = await topics.syncBacklinks({
					pid: 2,
					content: content,
				});

				const backlinks = await db.getSortedSetMembers('pid:2:backlinks');

				assert.strictEqual(count, 0);
				assert(backlinks);
				assert.strictEqual(backlinks.length, 0);
			});
		});

		describe('integration tests', () => {
			it('should create a topic event in the referenced topic', async () => {
				const topic = await topics.post({
					uid: 1,
					cid,
					title: 'Topic backlink testing - topic 2',
					content: `Some text here for the OP &ndash; ${nconf.get('url')}/topic/${tid1}`,
				});

				const events = await topics.events.get(tid1, 1);
				assert(events);
				assert.strictEqual(events.length, 1);
				assert.strictEqual(events[0].type, 'backlink');
				assert.strictEqual(parseInt(events[0].uid, 10), 1);
				assert.strictEqual(events[0].href, `/post/${topic.postData.pid}`);
			});

			it('should not create a topic event if referenced topic is the same as current topic', async () => {
				await topics.reply({
					uid: 1,
					tid: tid1,
					content: `Referencing itself &ndash; ${nconf.get('url')}/topic/${tid1}`,
				});

				const events = await topics.events.get(tid1, 1);
				assert(events);
				assert.strictEqual(events.length, 1); // should still equal 1
			});

			it('should not show backlink events if the feature is disabled', async () => {
				meta.config.topicBacklinks = 0;

				await topics.post({
					uid: 1,
					cid,
					title: 'Topic backlink testing - topic 3',
					content: `Some text here for the OP &ndash; ${nconf.get('url')}/topic/${tid1}`,
				});

				const events = await topics.events.get(tid1, 1);
				assert(events);
				assert.strictEqual(events.length, 0);
			});
		});
	});

	/**
	 * Test suite for the post endorsement feature.
	 *
	 * The endorsement feature lets privileged users (those holding the global
	 * `posts:endorse` permission, e.g. Instructors and Administrators) mark a
	 * post as "endorsed".  The endorsed state is stored as an integer field on
	 * the post (0 = not endorsed, 1 = endorsed) and is surfaced to the client
	 * through both the REST API (PUT/DELETE /api/v3/posts/:pid/endorse) and the
	 * socket.io `loadPostTools` event.
	 *
	 * Setup
	 * -----
	 * `endorseAdminUid`  – a freshly created user joined to the administrators
	 *                      group so that all global privileges are automatically
	 *                      granted, including `posts:endorse`.
	 * `endorsePostData`  – a dedicated topic + first post used as the target for
	 *                      all endorsement operations, keeping state isolated from
	 *                      the rest of the suite.
	 * `voterUid`         – a plain registered user (no endorse privilege) reused
	 *                      from the outer describe scope to test access denial.
	 */
	describe('endorsement', () => {
		let endorseAdminUid;
		let endorsePostData;

		before(async () => {
			// Create a user with administrator rights so they hold the
			// posts:endorse global privilege without any extra setup.
			endorseAdminUid = await user.create({ username: 'endorseAdmin' });
			await groups.join('administrators', endorseAdminUid);

			// Create a dedicated post to use as the endorsement target
			// throughout the suite, avoiding interference with other tests.
			const result = await topics.post({
				uid: voteeUid,
				cid: cid,
				title: 'Test Topic for Endorsement',
				content: 'Test content for endorsement',
			});
			endorsePostData = result.postData;
		});

		// -------------------------------------------------------------------------
		// Input validation — postsAPI.endorse
		// -------------------------------------------------------------------------
		// postsAPI.endorse must reject calls that omit required fields before
		// performing any database or privilege work.

		// Verifies the null-data guard at the top of postsAPI.endorse.
		// Passing null instead of a data object must immediately throw
		// [[error:invalid-data]] without touching the database.
		it('should throw invalid-data error if data is null when endorsing', async () => {
			await assert.rejects(
				apiPosts.endorse({ uid: endorseAdminUid }, null),
				{ message: '[[error:invalid-data]]' }
			);
		});

		// Verifies the missing-pid guard in postsAPI.endorse.
		// An empty object (no pid property) is structurally invalid and must
		// throw [[error:invalid-data]] before any privilege check is attempted.
		it('should throw invalid-data error if pid is missing when endorsing', async () => {
			await assert.rejects(
				apiPosts.endorse({ uid: endorseAdminUid }, {}),
				{ message: '[[error:invalid-data]]' }
			);
		});

		// -------------------------------------------------------------------------
		// Privilege enforcement — postsAPI.endorse
		// -------------------------------------------------------------------------
		// The posts:endorse privilege is a global (non-category) permission.
		// Regular registered users do not hold it by default.

		// Verifies that postsAPI.endorse rejects callers who lack the global
		// posts:endorse privilege.  voterUid is a plain registered user with no
		// special permissions.
		it('should throw no-privileges error for user without endorse privilege', async () => {
			await assert.rejects(
				apiPosts.endorse({ uid: voterUid }, { pid: endorsePostData.pid }),
				{ message: '[[error:no-privileges]]' }
			);
		});

		// -------------------------------------------------------------------------
		// Post existence validation — postsAPI.endorse
		// -------------------------------------------------------------------------

		// Verifies that postsAPI.endorse checks whether the target post exists
		// before writing to the database.  pid 99999 is guaranteed not to exist
		// in the test environment.
		it('should throw invalid-pid error if post does not exist when endorsing', async () => {
			await assert.rejects(
				apiPosts.endorse({ uid: endorseAdminUid }, { pid: 99999 }),
				{ message: '[[error:invalid-pid]]' }
			);
		});

		// -------------------------------------------------------------------------
		// Functional correctness — postsAPI.endorse
		// -------------------------------------------------------------------------

		// Verifies the full happy path for endorsing a post:
		// - The return value includes the correct pid and endorsed=1.
		// - The endorsed field is actually persisted to the database so that
		//   subsequent reads reflect the new state.
		it('should endorse a post and return endorsed status 1', async () => {
			const result = await apiPosts.endorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			assert.strictEqual(result.pid, endorsePostData.pid);
			assert.strictEqual(result.endorsed, 1);
			const endorsed = await posts.getPostField(endorsePostData.pid, 'endorsed');
			assert.strictEqual(endorsed, 1);
		});

		// -------------------------------------------------------------------------
		// Input validation — postsAPI.unendorse
		// -------------------------------------------------------------------------
		// Mirror of the endorse input-validation tests: unendorse must apply the
		// same guards before performing any database or privilege work.

		// Verifies the null-data guard in postsAPI.unendorse.
		it('should throw invalid-data error if data is null when unendorsing', async () => {
			await assert.rejects(
				apiPosts.unendorse({ uid: endorseAdminUid }, null),
				{ message: '[[error:invalid-data]]' }
			);
		});

		// Verifies the missing-pid guard in postsAPI.unendorse.
		it('should throw invalid-data error if pid is missing when unendorsing', async () => {
			await assert.rejects(
				apiPosts.unendorse({ uid: endorseAdminUid }, {}),
				{ message: '[[error:invalid-data]]' }
			);
		});

		// -------------------------------------------------------------------------
		// Privilege enforcement — postsAPI.unendorse
		// -------------------------------------------------------------------------

		// Verifies that postsAPI.unendorse also requires the posts:endorse
		// privilege — the same permission gates both directions of the toggle.
		it('should throw no-privileges error for user without endorse privilege when unendorsing', async () => {
			await assert.rejects(
				apiPosts.unendorse({ uid: voterUid }, { pid: endorsePostData.pid }),
				{ message: '[[error:no-privileges]]' }
			);
		});

		// -------------------------------------------------------------------------
		// Post existence validation — postsAPI.unendorse
		// -------------------------------------------------------------------------

		// Verifies that postsAPI.unendorse rejects a non-existent pid with
		// [[error:invalid-pid]], consistent with the endorse direction.
		it('should throw invalid-pid error if post does not exist when unendorsing', async () => {
			await assert.rejects(
				apiPosts.unendorse({ uid: endorseAdminUid }, { pid: 99999 }),
				{ message: '[[error:invalid-pid]]' }
			);
		});

		// -------------------------------------------------------------------------
		// Functional correctness — postsAPI.unendorse
		// -------------------------------------------------------------------------

		// Verifies the full happy path for unendorsing a post:
		// - The return value includes the correct pid and endorsed=0.
		// - The endorsed field is persisted to the database as 0 so that
		//   subsequent reads confirm the post is no longer endorsed.
		// NOTE: endorsePostData was endorsed by the test above; this test
		// intentionally depends on that prior state to exercise the transition.
		it('should unendorse a post and return endorsed status 0', async () => {
			const result = await apiPosts.unendorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			assert.strictEqual(result.pid, endorsePostData.pid);
			assert.strictEqual(result.endorsed, 0);
			const endorsed = await posts.getPostField(endorsePostData.pid, 'endorsed');
			assert.strictEqual(endorsed, 0);
		});

		// -------------------------------------------------------------------------
		// Default state on post creation
		// -------------------------------------------------------------------------

		// Verifies that posts/create.js initialises the endorsed field to 0 for
		// every new post.  No explicit endorsement action should be needed to
		// establish this baseline state.
		it('should create posts with endorsed field set to 0 by default', async () => {
			const result = await topics.post({
				uid: voteeUid,
				cid: cid,
				title: 'New Post for Default Endorsed Check',
				content: 'Checking default endorsed state',
			});
			const endorsed = await posts.getPostField(result.postData.pid, 'endorsed');
			assert.strictEqual(endorsed, 0);
		});

		// -------------------------------------------------------------------------
		// socketPosts.loadPostTools — display_endorse_tools flag
		// -------------------------------------------------------------------------
		// loadPostTools is called by the client each time the post action menu is
		// opened.  It must set display_endorse_tools so that the template knows
		// whether to render the Endorse/Unendorse menu item at all.

		// Verifies that display_endorse_tools is true for a user who holds the
		// posts:endorse privilege, so the endorse menu item is rendered.
		it('should show endorse tools for users with endorse privilege', async () => {
			const result = await socketPosts.loadPostTools(
				{ uid: endorseAdminUid },
				{ pid: endorsePostData.pid, cid: cid }
			);
			assert.strictEqual(result.posts.display_endorse_tools, true);
		});

		// Verifies that display_endorse_tools is false for a user who does not
		// hold the posts:endorse privilege, so the menu item is hidden entirely.
		it('should not show endorse tools for users without endorse privilege', async () => {
			const result = await socketPosts.loadPostTools(
				{ uid: voterUid },
				{ pid: endorsePostData.pid, cid: cid }
			);
			assert.strictEqual(result.posts.display_endorse_tools, false);
		});

		// -------------------------------------------------------------------------
		// Endorsed field loaded on post load (loadPostTools)
		// -------------------------------------------------------------------------
		// loadPostTools explicitly fetches the endorsed field from the database
		// and includes it in the posts object it returns.  The client template
		// reads posts.endorsed to decide which button label to show:
		//   endorsed=0  →  menu item reads "Endorse"
		//   endorsed=1  →  menu item reads "Unendorse"
		// These tests confirm the server sends the correct value at each stage.

		// Verifies that loadPostTools exposes the endorsed field and that its
		// value is 0 when the post has not been endorsed.
		// (endorsePostData is in the unendorsed state after the tests above.)
		it('should include endorsed field in loadPostTools posts object (default 0)', async () => {
			// After previous tests, endorsePostData is in unendorsed state
			const result = await socketPosts.loadPostTools(
				{ uid: endorseAdminUid },
				{ pid: endorsePostData.pid, cid: cid }
			);
			assert.strictEqual(result.posts.endorsed, 0);
		});

		// Verifies that after endorsing, loadPostTools returns endorsed=1 in the
		// posts object — the value that causes the client template to render the
		// menu item as "Unendorse" and show the endorsed indicator badge.
		it('should reflect endorsed=1 in loadPostTools posts object after endorsing (button shows Unendorse)', async () => {
			await apiPosts.endorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			const result = await socketPosts.loadPostTools(
				{ uid: endorseAdminUid },
				{ pid: endorsePostData.pid, cid: cid }
			);
			assert.strictEqual(result.posts.endorsed, 1);
		});

		// Verifies that after unendorsing, loadPostTools returns endorsed=0 —
		// causing the client template to render the menu item as "Endorse" and
		// hide the endorsed indicator badge.
		it('should reflect endorsed=0 in loadPostTools posts object after unendorsing (button shows Endorse)', async () => {
			await apiPosts.unendorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			const result = await socketPosts.loadPostTools(
				{ uid: endorseAdminUid },
				{ pid: endorsePostData.pid, cid: cid }
			);
			assert.strictEqual(result.posts.endorsed, 0);
		});

		// -------------------------------------------------------------------------
		// Data type integrity
		// -------------------------------------------------------------------------
		// The endorsed field is declared in posts/data.js intFields, which means
		// the database layer must parse it as a JavaScript Number.  If it were
		// returned as a string, strict equality checks in the client and server
		// could silently pass or fail in unexpected ways.

		// Verifies that postsAPI.endorse returns endorsed as a Number, not a
		// string, confirming the intFields parsing is applied on the write path.
		it('should return endorsed as an integer from postsAPI.endorse', async () => {
			const result = await apiPosts.endorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			assert.strictEqual(typeof result.endorsed, 'number');
			assert.strictEqual(result.endorsed, 1);
		});

		// Verifies that postsAPI.unendorse likewise returns endorsed as a Number.
		it('should return endorsed as an integer from postsAPI.unendorse', async () => {
			const result = await apiPosts.unendorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			assert.strictEqual(typeof result.endorsed, 'number');
			assert.strictEqual(result.endorsed, 0);
		});

		// Verifies that posts.getPostField returns the endorsed value as a Number
		// when reading it back directly from the database layer, confirming the
		// intFields coercion applies to all read paths, not just the API layer.
		it('should return endorsed as an integer 0 from posts.getPostField for a newly created post', async () => {
			const newPost = await topics.post({
				uid: voteeUid,
				cid: cid,
				title: 'Post for getPostField integer type check',
				content: 'Checking endorsed integer type from getPostField',
			});
			const endorsed = await posts.getPostField(newPost.postData.pid, 'endorsed');
			assert.strictEqual(typeof endorsed, 'number');
			assert.strictEqual(endorsed, 0);
		});

		// -------------------------------------------------------------------------
		// Privilege management
		// -------------------------------------------------------------------------
		// These tests exercise the privilege system directly to confirm that
		// granting and revoking the posts:endorse privilege has the expected
		// effect on what users are allowed to do.

		// Verifies that privileges.global.can returns false for a plain registered
		// user who has not been granted the posts:endorse privilege.
		it('should return false from privileges.global.can for user without endorse privilege', async () => {
			const canEndorse = await privileges.global.can('posts:endorse', voterUid);
			assert.strictEqual(canEndorse, false);
		});

		// Verifies that privileges.global.can returns true for an administrator,
		// confirming that the admin shortcut in privsGlobal.can works correctly
		// for the posts:endorse privilege specifically.
		it('should return true from privileges.global.can for admin user', async () => {
			const canEndorse = await privileges.global.can('posts:endorse', endorseAdminUid);
			assert.strictEqual(canEndorse, true);
		});

		// Verifies that privileges.global.give grants the posts:endorse privilege
		// to every member of the specified group, and that privileges.global.rescind
		// removes it again.  This exercises the give→use→rescind→deny cycle that
		// the Instructors group setup relies on during installation.
		it('should allow endorsement when posts:endorse privilege is granted to a group, and prevent it when rescinded', async () => {
			// Grant group-level endorse privilege to all registered users.
			await privileges.global.give(['groups:posts:endorse'], 'registered-users');
			// voterUid is in registered-users and can now endorse
			const result = await apiPosts.endorse({ uid: voterUid }, { pid: endorsePostData.pid });
			assert.strictEqual(result.endorsed, 1);

			// Rescind the privilege and confirm the same user is blocked.
			await privileges.global.rescind(['groups:posts:endorse'], 'registered-users');
			// After rescinding, voterUid can no longer endorse
			await assert.rejects(
				apiPosts.endorse({ uid: voterUid }, { pid: endorsePostData.pid }),
				{ message: '[[error:no-privileges]]' }
			);
			// Restore state for subsequent tests.
			await apiPosts.unendorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
		});

		// -------------------------------------------------------------------------
		// Topics privilege object — posts:endorse field
		// -------------------------------------------------------------------------
		// privileges.topics.get aggregates all per-topic privilege flags into a
		// single object consumed by the client.  It includes posts:endorse by
		// delegating to privileges.global.can internally.

		// Verifies that the object returned by privileges.topics.get includes
		// posts:endorse=true when the caller is an administrator.
		it('should include posts:endorse=true in topics privilege result for admin user', async () => {
			const privs = await privileges.topics.get(endorsePostData.tid, endorseAdminUid);
			assert.strictEqual(privs['posts:endorse'], true);
		});

		// Verifies that the object returned by privileges.topics.get includes
		// posts:endorse=false for a user who does not hold the privilege.
		it('should include posts:endorse=false in topics privilege result for user without endorse privilege', async () => {
			const privs = await privileges.topics.get(endorsePostData.tid, voterUid);
			assert.strictEqual(privs['posts:endorse'], false);
		});

		// -------------------------------------------------------------------------
		// Global privilege lists — registration of posts:endorse
		// -------------------------------------------------------------------------
		// The privilege must be registered in the global privilege map so that the
		// admin UI can display it and so that give/rescind operations can target it
		// by name.

		// Verifies that posts:endorse appears in the user-level privilege list
		// returned by privileges.global.getUserPrivilegeList, confirming it is
		// registered in the _privilegeMap in src/privileges/global.js.
		it('should include posts:endorse in the global user privilege list', () => {
			const privList = privileges.global.getUserPrivilegeList();
			assert(privList.includes('posts:endorse'));
		});

		// Verifies that groups:posts:endorse (the group-level counterpart) appears
		// in the list returned by privileges.global.getGroupPrivilegeList, which
		// is derived automatically from the same _privilegeMap entries.
		it('should include groups:posts:endorse in the global group privilege list', () => {
			const privList = privileges.global.getGroupPrivilegeList();
			assert(privList.includes('groups:posts:endorse'));
		});

		// -------------------------------------------------------------------------
		// Idempotency
		// -------------------------------------------------------------------------
		// Endorsing or unendorsing a post that is already in the target state
		// should succeed silently and leave the field at the expected value.
		// This matches the behaviour of similar toggle operations (e.g. bookmarks).

		// Verifies that calling endorse twice in a row does not corrupt state:
		// the second call should overwrite endorsed=1 with endorsed=1 cleanly.
		it('should be idempotent when endorsing an already-endorsed post', async () => {
			await apiPosts.endorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			const result = await apiPosts.endorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			assert.strictEqual(result.endorsed, 1);
			const endorsed = await posts.getPostField(endorsePostData.pid, 'endorsed');
			assert.strictEqual(endorsed, 1);
		});

		// Verifies that calling unendorse twice in a row does not corrupt state:
		// the second call should overwrite endorsed=0 with endorsed=0 cleanly.
		it('should be idempotent when unendorsing an already-unendorsed post', async () => {
			await apiPosts.unendorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			const result = await apiPosts.unendorse({ uid: endorseAdminUid }, { pid: endorsePostData.pid });
			assert.strictEqual(result.endorsed, 0);
			const endorsed = await posts.getPostField(endorsePostData.pid, 'endorsed');
			assert.strictEqual(endorsed, 0);
		});
	});
});

describe('Posts\'', async () => {
	let files;

	before(async () => {
		files = await file.walk(path.resolve(__dirname, './posts'));
	});

	it('subfolder tests', () => {
		files.forEach((filePath) => {
			require(filePath);
		});
	});
});
