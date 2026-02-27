# User Guide

Our team has implemented 3 major features that improve course management system for instructors and facilitate the Q&A between the instructors and students. They are

1. Instructor group
2. Anonymous Post
3. Instructor-endorsed answers

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

Run the tests with:
```bash
npm test test/posts/anonymous.js
```

#### What Is Being Tested

The test file covers all six exported functions in [`src/posts/anonymous.js`](src/posts/anonymous.js) with 31 total test cases:

Function: What Is Tested

`getAnonymousUserData()`: Returns a correct, consistently structured anonymous user object; each call produces a new instance
`isAnonymousPost()`: Returns `true` only when `isAnonymous === 1` (strict integer check); handles `null`, `undefined`, and other falsy/truthy values gracefully
`applyAnonymousFields()`: Correctly sets `isAnonymous`, `realUid`, and `uid` on a post object; preserves other existing properties
`overrideUserDisplay()`: Overrides display data for anonymous posts only; leaves non-anonymous posts untouched; preserves `realUid` for moderation
`getStatsUid()`: Returns `realUid` for anonymous posts and `uid` for normal posts, ensuring statistics are attributed to the correct user
`getRealAuthorUid()`: Returns `realUid` when present, falls back to a `fallbackUid` otherwise; handles edge cases like `realUid = 0`

#### Why the Tests Are Sufficient

- **Complete function coverage:** Every exported function has dedicated tests covering both the happy path and edge cases
- **Branch coverage:** Every conditional is tested in both its true and false states, including type coercion edge cases (e.g., string `'1'` vs integer `1`)
- **Data integrity:** Tests verify that `realUid` is preserved throughout the post lifecycle, which is critical for moderation and ActivityPub federation
- **Backward compatibility:** Tests confirm that non-anonymous posts are unaffected by the feature
- **Scope:** The module consists entirely of pure data-transformation functions with no direct database calls, so unit tests at this level provide complete coverage of the module's logic. Database integration and UI behavior are covered by NodeBB's existing broader test suite.



## 3. Instructor-endorsed answers

This feature allows instructors, or anyone with the endorse privilege, to endorse certain posts. Under the endorsed posts, a message will be displayed in green, to denote that the post is endorsed.

### How to use this feature

If you have the endorse privilege, in the post dropdown menu, you should see the "endorse post" button pop up. Click it to endorse a post. If the post is already endorsed, the button will become "unendorse post" so that you can cancel your endorsement. The post dropdown menu is located at the 3 dots at the bottom right corner of every post.

### Testing Guide

Users with the endorse privilege can repeat the steps above to ensure that this feature is working properly. After clicking the endorse button, if the green message "The post is endorsed by an instructor" appears under the post content, then the endorsement is successful. Clicking "unendorse post" would make the message disappear.

### Automated Tests

The automated tests for this feature are all located in [`test/posts.js`](test/posts.js). You can run them by running the command
```bash
npm run test test/posts.js
```
in the terminal.

The tests comprehensively test that every post is associated with the endorse field, and that the functions reading the fields, like loadPostTools() and functions modifying the field, like the API calls, are working correctly. Th  tests also checks the privilege system to eusure that only users with the privilege can endorse, and that the privilege can be granted like all other global privileges.

The tests should be comprehensive because they check all the intended and unintended usages of the functions, and verify that they are all handled properly. Almost all lines involved in implementing this functionality has been checked by the tests. This high coverage ensures that all code has been tested.