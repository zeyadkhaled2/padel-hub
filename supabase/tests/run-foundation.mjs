import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Never reset postgres or connect to a hosted URL. No host port is needed.
const container = "supabase_db_padelhub-local";
const database = `padelhub_test_${randomBytes(8).toString("hex")}`;
const root = fileURLToPath(new URL("../", import.meta.url));
let created = false;

function docker(args, input) {
  const result = spawnSync("docker", args, {
    input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || `Docker exited ${result.status}`);
  }
  return result.stdout;
}

function sql(input) {
  return docker([
    "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], input);
}

function session(applicationName) {
  const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]);
  const state = { child, stdout: "", stderr: "" };
  child.stdout.on("data", (data) => { state.stdout += data.toString(); });
  child.stderr.on("data", (data) => { state.stderr += data.toString(); });
  state.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: state.stdout, stderr: state.stderr }));
  });
  child.stdin.write(`\\set VERBOSITY sqlstate\nset application_name='${applicationName}'; set statement_timeout='12s'; set idle_in_transaction_session_timeout='15s';\n`);
  return state;
}

async function concurrentRace(firstSql, secondSql, expectedState) {
  const first = session("padelhub_race_first");
  let second;
  try {
    first.child.stdin.write(`${firstSql}\nselect 'CLAIM_HELD';\n`);
    for (let i = 0; !first.stdout.includes("CLAIM_HELD"); i++) {
      if (i >= 100 || first.child.exitCode !== null) throw new Error(`First race session failed: ${first.stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    second = session("padelhub_race_second");
    second.child.stdin.end(`${secondSql}\ncommit;\n`);
    let blocked = false;
    for (let i = 0; i < 30; i++) {
      const result = sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='padelhub_race_second' and wait_event_type='Lock';");
      if (/\b1\b/.test(result)) { blocked = true; break; }
      if (second.child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!blocked) throw new Error("Concurrent contender did not demonstrably wait on a database lock.");
    first.child.stdin.end("commit;\n");
    const [winner, loser] = await Promise.all([first.done, second.done]);
    if (winner.code !== 0 || loser.code === 0 || !loser.stderr.includes(expectedState)) {
      throw new Error(`Unexpected race result: winner ${winner.code}; loser ${loser.code}: ${loser.stderr}`);
    }
  } finally {
    for (const state of [first, second].filter(Boolean)) {
      if (!state.child.stdin.destroyed) state.child.stdin.end("rollback;\n");
    }
    await Promise.all([first.done, second?.done].filter(Boolean));
  }
}

try {
  // A schema-only copy is owned by the scratch operator. Check the actual vendor
  // schema too, so missing grant authority in Studio cannot be masked by it.
  docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `
    do $$ declare capability text; begin
      if to_regprocedure('public.get_my_profile_bundle()') is not null then
        foreach capability in array array['padelhub_profile_writer','padelhub_listing_writer','padelhub_review_writer'] loop
          if exists(select 1 from pg_roles where rolname=capability)
            and not has_schema_privilege(capability,'auth','USAGE') then
            raise exception 'Installed local capability % lacks Auth schema USAGE; see migration 006', capability;
          end if;
        end loop;
      end if;
    end $$;
  `);
  console.log("PASS: installed local writer Auth schema privileges (when present).");
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  // Vendor Auth schema only: no users, sessions, credentials or application data.
  const authSchema = docker([
    "exec", container, "pg_dump", "-U", "postgres", "-d", "postgres",
    "--schema-only", "--schema=auth", "--no-owner", "--no-privileges",
  ]).replace(/^CREATE POLICY (?:profile_writer_identity|listing_writer_identity|review_writer_identity) ON auth\.users\b[\s\S]*?;\r?\n/gm, "");
  // Studio may already have our migrations. Recreate this application-owned
  // Auth policy via migrations, not via the vendor-schema bootstrap dump.
  sql(authSchema);
  const migrations = readdirSync(join(root, "migrations")).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    sql(readFileSync(join(root, "migrations", name), "utf8"));
    console.log(`Applied ${name} to disposable database.`);
  }
  sql(readFileSync(join(root, "tests", "listing-fixtures.sql"), "utf8"));
  let total = 0;
  for (const test of readdirSync(join(root, "tests")).filter((name) => name.endsWith(".test.sql")).sort()) {
  const output = sql(readFileSync(join(root, "tests", test), "utf8"));
  const passed = [...output.matchAll(/^\s*ok \d+\b/gm)].length;
  const failed = [...output.matchAll(/^\s*not ok \d+\b/gm)].length;
  const planned = Number(output.match(/^\s*1\.\.(\d+)/m)?.[1]);
  if (failed || !planned || passed !== planned || !output.includes("ROLLBACK")) {
    console.error(output);
    throw new Error(`SQL assertions failed: ${passed} passed, ${failed} failed, ${planned} planned.`);
  }
  total += passed;
  console.log(`PASS: ${test}: ${passed}/${planned} assertions; fixtures rolled back.`);
  }
  console.log(`PASS: ${total} SQL assertions in total.`);
  sql(`insert into auth.users(id,email_confirmed_at) values
    ('aaaaaaaa-1111-4111-8111-111111111111',now()),('bbbbbbbb-2222-4222-8222-222222222222',now());`);
  const asCaller = (id) => `begin; set local role authenticated; set local request.jwt.claims='{"sub":"${id}","role":"authenticated"}';`;
  await concurrentRace(
    `${asCaller("aaaaaaaa-1111-4111-8111-111111111111")} select public.create_seller_profile('Race_Player','Synthetic A','cairo');`,
    `${asCaller("bbbbbbbb-2222-4222-8222-222222222222")} select public.create_seller_profile('race_player','Synthetic B','giza');`,
    "23505",
  );
  console.log("PASS: concurrent case-insensitive claims: observed lock wait, one commit, one conflict (23505).");
  await concurrentRace(
    `${asCaller("aaaaaaaa-1111-4111-8111-111111111111")} select public.update_seller_profile(1,'{"bio":"winner"}');`,
    `${asCaller("aaaaaaaa-1111-4111-8111-111111111111")} select public.update_seller_profile(1,'{"bio":"stale"}');`,
    "PT409",
  );
  console.log("PASS: concurrent profile updates: observed lock wait, one commit, one stale-version rejection (PT409).");
  sql(`do $$ begin
    if (select count(*) from public.seller_profiles)<>1 or
       (select count(*) from public.username_registry where username_lower='race_player' and kind='active_profile')<>1 or
       (select bio from public.seller_profiles limit 1)<>'winner' or
       (select version from public.seller_profiles limit 1)<>2 then raise exception 'race state invalid'; end if;
    end $$;`);
  console.log("PASS: committed race state and deferred constraints verified.");
  // Scratch-only coverage of dormant alias implementation.
  sql("grant padelhub_profile_writer to postgres; grant execute on function public.rename_seller_username(integer,text) to authenticated; revoke padelhub_profile_writer from postgres;");
  for (const [version, name] of [[2, "race_alias"], [3, "race_player"], [4, "race_alias"], [5, "race_player"]]) {
    sql(`${asCaller("aaaaaaaa-1111-4111-8111-111111111111")} select public.rename_seller_username(${version},'${name}'); commit;`);
  }
  sql(`do $$ begin
    if (select username from public.seller_profiles limit 1)<>'race_player' or
       (select count(*) from public.username_aliases where is_active)<>1 or
       (select kind from public.username_registry where username_lower='race_alias')<>'alias'
    then raise exception 'repeated alias reclaim state invalid'; end if;
    end $$;`);
  sql("grant padelhub_profile_writer to postgres; revoke execute on function public.rename_seller_username(integer,text) from authenticated; revoke padelhub_profile_writer from postgres;");
  console.log("PASS: dormant alias implementation preserves deferred invariants; permission revoked again.");
  for (const [user, username, accountType, cap] of [
    ["cccccccc-3333-4333-8333-333333333333", "race_individual", "individual", 5],
    ["dddddddd-4444-4444-8444-444444444444", "race_business", "business", 20],
  ]) {
    sql(`insert into auth.users(id,email_confirmed_at) values ('${user}',now());`);
    sql(`${asCaller(user)}
      select public.create_seller_profile('${username}','Synthetic race seller','cairo','${accountType}');
      select public.update_seller_profile(1,'{"is_public":true}');
      select public.update_my_contact(2,1,'+201000000003',true); commit;`);
    sql(`begin;
      select test_fixtures.listing('${user}','pending') from generate_series(1,${cap - 1});
      select test_fixtures.listing('${user}','reserved');
      select test_fixtures.listing('${user}','draft') from generate_series(1,2); commit;`);
    const candidates = sql(`select id from public.listings where seller_id='${user}' and status='draft' order by id;`).match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/g);
    if (candidates?.length !== 2) throw new Error("Missing last-slot draft fixtures");
    for (const isolation of ["repeatable read", "serializable"]) {
      sql(`begin isolation level ${isolation}; set local role authenticated;
        set local request.jwt.claims='{"sub":"${user}"}';
        do $$ begin
          begin
            perform public.submit_listing('${candidates[0]}',1);
            raise exception 'Fixed-snapshot submission unexpectedly accepted';
          exception when sqlstate '25001' then null;
          end;
        end $$; rollback;`);
    }
    console.log(`PASS: ${accountType} submissions reject fixed-snapshot isolation before mutation.`);
    await concurrentRace(
      `${asCaller(user)} select public.submit_listing('${candidates[0]}',1);`,
      `${asCaller(user)} select public.submit_listing('${candidates[1]}',1);`,
      "PT409",
    );
    sql(`do $$ begin
      if (select count(*) from public.listings where seller_id='${user}' and status in ('active','pending'))<>${cap}
        or (select status from public.listings where id='${candidates[0]}')<>'pending'
        or (select version from public.listings where id='${candidates[0]}')<>2
        or (select status from public.listings where id='${candidates[1]}')<>'draft'
        or (select version from public.listings where id='${candidates[1]}')<>1
        then raise exception 'last-slot race violated cap or rollback'; end if;
      end $$;`);
    console.log(`PASS: ${accountType} last-slot submissions: lock wait observed, one commit, one cap conflict; count=${cap}, losing draft unchanged.`);
    await concurrentRace(
      `${asCaller(user)} select public.update_listing_draft('${candidates[1]}',1,'{"title":"Winner edit"}');`,
      `${asCaller(user)} select public.update_listing_draft('${candidates[1]}',1,'{"title":"Stale edit"}');`,
      "PT409",
    );
    console.log(`PASS: ${accountType} concurrent draft edits: lock wait observed, stale write rejected.`);
  }
  const reviewOwner = "eeeeeeee-5555-4555-8555-555555555555";
  const reviewer = "ffffffff-6666-4666-8666-666666666666";
  const asReviewer = () => `begin; set local role authenticated; set local request.jwt.claims='{"sub":"${reviewer}","aal":"aal2"}';`;
  sql(`insert into auth.users(id,email_confirmed_at) values ('${reviewOwner}',now()),('${reviewer}',now());
    insert into private.admin_roles(user_id,role) values('${reviewer}','admin');
    create table test_fixtures.reviews(name text primary key,id uuid,snapshot jsonb);
    grant usage on schema test_fixtures to authenticated;
    grant select,update on test_fixtures.reviews to authenticated;`);
  sql(`${asCaller(reviewOwner)}
    select public.create_seller_profile('review_race_owner','Synthetic reviewer race','cairo');
    select public.update_seller_profile(1,'{"is_public":true}');
    select public.update_my_contact(2,1,'+201000000004',true); commit;`);
  for (const name of ["owner_first", "admin_first", "privacy_first", "cap_first", "revocation_first"]) {
    sql(`begin; insert into test_fixtures.reviews(name,id) values('${name}',test_fixtures.listing('${reviewOwner}','pending')); commit;`);
  }
  sql(`${asReviewer()} update test_fixtures.reviews set snapshot=public.admin_get_listing_review(id); commit;`);
  for (const isolation of ["repeatable read", "serializable"]) {
    for (const decision of ["approve", "reject"]) {
      sql(`begin isolation level ${isolation}; set local role authenticated;
        set local request.jwt.claims='{"sub":"${reviewer}","aal":"aal2"}';
        do $$ begin begin
          perform public.admin_${decision}_listing(
            (select id from test_fixtures.reviews where name='owner_first'),1,1,3,
            (select snapshot->'media_manifest' from test_fixtures.reviews where name='owner_first')${decision === "reject" ? ",'Synthetic reason'" : ""});
          raise exception 'Fixed-snapshot review decision unexpectedly accepted';
        exception when sqlstate '25001' then null; end; end $$; rollback;`);
    }
  }
  console.log("PASS: four fixed-snapshot approve/reject attempts denied before mutation.");
  const reviewId = (name) => `(select id from test_fixtures.reviews where name='${name}')`;
  const approve = (name) => `select public.admin_approve_listing(${reviewId(name)},1,1,3,(select snapshot->'media_manifest' from test_fixtures.reviews where name='${name}'));`;
  await concurrentRace(
    `${asCaller(reviewOwner)} select public.withdraw_listing(${reviewId("owner_first")},1); select public.update_listing_draft(${reviewId("owner_first")},2,'{"title":"Owner changed after review"}');`,
    `${asReviewer()} ${approve("owner_first")}`, "PT409",
  );
  sql(`do $$ begin
    if (select status from public.listings where id=${reviewId("owner_first")})<>'draft'
      or (select content_version from public.listings where id=${reviewId("owner_first")})<>2
      or exists(select 1 from private.listing_moderation_state where listing_id=${reviewId("owner_first")})
    then raise exception 'owner-first review race invalid'; end if;
  end $$;`);
  console.log("PASS: owner withdrawal/edit wins observed lock race; stale approval rejected without snapshot.");
  await concurrentRace(
    `${asReviewer()} ${approve("admin_first")}`,
    `${asCaller(reviewOwner)} select public.withdraw_listing(${reviewId("admin_first")},1);`, "PT409",
  );
  sql(`${asCaller(reviewOwner)} select public.withdraw_listing(${reviewId("admin_first")},2); commit;`);
  sql(`do $$ begin
    if (select status from public.listings where id=${reviewId("admin_first")})<>'draft'
      or (select last_approved_content_version from public.listings where id=${reviewId("admin_first")})<>1
      or (select reviewed_content_version from private.listing_moderation_state where listing_id=${reviewId("admin_first")})<>1
    then raise exception 'admin-first review race invalid'; end if;
  end $$;`);
  console.log("PASS: approval wins observed lock race; stale withdrawal fails, refreshed withdrawal preserves reviewed history.");
  await concurrentRace(
    `${asCaller(reviewOwner)} select public.update_seller_profile(3,'{"is_public":false}');`,
    `${asReviewer()} ${approve("privacy_first")}`, "PT409",
  );
  console.log("PASS: profile privacy change wins observed lock race; stale profile review rejected.");
  sql(`${asCaller(reviewOwner)} select public.update_seller_profile(4,'{"is_public":true}'); commit;`);
  const currentApprove = (name) => approve(name).replace(",1,1,3,", ",1,1,5,");
  await concurrentRace(
    "begin; update public.platform_settings set individual_active_pending_limit=1;",
    `${asReviewer()} ${currentApprove("cap_first")}`, "PT409",
  );
  sql("update public.platform_settings set individual_active_pending_limit=5;");
  console.log("PASS: settings cap cut wins observed lock race; approval recount rejects over-cap state.");
  await concurrentRace(
    `begin; update private.admin_roles set revoked_at=now() where user_id='${reviewer}';`,
    `${asReviewer()} ${currentApprove("revocation_first")}`, "42501",
  );
  console.log("PASS: admin-role revocation wins observed lock race; approval denied.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // Only the database created by this invocation can be dropped. Never use --force.
  if (created && /^padelhub_test_[0-9a-f]{16}$/.test(database)) {
    try {
      docker(["exec", container, "dropdb", "-U", "postgres", database]);
      console.log("Removed disposable test database; Studio database unchanged.");
    } catch (error) {
      console.error(`Scratch cleanup failed for ${database}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
