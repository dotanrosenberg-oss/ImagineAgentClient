# File Attachment Feature Plan

## Goal
Allow users to send any file attachment (up to 100 MB) in both direct chats and group conversations.

## Changes Required

### 1. API Layer (`src/api.ts`)
- Add a `sendMessageWithAttachment` function that sends the file as base64 along with optional message text
- Use the existing `POST /api/chats/:chatId/messages` endpoint with an added `file` (base64), `filename`, and `mimetype` fields in the request body
- Increase timeout to 120s for attachment uploads

### 2. Message Input UI (`src/MessagingScreen.tsx`)
- Add an attachment (paperclip) button next to the message input
- Open a file picker on click (no file type restriction, max 100 MB)
- Show a file preview bar above the input when a file is selected (filename, size, remove button)
- Allow sending a file with or without accompanying text

### 3. Send Logic (`src/MessagingScreen.tsx`)
- Update `handleSend` to check for a pending attachment
- If attachment is present, convert to base64 and call `sendMessageWithAttachment`
- Clear the attachment state after successful send
- Disable send button while uploading

### 4. Message Display (`src/MessagingScreen.tsx`)
- Detect `hasMedia` or attachment metadata on received messages
- Show a file/media indicator in the message bubble (icon + filename if available)

### 5. Styling (`src/App.css`)
- Attachment button styling (paperclip icon, positioned in input bar)
- File preview bar (filename, file size, remove/X button)
- Attachment indicator inside message bubbles

## Constraints
- Max file size: 100 MB
- No file type restrictions
- Works for both group and direct chats
- File is base64-encoded client-side before sending

## Server API Dependency
The server `POST /api/chats/:chatId/messages` endpoint must accept these additional fields:
```json
{
  "message": "optional caption text",
  "file": "base64-encoded file data",
  "filename": "document.pdf",
  "mimetype": "application/pdf"
}
```
