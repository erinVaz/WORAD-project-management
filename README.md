# WORAD Project Plan

A small web app for planning the ES410 WORAD group project. It shows the work breakdown, a Gantt chart with sprints, freezes, order cut-offs and deadlines, and a per-person workload chart. You can change who holds each role, move tasks and milestones, and export the plan for Jira.

It's plain HTML, CSS and JavaScript with no build step, so it runs straight from GitHub Pages.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `plan.json` | The plan: roles, work packages, tasks, milestones, sprints, term dates. This is the file the team edits. |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Put it on GitHub Pages

1. Create a repository (for example `worad-plan`) and upload all the files in this folder to the root of the `main` branch.
2. In the repo, go to **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, then **Save**.
3. After a minute or two the site is live at `https://<your-username>.github.io/worad-plan/`. Share that link with the team.

Pages on a **public** repo is free. For a **private** repo you need GitHub Pro, which is free for students through the GitHub Student Developer Pack. If the repo is public, anyone with the link can see the plan, including the names you add.

To run it on your own computer, open a terminal in this folder, run `python3 -m http.server`, and visit `http://localhost:8000`. Opening `index.html` directly from disk won't load `plan.json`.

## Changing the plan

**In the app.** Edit role holders on the **Roles** tab, task dates and owners on the **Tasks** tab (or drag bars on the **Gantt**), milestones on **Milestones**, and term dates, vacations, sprints and work packages on **Settings**. Edits save in your browser straight away, and a banner reminds you they aren't on GitHub yet.

**To share your edits**, go to **Save & export → Export plan.json**, then upload that file to the repo over the old `plan.json` and commit it. Pages republishes automatically. Then click **Discard my edits** so your browser shows the published version again.

**Directly on GitHub.** You can also edit `plan.json` in GitHub's web editor (pencil icon). Weeks are university week numbers, and `day` in milestones is 0 = Monday … 4 = Friday.

Only one person should edit the plan at a time, usually the PM after the sprint retro, so nobody overwrites someone else's changes. The commit history then doubles as a dated record of how the plan changed, which is useful evidence for the report's team reflection and for the SLDR.

## Checks

The Gantt tab lists problems as you edit:
- a task that starts before a task it depends on starts, or finishes before it finishes
- a dependency on a WBS code that doesn't exist
- tasks outside the plan's week range, or with no owner

Tasks with a problem get a red outline.

## Jira

**Save & export → Download Jira import CSV** creates one epic per work package and one task per WBS item, with start and due dates, a label for the stream type, and the sprint name. In Jira, use **Import issues from CSV** and map *Issue ID*, *Parent* and *Sprint*. Assignees import only if role holder names match Jira users exactly.

## Week numbers

Week 1 starts on the Monday set in **Settings** (5 October 2026 by default). Bars run Monday of the start week to Friday of the end week.
