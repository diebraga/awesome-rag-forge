# Feedback Review Loop

## Purpose

The feedback review loop turns chat thumbs-up/thumbs-down reactions into a human-reviewed improvement workflow.

This is not automatic reinforcement learning. Feedback does not silently train a model, change retrieval, edit knowledge, or modify harness behavior. Feedback is operational review data. The MCP server helps summarize it, inspect it, create eval cases from it, and mark it resolved after a human accepts the outcome.

## Boundary

The chat app remains read-only except for `POST /api/feedback`, the existing narrow route that can only create `RagFeedback` rows.

The MCP server owns feedback review. If feedback reveals missing or wrong knowledge, the MCP assistant must use the existing proposal/review workflow:

```text
feedback -> inspect -> propose fix -> user approval -> PENDING_REVIEW -> human review -> APPROVED
```

Raw feedback must never become live RAG knowledge automatically.

## Token-Efficient Review Flow

When a user asks to review feedback, do not fetch every feedback row.

Use progressive disclosure:

1. Call `get_feedback_summary` first.
2. Call `list_feedback_page` for a small page of compact records.
3. Call `get_feedback_case` only for one selected feedback ID.
4. Propose a next action in conversation.
5. Write only after explicit user approval.

Default review should focus on unresolved negative feedback. Positive feedback should usually stay aggregated unless the user asks for passing eval candidates.

## Summary View

A good first response should look like this:

```text
Feedback summary

Total feedback: 248
Good: 173
Bad: 75
Unreviewed bad: 31
Resolved: 142

Top negative themes:
1. Missing knowledge about PDF uploads: 14 cases
2. Bad retrieval for harness-rule questions: 8 cases
3. Out-of-scope user requests: 5 cases

Recommended next step:
Review the top unresolved negative case first.
```

## Compact Queue View

Use `list_feedback_page` for a short page. The default queue is `needs_review`, which means unresolved negative feedback.

Example:

```text
Needs review

BAD #1842 - Missing knowledge - "How do I upload a PDF?"
BAD #1839 - Bad retrieval - "Where are harness rules approved?"
BAD #1827 - Ambiguous question - "Can it update itself?"

Say "inspect #1842" to open one case.
```

## Case Detail View

Use `get_feedback_case` when the user chooses an item.

Example:

```text
Feedback #42 - BAD - Needs review

Question:
"What documents do I need for X?"

Assistant answer:
"You need A and B..."

Retrieved sources:
- Source 1: Onboarding checklist, chunk 3
- Source 2: Internal policy, chunk 1

Likely issue:
Missing knowledge. The retrieved sources do not mention document C, but the user's correction says C is required.

Recommended action:
Create an eval case from this question and propose a new knowledge chunk covering the full document list.

Options:
1. Create eval case
2. Propose knowledge update
3. Mark as resolved
4. Ignore
```

## Positive Feedback

Positive feedback is useful, but it should not usually propose RAG changes.

Use it to:

- Identify strong source chunks.
- Identify common successful questions.
- Create passing eval cases.
- Measure answer quality over time.
- Confirm that retrieval works for important topics.

Positive feedback should be fetched explicitly with `list_feedback_page({ queue: "positive" })` or reviewed through `get_feedback_summary` trends.

## Negative Feedback

Negative feedback should drive investigation and possible fixes.

Common categories:

- `missing_knowledge`
- `outdated_or_wrong_knowledge`
- `bad_retrieval`
- `hallucination_despite_context`
- `harness_or_behavior_issue`
- `out_of_scope`
- `ambiguous_question`
- `no_action_needed`

The server stores `failureCategory` as a string so the workflow can evolve without a schema change. The assistant may propose a category in conversation, but it should only be written when the user approves a resolution.

## MCP Tools

### `get_feedback_summary`

Returns aggregate counts and compact trends. Use first.

Includes:

- total feedback
- rating counts
- review status counts
- unresolved negative count
- resolved/unresolved counts
- top failure categories in the recent sample
- top cited document IDs in the recent sample
- repeated question patterns in the recent sample

### `list_feedback_page`

Returns a compact page of feedback records.

Default behavior:

- `queue: "needs_review"`
- unresolved negative feedback
- `limit: 10`
- newest first

Use this for token-efficient triage.

### `get_feedback_case`

Returns full details for one feedback item, including linked document/chunk context where available.

Use only after summary/page selection.

### `create_eval_case_from_feedback`

Creates a `RagEvalCase` from a feedback item, but only with `userApproval: true`.

Positive feedback can become a passing eval. Negative feedback can become a regression eval.

Creating an eval case does not automatically resolve feedback.

### `mark_feedback_resolved`

Marks one feedback item reviewed/resolved, but only with `userApproval: true`.

This changes feedback review state only. It never changes live knowledge.

## Review Outcomes

If feedback reveals missing knowledge:

```text
BAD feedback
-> get_feedback_case
-> propose_source_insert
-> user approval
-> approve_source_insert writes PENDING_REVIEW
-> approve_chunk makes it live
-> mark_feedback_resolved
```

If feedback reveals wrong knowledge:

```text
BAD feedback
-> get_feedback_case
-> propose_chunk_update
-> user approval
-> approve_chunk_update returns the chunk to PENDING_REVIEW
-> approve_chunk makes the corrected text live
-> mark_feedback_resolved
```

If feedback reveals bad behavior:

```text
BAD feedback
-> get_feedback_case
-> propose_harness_update
-> user approval
-> approve_harness_update writes PENDING_REVIEW
-> approve_harness_rule makes it active
-> mark_feedback_resolved
```

If feedback is useful for testing:

```text
GOOD or BAD feedback
-> get_feedback_case
-> create_eval_case_from_feedback
-> mark_feedback_resolved when accepted
```

## What Not To Do

Do not:

- Load all feedback rows into the model context.
- Treat thumbs-down as proof that knowledge is wrong.
- Treat thumbs-up as proof that knowledge is complete.
- Put raw feedback directly into `RagDocument` or `RagChunk`.
- Mark a knowledge fix live without the existing review workflow.
- Let the chat app review or resolve feedback.
- Call this automatic reinforcement learning unless model training/policy updates are actually implemented.

## Future Work

Deferred features:

- Automatic or embedding-based clustering.
- Automatic classification.
- A web review dashboard.
- Linked feedback-resolution history table.
- Retrieval metrics over time.
- Fine-tuning or true reinforcement learning.
