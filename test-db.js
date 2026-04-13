const pg = require("pg");
const pool = new pg.Pool({
  connectionString: "postgres://postgres:ar_password_2026@postgres:5432/autoresearch"
});

const id = "test-" + Date.now();
const title = "test title";
const desc = "test desc";
const status = "active";

pool.query(
  `INSERT INTO sessions (id, title, description, status)
   VALUES ($1,$2,$3,$4)
   ON CONFLICT (id) DO UPDATE SET
     status = EXCLUDED.status,
     completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN NOW() ELSE sessions.completed_at END`,
  [id, title, desc, status]
)
  .then(r => {
    console.log("INSERT OK:", r.rowCount);
    pool.end();
  })
  .catch(e => {
    console.error("INSERT FAIL:", e.message, "| code:", e.code, "| detail:", e.detail);
    pool.end();
  });
