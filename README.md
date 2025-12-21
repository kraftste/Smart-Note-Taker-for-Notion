# One-Tap Voice Capture to Notion

A one-tap, voice-first capture flow that lets you dictate ideas on your phone and automatically files them into the correct Notion page and section. Built for speed, minimal friction, and reliable organization.

---

## Overview

This project provides a lightweight web interface that starts dictation immediately on open. Spoken notes are transcribed using a speech-to-text API and sent to a webhook, which triggers a Tasklet agent. The agent determines the correct Notion page and section and inserts the note as structured bullet points.

If something goes wrong, nothing is lost.

---

## Tech Stack

- v0 (frontend / vibe-coded UI)
- Tasklet.ai (agent + webhook)
- Groq Speech-to-Text (default, optional)
- Notion API
- iOS Home Screen shortcut (optional but recommended)

---

## Setup

### 1. Import and connect

1. Import this repository into your own GitHub account.
2. Connect the repository to **v0**.

---

### 2. Environment variables

Set the following environment variables in v0:

GROQ_API_KEY=your_api_key_here
NOTION_API_KEY=your_api_key_here

Notes:

* You can replace Groq with any other speech-to-text provider if you prefer.
* The Notion API key must have access to the pages you want to write to.

---

### 3. Create the Tasklet agent

1. Go to **tasklet.ai**
2. Create a new agent
3. Create a **Webhook URL** trigger for that agent
4. Copy the webhook URL

---

### 4. Add webhook URL to the frontend

Open:

```
app/page.tsx
```

Add your Tasklet webhook URL at **line 263** (replace the placeholder URL).

---

## Tasklet Agent Instructions

Use the following instructions **exactly** for your Tasklet agent:

```text
FINDING THE RIGHT PAGE

Users send notes via webhook with mentions of which Notion page to save to
Extract the page name/reference from the note content
Search for the matching Notion page using the search tool

IF PAGE NOT FOUND Send the notes to the user via email instead:

Use bullet points format
No 🤖 emoji (unlike Notion)
Include indented bullet points if content structure is appropriate
Subject should indicate it couldn't be saved to a specific page

IF PAGE FOUND BUT NO SUITABLE SECTION If you identify the correct page but there's no appropriate H2 section to place the notes:

Place the bullet points at the very top of the page content
Still use the 🤖 emoji on first-level bullet points
Still respect indentation for nested points

IF PAGE FOUND AND SUITABLE SECTION EXISTS

Identify the target H2/H3 section heading
Fetch the page to analyze existing bullet point structure
Count the exact number of tabs used by existing bullet points in that section
Insert new bullet points at the BEGINNING of the section (right after the heading)
Use the same indentation depth (exact number of tabs) as existing bullet points

Format with:
🤖 emoji on first-level bullet points
Indented bullet points (no emoji on nested levels)
No full sentences, only bullet points

GENERAL FORMATTING RULES

User typically structures pages with H2 headings
Use bullet points, never full sentences
Add 🤖 emoji to first-level bullet points you create
Use indented bullet points when content structure requires it

Example format:
* 🤖 Main point
    * Sub-point
```

---

## Usage

1. Open the web app on your phone

2. Dictation starts immediately

3. Speak naturally, for example:

   > “For client X, on project Y, remember to do Z”

4. The note is transcribed, routed, and stored in the correct Notion page and section.

Optional:

* Add the site to your iOS Home Screen for true one-tap capture.

---

## Failure handling

* If the correct Notion page cannot be found, the note is emailed to you instead.
* This ensures no ideas are ever lost.

---

## Why this exists

Capturing ideas quickly is easy. Finding them later is not.

This setup removes the friction of manual sorting and gives you confidence that ideas are stored exactly where you will need them.

---

## License

MIT. Use it, fork it, adapt it.

```
