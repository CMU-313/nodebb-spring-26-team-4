'use strict';

const crypto = require('crypto');
const db = require('../database');
const utils = require('../utils');

/**
 * Helper module for anonymous posting functionality
 */

const ADJECTIVES = [
	'Calm', 'Bold', 'Quiet', 'Curious', 'Brave', 'Kind', 'Swift', 'Bright',
	'Wise', 'Mellow', 'Steady', 'Gentle', 'Clever', 'Nimble', 'Patient', 'Friendly',
];
const ANIMALS = [
	'Bear', 'Penguin', 'Fox', 'Otter', 'Falcon', 'Panda', 'Koala', 'Dolphin',
	'Lynx', 'Hedgehog', 'Eagle', 'Raven', 'Turtle', 'Bison', 'Wolf', 'Seahorse',
];

/**
 * Creates a standardized anonymous user object for display
 * @param {string} [displayname='Anonymous'] - Display name for anonymous user
 * @returns {Object} Anonymous user object
 */
function getAnonymousUserData(displayname = 'Anonymous') {
	return {
		uid: 0,
		username: 'Anonymous',
		userslug: '',
		picture: '/assets/uploads/system/anonymous-avatar.png',
		'icon:text': 'A',
		'icon:bgColor': '#999',
		displayname,
		banned: 0,
		status: 'offline',
	};
}

/**
 * Checks if a post should be displayed anonymously
 * @param {Object} post - Post object
 * @returns {boolean} True if post should be anonymous
 */
function isAnonymousPost(post) {
	return Boolean(post && parseInt(post.isAnonymous, 10) === 1);
}

/**
 * Applies anonymous posting metadata to a post data object
 * Used during post creation
 * @param {Object} postData - The post data being created
 * @param {number} uid - The real user ID
 * @returns {Object} Modified post data with anonymous fields
 */
function applyAnonymousFields(postData, uid) {
	postData.isAnonymous = 1;
	postData.realUid = uid;
	postData.uid = 0; // Display as guest
	return postData;
}

function getAliasDisplayName(aliasId) {
	if (!utils.isNumber(aliasId) || parseInt(aliasId, 10) <= 0) {
		return 'Anonymous';
	}
	const normalized = parseInt(aliasId, 10) - 1;
	const adjective = ADJECTIVES[normalized % ADJECTIVES.length];
	const animal = ANIMALS[Math.floor(normalized / ADJECTIVES.length) % ANIMALS.length];
	return `Anonymous ${adjective} ${animal}`;
}

function getFallbackAliasId(realUid, tid) {
	const hash = crypto
		.createHash('sha256')
		.update(`${realUid}:${tid}`)
		.digest('hex')
		.slice(0, 8);
	return (parseInt(hash, 16) % 4096) + 1;
}

async function assignThreadIdentity(postData, uid, tid) {
	applyAnonymousFields(postData, uid);

	if (!utils.isNumber(tid)) {
		postData.anonymousAliasId = getFallbackAliasId(uid, String(tid || ''));
		return postData;
	}

	const identityMapKey = `tid:${tid}:anonymous:uids`;
	let aliasId = await db.getObjectField(identityMapKey, uid);
	if (!utils.isNumber(aliasId)) {
		aliasId = await db.incrObjectField(`tid:${tid}:anonymous`, 'nextAliasId');
		await db.setObjectField(identityMapKey, uid, aliasId);
	}

	postData.anonymousAliasId = parseInt(aliasId, 10) || getFallbackAliasId(uid, tid);
	return postData;
}

function getAnonymousDisplayName(post, options = {}) {
	if (!isAnonymousPost(post)) {
		return post && post.user && post.user.displayname ? post.user.displayname : '';
	}

	const useThreadAlias = options.useThreadAlias === true;
	if (!useThreadAlias) {
		return 'Anonymous';
	}

	const aliasId = utils.isNumber(post.anonymousAliasId) ?
		parseInt(post.anonymousAliasId, 10) :
		getFallbackAliasId(post.realUid, post.tid);

	return getAliasDisplayName(aliasId);
}

/**
 * Overrides the user display data for an anonymous post
 * Used when loading post data for display
 * @param {Object} post - Post object with user data
 */
function overrideUserDisplay(post, options = {}) {
	if (isAnonymousPost(post)) {
		post.user = getAnonymousUserData(getAnonymousDisplayName(post, options));
		post.user.custom_profile_info = [];
		post.user.selectedGroups = [];
		post.user.signature = '';
	}
}

/**
 * Gets the effective UID for user stats (uses realUid for anonymous posts)
 * @param {Object} postData - Post data object
 * @returns {number} The UID to use for user statistics
 */
function getStatsUid(postData) {
	return isAnonymousPost(postData) ? postData.realUid : postData.uid;
}

/**
 * Gets the real author UID (for ActivityPub, moderation, etc.)
 * @param {Object} postData - Post data object
 * @param {number} fallbackUid - Fallback UID if not anonymous
 * @returns {number} The real author UID
 */
function getRealAuthorUid(postData, fallbackUid) {
	return postData.realUid || fallbackUid;
}

/**
 * Applies anonymous display to a topic object (for category/topic lists)
 * @param {Object} topic - Topic object with user data
 */
function overrideTopicUserDisplay(topic) {
	if (isAnonymousPost(topic)) {
		topic.user = getAnonymousUserData();
		topic.realUid = topic.realUid || null;
	}
}

/**
 * Gets the effective UID for user stats (uses realUid for anonymous posts)
 * @param {Object} postData - Post data object
 * @returns {number} The UID to use for user statistics
 */
function getStatsUidTopic(topicData) {
	return isAnonymousPost(topicData) ? topicData.realUid : topicData.uid;
}

/**
 * Checks if a post should be displayed anonymously
 * @param {Object} post - Post object
 * @returns {boolean} True if post should be anonymous
 */
function isAnonymousTopic(topic) {
	return Boolean(topic && topic.isAnonymous === 1);
}

/**
 * Applies anonymous posting metadata to a post data object
 * Used during post creation
 * @param {Object} postData - The post data being created
 * @param {number} uid - The real user ID
 * @returns {Object} Modified post data with anonymous fields
 */
function applyAnonymousFieldsTopic(topicData, uid) {
	topicData.isAnonymous = 1;
	topicData.realUid = uid;
	topicData.uid = 0; // Display as guest
	return topicData;
}

module.exports = {
	getAnonymousUserData,
	isAnonymousPost,
	applyAnonymousFields,
	assignThreadIdentity,
	overrideUserDisplay,
	getStatsUid,
	getRealAuthorUid,
	overrideTopicUserDisplay,
	getStatsUidTopic,
	isAnonymousTopic,
	applyAnonymousFieldsTopic,
};
