const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./openapi.json");

const app = express();

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
const PORT = 3000;

app.use(express.json());

const Database = require("better-sqlite3");
const db = new Database("tasks.db");

db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_title ON tasks(title)`);

  const count = db.prepare("SELECT COUNT(*) AS c FROM tasks").get().c;
  if (count === 0) {
    const insert = db.prepare("INSERT INTO tasks (title, done) VALUES (?, ?)");
    insert.run("Buy milk", 0);
    insert.run("Write README", 0);
    insert.run("Learn Express", 1);
  }
})();

const mapTask = (t) => ({ ...t, done: t.done === 1 });

app.get("/", (req, res) => {
  res.json({
    name: "Task API",
    version: "1.0",
    endpoints: ["/tasks"],
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/tasks", (req, res) => {
  const { done, search, limit, offset } = req.query;

  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (done !== undefined) {
    sql += ' AND done = ?';
    params.push(done === "true" ? 1 : 0);
  }

  if (search) {
    sql += ' AND title LIKE ?';
    params.push(`%${String(search)}%`);
  }

  sql += ' ORDER BY title';

  if (limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }

  if (offset !== undefined) {
    sql += ' OFFSET ?';
    params.push(Number(offset));
  }

  const result = db.prepare(sql).all(...params).map(mapTask);
  res.json(result);
});

app.get("/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.json(mapTask(task));
});

app.post("/tasks", (req, res) => {
  const { title } = req.body || {};

  if (!title || typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "title is required and cannot be empty" });
  }

  const info = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)').run(title.trim(), 0);
  const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);

  res.status(201).json(mapTask(newTask));
});

app.put("/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const { title, done } = req.body || {};

  if (title === undefined && done === undefined) {
    return res.status(400).json({ error: "provide at least title or done to update" });
  }

  let newTitle = task.title;
  let newDone = task.done;

  if (title !== undefined) {
    if (typeof title !== "string" || title.trim() === "") {
      return res.status(400).json({ error: "title must be a non-empty string" });
    }
    newTitle = title.trim();
  }

  if (done !== undefined) {
    if (typeof done !== "boolean") {
      return res.status(400).json({ error: "done must be a boolean" });
    }
    newDone = done ? 1 : 0;
  }

  db.prepare('UPDATE tasks SET title = ?, done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newTitle, newDone, id);
  const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  res.json(mapTask(updatedTask));
});

app.delete("/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

  if (info.changes === 0) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(204).send();
});

app.get("/stats", (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total, 
      SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as done 
    FROM tasks
  `).get();
  
  const total = stats.total;
  const done = stats.done || 0;
  res.json({ total, done, open: total - done });
});

app.post("/reset", (req, res) => {
  db.transaction(() => {
    db.exec('DELETE FROM tasks');
    const insert = db.prepare("INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)");
    insert.run(1, "Buy milk", 0);
    insert.run(2, "Write README", 0);
    insert.run(3, "Learn Express", 1);
  })();
  
  const tasks = db.prepare('SELECT * FROM tasks').all().map(mapTask);
  res.json({ message: "Tasks reset to the 3 example tasks", tasks });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
