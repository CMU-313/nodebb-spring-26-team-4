# User Guide

Our team has implemented major features that improve course management for instructors and facilitate the Q&A between instructors and students. They are

1. Instructor group
2. Anonymous Post
3. Group visibility enhancements

---

## 1. Instructor Group

### Feature Overview

The Instructor Group feature introduces a dedicated `Instructors` group with moderation-level capabilities needed for course operations. This includes:

- Topic and post moderation permissions across categories (configured on default category privileges)
- Global ability to ban users
- Global ability to endorse posts

This supports teaching staff workflows without requiring full administrator access.

### How to Use the Instructor Group Feature

#### Assigning a User to Instructors

1. Open **Admin Control Panel** and go to **Manage Users**
2. Select the target user
3. Use **Manage Groups** and add the user to **Instructors**

After joining the group, the user receives instructor moderation privileges and can perform endorsement/ban actions permitted by policy.

### User Testing Guide

#### Test 1: Instructors Group Has Global Privileges
1. Add a test user to the `Instructors` group
2. Check global privileges for that group
3. **Expected:** `groups:ban` and `groups:posts:endorse` are enabled

#### Test 2: Instructors Group Has Category Moderation Privileges
1. Inspect default category (`cid = -1`) privileges for `Instructors`
2. **Expected:** moderation privileges such as `groups:topics:delete` and `groups:posts:view_deleted` are enabled

### Automated Test Documentation

#### Test File Location

[`test/categories.js`](test/categories.js)

Run the test with:

```bash
npm test test/categories.js
```

#### What Is Being Tested

- `Instructors` group exists or is created
- Installer-equivalent privileges are granted
- Global privilege checks return enabled values for ban and endorsement
- Default category privilege checks return enabled moderation values

### Why the Tests Are Sufficient

- **Installer parity:** The test mirrors the privileges assigned by setup logic (`categories.give` at `cid = -1` and global grants), so it validates the intended deployment behavior(works on default).
- **Permission coverage:** It checks both global and category-level outcomes, covering the two privilege scopes the feature relies on.
- **Regression protection:** If group creation or privilege assignment changes through user's future actions, this test fails immediately at the permission boundary.

---

## 2. Anonymous Post - Feature Overview

The Anonymous Post feature allows registered users to create posts and replies without revealing their identity. When posting anonymously:

- The post displays as authored by "Anonymous" with a generic avatar
- The real author's identity is preserved internally for moderation purposes
- User statistics (post count) are still attributed to the real author

---

### How to Use the Anonymous Post Feature

#### Creating an Anonymous Topic

1. Navigate to any category and click **New Topic**
2. In the composer, enable the **Post Anonymously** option (only available to logged-in users)
3. Write your title and content as usual and submit

Your topic will display as authored by "Anonymous." Your actual username will not be visible to other users, but your post count will still increment.

#### Creating an Anonymous Reply

1. Open an existing topic and click **Reply**
2. Enable the **Post Anonymously** option in the composer
3. Write your reply and submit

Your reply will appear as authored by "Anonymous" with full standard functionality (voting, editing, etc.).

---

### User Testing Guide

#### Test 1: Create Anonymous Topic
1. Log in and navigate to any category
2. Click **New Topic**, enable the anonymous option, and submit a post
3. **Expected:** Topic displays with author "Anonymous" and a generic avatar; your profile post count increments

#### Test 2: Create Anonymous Reply
1. Log in and open any existing topic
2. Click **Reply**, enable the anonymous option, and submit
3. **Expected:** Reply displays as "Anonymous"; threading and timestamp are correct

#### Test 3: Non-Anonymous Post Still Works
1. Log in and create a topic or reply without enabling the anonymous option
2. **Expected:** Post displays with your real username and avatar as normal

#### Test 4: Guest Cannot Post Anonymously
1. Log out and navigate to any topic
2. **Expected:** The anonymous posting option is not available to guests

#### Edge Cases to Verify
- Editing an anonymous post should leave it displayed as "Anonymous"
- Moderators can view the real author via the preserved `realUid` field
- Anonymous posts appear in search results with "Anonymous" as the author

---

### Automated Test Documentation

#### Test File Location

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

#### What Is Being Tested

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

### Feature Overview

