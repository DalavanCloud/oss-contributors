# Tracking Open Source Contributors

> Build a(n improved) ranking of companies-as-contributors-to-public-GitHub (based on [this blog post](https://medium.freecodecamp.org/the-top-contributors-to-github-2017-be98ab854e87)).

## Too Long; Didn't Read

Pretty graphs over [here](https://docs.google.com/spreadsheets/d/1EosxNv67tC2IYFY_RFeCoSY3JipiVfYyky9VejKAS9k/edit#gid=566883526).

## Why?

The user-to-company association in [the ranking blog post that inspired us](https://medium.freecodecamp.org/the-top-contributors-to-github-2017-be98ab854e87)
is fairly poor: it uses the email associated to a `git` config, and if the domain
to the email is NOT of a public mail provider (gmail, yahoo, etc), it assumes it's
a company. That's not a great way of going about it because not many people use
their company's e-mail in the git config they use with their public GitHub.com account.

To make that association better, this project cross-reference GitHub.com activity,
which is tracked via [githubarchive.org](http://githubarchive.org) data (and is
[freely available as a dataset](https://www.githubarchive.org/#bigquery) in
[Google BigQuery](http://bigquery.cloud.google.com)) with
[GitHub.com](http://github.com) user profiles. We pull the `company` field
from user's profiles and store those in a periodically-updated database.

## Features

- Leverages [githubarchive.org](http://githubarchive.org)'s [freely available dataset on Google BigQuery](https://www.githubarchive.org/#bigquery)
  to track public user activity on GitHub.
- A GitHub.com REST API crawler that pulls users' company associations (based
  on their public profile), that we then store in a database (and periodically
  update).
- Tracking and visualizing GitHub contributors from tech companies' activity
  over time in a [spreadsheet](https://docs.google.com/spreadsheets/d/1EosxNv67tC2IYFY_RFeCoSY3JipiVfYyky9VejKAS9k/edit#gid=566883526).

## Implementation

We have a [BigQuery project](https://bigquery.cloud.google.com/dataset/public-github-adobe)
with relevant supporting tables and queries. If you'd like access, contact @maj
(on Slack at #guild-dev-experience, email, an issue here, whatever). This project contains:

1. A database table tracking user-company associations (currently done in an Adobe IT managed MySQL DB).
   Fields include GitHub username, company field, fingerprint (ETag value as
   reported from GitHub, as a cache-buster). We synchronize the MySQL DB with
   the BigQuery every now and then using a command this program provides.
2. Another [table tracks GitHub usernames active over a certain time period](https://bigquery.cloud.google.com/table/public-github-adobe:github_archive_query_views.users_pushes_2017?pli=1).
    - We have one table, [`users_pushes_2017`](https://bigquery.cloud.google.com/table/public-github-adobe:github_archive_query_views.users_pushes_2017?pli=1),
      that we used as a baseline. This table tracked all GitHub users that had
      at least 10 commits in 2017.
    - We will [make incremental tables containing activity, for each passing month](https://bigquery.cloud.google.com/table/public-github-adobe:github_archive_query_views.users_pushes_2018_01?pli=1),
      and track how things progress.
3. Pound the GitHub REST API to pull user info, and drop that info into the
   table in point 1.

## TODO

1. Real-time visualization of the data.
2. Tests.

## Requirements

- Node.js 9+
- a `bigquery.json` file is needed in the root of the repo, which contains the
  credentials for access to Google Cloud BigQuery
- a `oauth.token` file is needed in the root of the repo, which contains GitHub.com
  personal access tokens, one per line, which we will use to get data from
  api.github.com
- a MySQL database to store user-company associations. Currently using an Adobe-IT-managed
  instance: hostname `leopardprdd`, database name, table name and username are all
  `GHUSERCO`, running on port 3323. @maj has the password. The schema is under the
  [`usercompany.sql`](usercompany.sql) file.

## Doing The Thing

    $ npm install
    $ npm link
    $ oss-contributors
