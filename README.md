# Remote Jobs Aggregator

One normalized feed from seven public remote-job sources: RemoteOK, Remotive, We Work Remotely, Himalayas, Arbeitnow, Jobicy and the monthly Hacker News "Who is hiring?" thread.

Uses official public APIs and RSS feeds. No proxies, no login, no browser, so runs are fast and rarely break.

## What you get
Each job has: `source`, `title`, `company`, `location`, `remote`, `jobType`, `tags`, salary fields (`salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod`), `postedAt`, `url`, `applyUrl`, `description`.
Duplicates (same company + title across boards) are removed. Newest jobs come first.

## Input
- **keywords**: keep jobs matching ANY keyword (title, company, tags, description)
- **excludeKeywords**: drop e.g. `intern`, `junior`
- **sources**: pick job boards, default all
- **minSalaryUsd**: only jobs that publish a salary at or above this
- **maxAgeDays**, **maxResults**

## Use cases
- Daily remote-job alerts for a niche (schedule the Actor, send results to Slack, Sheets or email)
- Job board or newsletter content feeds
- Hiring-signal data for sales teams: which companies are hiring for a given skill
- Market research on remote salaries and skills

## Notes
Data comes from third-party public feeds and belongs to the original sites. Each result links back to the source posting.

---
Hosted version (no setup, pay per result): https://apify.com/quiethand098/remote-jobs-aggregator