The Anonymous Post feature allows registered users to create posts and replies without revealing their identity. When posting anonymously:

- The post displays as authored by "Anonymous" with a generic avatar
- The real author's identity is preserved internally for moderation purposes
- User statistics (post count) are still attributed to the real author

### How to Use the Anonymous Post Feature

#### Creating an Anonymous Topic

1. Navigate to any category and click **New Topic**
2. In the composer, enable the **Post Anonymously** option (only available to logged-in users)
3. Write your title and content as usual and submit

Your topic will display as authored by "Anonymous." Your actual username will not be visible to other users, but your post count will still increment.

#### Creating an Anonymous Reply

1. Open an existing topic and click **Reply**
2. Enable the **Post Anonymously** option in the composer
3. Write your reply and submit

Your reply will appear as authored by "Anonymous" with full standard functionality (voting, editing, etc.).

### User Testing Guide

#### Test 1: Create Anonymous Topic
1. Log in and navigate to any category
2. Click **New Topic**, enable the anonymous option, and submit a post
3. **Expected:** Topic displays with author "Anonymous" and a generic avatar; your profile post count increments

#### Test 2: Create Anonymous Reply
1. Log in and open any existing topic
2. Click **Reply**, enable the anonymous option, and submit
3. **Expected:** Reply displays as "Anonymous"; threading and timestamp are correct

#### Test 3: Non-Anonymous Post Still Works
1. Log in and create a topic or reply without enabling the anonymous option
2. **Expected:** Post displays with your real username and avatar as normal

#### Test 4: Guest Cannot Post Anonymously
1. Log out and navigate to any topic
2. **Expected:** The anonymous posting option is not available to guests

#### Edge Cases to Verify
- Editing an anonymous post should leave it displayed as "Anonymous"
- Moderators can view the real author via the preserved `realUid` field
- Anonymous posts appear in search results with "Anonymous" as the author

### Automated Test Documentation

#### Test File Location

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

#### What Is Being Tested

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

---

## 3. Group Visibility Enhancements
    Note that ACP stands for Admin Control Panel

### Feature Overview

Two UI/data enhancements were added to improve role visibility:

1. **Admin user list groups column:** Admin Control's Manage Users now includes group badges per user.
2. **Topic list group title label:** Topic list payload includes author `groupTitle`, allowing templates to show role labels beside usernames.

### How to Use Group Visibility Enhancements

#### In Admin Manage Users

1. Open **ACP(Admin Control Panel) → Manage Users**
2. View each row in the users table
3. **Expected:** Groups appear as badges in the groups column (excluding `registered-users`)

#### In Topic Lists

1. Ensure a user belongs to a group with a configured title
2. Create a topic using that user
3. Open category/recent topic list
4. **Expected:** User role label (group title) appears with the author display

### User Testing Guide

#### Test 1: Admin Users Page Shows Group Badges
1. Add a user to a non-system group (for example, `Teaching Assistants`)
2. Open **ACP → Manage Users**
3. **Expected:** The user row shows the added group badge in the groups column

#### Test 2: Registered Users Group Is Not Displayed
1. Open **ACP → Manage Users** for any normal account
2. **Expected:** `registered-users` is not shown as a badge in the groups column

#### Test 3: Topic List Shows Author Group Title
1. Add a user to a group with a title
2. Create a topic with that user
3. Open topic list view
4. **Expected:** The author data includes and displays the `groupTitle`

### Automated Test Documentation

#### Test File Locations

[`test/controllers-admin.js`](test/controllers-admin.js)
[`test/topics.js`](test/topics.js)

Run the targeted tests with:

```bash
npm test test/controllers-admin.js
npm test test/topics.js
```

#### What Is Being Tested

- Admin users endpoint returns user groups for display and filters out `registered-users`
- Topic list payload includes `user.groupTitle` for authors with role titles

### Why the Tests Are Sufficient

- **Direct payload validation:** Tests assert the exact API fields consumed by the UI for both ACP users table and topic lists.
- **Positive and negative checks:** They verify expected inclusion (custom groups and titles) and exclusion (`registered-users`), reducing false confidence from one-sided assertions.
- **Integration-level confidence:** Coverage spans controller/API output and topic retrieval flow, which are the main surfaces affected by the feature changes.
