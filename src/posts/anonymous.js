'use strict';

/**
 * Helper module for anonymous posting functionality
 */

/**
 * Creates a standardized anonymous user object for display
 * @returns {Object} Anonymous user object
 */
function getAnonymousUserData() {
	return {
		uid: 0,
		username: 'Anonymous',
		userslug: '',
		picture: '/assets/uploads/system/anonymous-avatar.png',
		'icon:text': 'A',
		'icon:bgColor': '#999',
		displayname: 'Anonymous',
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
	return Boolean(post && post.isAnonymous === 1);
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

/**
 * Overrides the user display data for an anonymous post
 * Used when loading post data for display
 * @param {Object} post - Post object with user data
 */
function overrideUserDisplay(post) {
	if (isAnonymousPost(post)) {
		post.user = getAnonymousUserData();
		// Preserve realUid for moderation/privilege checks
		post.realUid = post.realUid || null;
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
	overrideUserDisplay,
	getStatsUid,
	getRealAuthorUid,
	overrideTopicUserDisplay,
	getStatsUidTopic,
	isAnonymousTopic,
	applyAnonymousFieldsTopic,
};
