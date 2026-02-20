# Task 42 Testing Checklist (Redesign Client)

## Goal
Validate the redesigned client shell with:
- top dashboard strip
- 3-column desktop layout
- context copilot panel
- no regression in core messaging flow

## Setup
1. Import in Replit:
   - `https://replit.com/github/dotanrosenberg-oss/ImagineAgentClient_task42_testing`
2. Install deps:
   - `npm install`
3. Start app:
   - `npm run dev`
4. Open app preview and connect to your WhatsApp server in **Settings**.

> Note: Current base code has a pre-existing TypeScript build warning/error in `CreateGroupScreen.tsx` (`TS6133` unused var). This task is UI behavior focused; verify via dev run.

## A) Dashboard Strip (Top Area)
- [ ] Strip appears at top of messaging screen
- [ ] Shows 3 cards:
  - [ ] Unread messages
  - [ ] Unread groups
  - [ ] Pending tasks
- [ ] Values update after selecting chats / receiving incoming messages
- [ ] On mobile width, cards stack vertically and remain readable

## B) 3-Column Layout (Desktop)
At desktop width (>= ~700px):
- [ ] Left column: chats list
- [ ] Middle column: selected chat messages
- [ ] Right column: Context Copilot panel
- [ ] Columns remain stable while switching chats
- [ ] No overlap/cutoff on normal laptop viewport

## C) Context Copilot Panel
- [ ] Header shows selected chat name (or prompt to pick chat)
- [ ] Quick actions list renders configured actions
- [ ] Action button can be selected/toggled
- [ ] Task updates section shows latest linked chat tasks
- [ ] Empty states are clear when no actions/tasks exist

## D) Messaging Regression Checks
- [ ] Chat search/filter still works
- [ ] Opening chat loads messages
- [ ] Send text message still works
- [ ] Attach file flow still works
- [ ] Poll composer still works
- [ ] Unread badge behavior still works

## E) Mobile Behavior
At small width (<700px):
- [ ] Copilot panel is hidden
- [ ] Chat list and message panel mobile transitions still work
- [ ] Back button in chat header still appears/works

## F) Visual QA
- [ ] No obvious CSS breakage in header/sidebar/input area
- [ ] Dashboard + layout feel coherent with existing style
- [ ] No console errors tied to new UI blocks

## Suggested Test Script (5 min)
1. Open app, verify top dashboard.
2. Open 2-3 chats and confirm middle panel message loading.
3. Confirm right copilot panel shows actions and task update block.
4. Send one message + one poll.
5. Resize to mobile width and verify stacked dashboard + hidden copilot.

## Pass Criteria
- All sections A–E pass.
- Any failure is documented with screenshot + exact reproduction steps.
