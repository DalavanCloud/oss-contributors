const octokit = require('@octokit/rest')();
const BigQuery = require('@google-cloud/bigquery');
const moment = require('moment');
moment.relativeTimeThreshold('m', 55);
moment.relativeTimeThreshold('ss', 5);
moment.relativeTimeThreshold('s', 55);
const PROJECT_ID = 'public-github-adobe';
const DATASET_ID = 'github_archive_query_views';
const USERS_WITH_PUSHES = 'users_pushes_2017'; // TODO: update to make this a parameter via the command line
const USERS_TO_COMPANIES = 'user_to_company'; // TODO: update to sql
const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: 'bigquery.json'
});
const row_module = require('./row_marker.js');
const persistence = require('./persistence.js');
const github_tokens = require('./github_tokens.js');
const companies = require('./companies.js');

let row_marker = false; // a file that tells us how many github usernames (from the githubarchive activity stream) weve already processed.
let new_rows = []; // we push any new user-to-company info here

// BigQuery objects
const dataset = bigquery.dataset(DATASET_ID);
const user_source = dataset.table(USERS_WITH_PUSHES); // this table has a list of active github usernames in 2017, ordered by number of commits
const target_table = dataset.table(USERS_TO_COMPANIES); // TODO: update to sql. this table is where we will write username to company associations to

// TODO: Plan for move to SQL table.
// we have a baseline of usercos now (TODO: backup plan for sql db). so we can assume from here on out, the user-co table is something that just needs adding to or updating to.
// can we try to limit the interactions to SQL to just INSERTs and UPDATEs? would necessitate having an in-memory copy of the DB ahead of time.
// not crazy tho right? with command-line parsing (which we need to do for specifying source tables anyways), we could have the tool be pointed to
// a local json file that represents the copy of the db. OR, the tool could create it.
// so tool could have a cli command pattern with commands:
//  - db-to-json: spits out user-co db as json
//  - update-db --source tablename --db-json db.json: update userco db based on tablename bigquery table, optionally with local cached version of db at db.json
//  - rank: show top cos with githubbers

(async () => {
    await github_tokens.seed_tokens(); // read github oauth tokens from filesystem
    row_marker = await row_module.read(); // read our row marker file for a hint as to where to start from
    console.log('Starting up processing at row', row_marker);
    // get a ctrl+c handler in (useful for testing)
    process.on('SIGINT', async () => {
        if (new_rows.length === 0) process.exit(1);
        if (!persistence.is_saving()) {
            console.log('SIGINT caught! Will flush rows then exit process, please wait...');
            await persistence.save_rows_to_bigquery(target_table, row_marker, new_rows, true);
        } else {
            console.log('CTRL+C aint gonna do shiet! wait til this process flushes yo!');
        }
    });
    while (await github_tokens.has_not_reached_api_limit()) {
        const token_details = await github_tokens.get_roomiest_token(true); // silent=true
        const calls_remaining = token_details.remaining;
        const limit_reset = token_details.reset;
        console.log('We have', calls_remaining, 'API calls to GitHub remaining with the current token, window will reset', moment.unix(limit_reset).fromNow());
        console.log('Asking for rows', row_marker, 'through', row_marker + calls_remaining, '...');
        octokit.authenticate({
            type: 'token',
            token: token_details.token
        });
        let raw_data = [];
        try {
            raw_data = (await user_source.getRows({startIndex: row_marker, maxResults: calls_remaining}))[0];
        } catch (e) {
            console.error('Error retrieving source rows, skipping...', e);
        }
        if (raw_data.length === 0) {
            console.log('No rows returned! We might have hit the end! Row marker is', row_marker);
            break;
        }
        let counter = 0;
        let start_time = moment();
        let end_time = moment();
        for (let user of raw_data) {
            let login = user.login;
            let profile;
            try {
                profile = await octokit.users.getForUser({username: login});
            } catch (e) {
                if (e.code !== 404) {
                    console.warn('Error retrieving profile info for', login, '- moving on. Error code:', e.code, 'Status:', e.status);
                }
                continue;
            }
            let etag = profile.meta.etag;
            let company = profile.data.company;
            if (company && company.length > 0) {
                let company_match = company.match(companies.catch_all);
                if (company_match) {
                    var company_info = companies.map[company_match[0].toLowerCase()];
                    // We store additional company data to customize behaviour here, in certain cases.
                    if (company_info.ignore) {
                        // First, some of the company names catch A LOT of stuff via regex, so `ignore` helps to qualify this a bit
                        if (!company.match(company_info.ignore)) {
                            company = company_info.label;
                        }
                    } else {
                        // If there is no ignore property in the company map, then we just use the string value returned from the company map
                        company = company_info;
                    }
                }
            }
            new_rows.push({
                user: login,
                company: company,
                fingerprint: etag
            });
            row_marker++;
            counter++;
            end_time = moment();
            process.stdout.write('Processed ' + counter + ' records in ' + end_time.from(start_time, true) + '                     \r');
            if (counter % 1000 === 0 && !persistence.is_saving()) {
                // Every X records, lets flush the new rows to bigquery, unless were already saving/flushing.
                let did_persist = await persistence.save_rows_to_bigquery(target_table, row_marker, new_rows);
                // if saving to bigquery worked, flush out new_rows array. otherwise, hope we get it next time.
                if (did_persist) new_rows = [];
            }
        }
        console.log('Processed', counter, 'records in', end_time.from(start_time, true), '.');
    }
    if (!persistence.is_saving()) {
        await persistence.save_rows_to_bigquery(target_table, row_marker, new_rows);
    }
})();