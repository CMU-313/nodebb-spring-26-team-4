# Anonymous Post Feature - User Guide

## Feature Overview

The Anonymous Post feature allows registered users to create posts and replies without revealing their identity. When posting anonymously:

- The post displays as authored by "Anonymous" with a generic avatar
- The real author's identity is preserved internally for moderation purposes
- User statistics (post count) are still attributed to the real author

---

## How to Use the Anonymous Post Feature

### Creating an Anonymous Topic

1. Navigate to any category and click **New Topic**
2. In the composer, enable the **Post Anonymously** option (only available to logged-in users)
3. Write your title and content as usual and submit

Your topic will display as authored by "Anonymous." Your actual username will not be visible to other users, but your post count will still increment.

### Creating an Anonymous Reply

1. Open an existing topic and click **Reply**
2. Enable the **Post Anonymously** option in the composer
3. Write your reply and submit

Your reply will appear as authored by "Anonymous" with full standard functionality (voting, editing, etc.).

---

## User Testing Guide

### Test 1: Create Anonymous Topic
1. Log in and navigate to any category
2. Click **New Topic**, enable the anonymous option, and submit a post
3. **Expected:** Topic displays with author "Anonymous" and a generic avatar; your profile post count increments

### Test 2: Create Anonymous Reply
1. Log in and open any existing topic
2. Click **Reply**, enable the anonymous option, and submit
3. **Expected:** Reply displays as "Anonymous"; threading and timestamp are correct

### Test 3: Non-Anonymous Post Still Works
1. Log in and create a topic or reply without enabling the anonymous option
2. **Expected:** Post displays with your real username and avatar as normal

### Test 4: Guest Cannot Post Anonymously
1. Log out and navigate to any topic
2. **Expected:** The anonymous posting option is not available to guests

### Edge Cases to Verify
- Editing an anonymous post should leave it displayed as "Anonymous"
- Moderators can view the real author via the preserved `realUid` field
- Anonymous posts appear in search results with "Anonymous" as the author

---

## Automated Test Documentation

### Test File Location

[`test/posts/anonymous.js`](test/posts/anonymous.js)
[`test/posts.js`](test/posts.js)

Run the tests with:
```bash
npm test test/posts/anonymous.js
```
AND

```bash
npm test test/posts.js
```

### What Is Being Tested

The automated tests cover both helper-level behavior and integration behavior for anonymous posting.

Unit/Helper Tests (`test/posts/anonymous.js`)

`getAnonymousUserData()`: Returns a correct, consistently structured anonymous user object; each call produces a new instance
`isAnonymousPost()`: Returns `true` only when `isAnonymous === 1` (strict integer check); handles `null`, `undefined`, and other falsy/truthy values gracefully
`applyAnonymousFields()`: Correctly sets `isAnonymous`, `realUid`, and `uid` on a post object; preserves other existing properties
`overrideUserDisplay()`: Overrides display data for anonymous posts only; leaves non-anonymous posts untouched; preserves `realUid` for moderation
`getStatsUid()`: Returns `realUid` for anonymous posts and `uid` for normal posts, ensuring statistics are attributed to the correct user
`getRealAuthorUid()`: Returns `realUid` when present, falls back to a `fallbackUid` otherwise; handles edge cases like `realUid = 0`

Integration Tests (`test/posts.js`, `describe('anonymous posting', ...)`)

Anonymous post creation metadata: Confirms anonymous topics/replies are stored with `isAnonymous`, display `uid = 0`, internal `realUid`, and `anonymousAliasId`
Stable identity mapping: Confirms same user in same thread keeps one alias ID and different users in same thread receive different alias IDs
Thread-level display behavior: Confirms topic payloads expose generated anonymous alias display names while preserving generic anonymous profile fields
Summary/single-post display behavior: Confirms `apiPosts.get` and `apiPosts.getSummary` display plain `Anonymous` and do not expose `realUid`

### Why the Tests Are Sufficient

- **Complete function coverage:** Every exported function has dedicated tests covering both the happy path and edge cases
- **Branch coverage:** Every conditional is tested in both its true and false states, including type coercion edge cases (e.g., string `'1'` vs integer `1`)
- **Data integrity:** Tests verify that `realUid` is preserved throughout the post lifecycle, which is critical for moderation and ActivityPub federation
- **Backward compatibility:** Tests confirm that non-anonymous posts are unaffected by the feature
- **Scope:** The module consists entirely of pure data-transformation functions with no direct database calls, so unit tests at this level provide complete coverage of the module's logic. Database integration and UI behavior are covered by NodeBB's existing broader test suite.
