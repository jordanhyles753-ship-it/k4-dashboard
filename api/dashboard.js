// Serverless function — fetches live Asana + Kanban data, returns combined JSON.
// Cached at the edge for 5 minutes so rapid page loads don't hammer the APIs.

module.exports = async function handler(req, res) {
  const ASANA_TOKEN  = process.env.ASANA_TOKEN;
  const KANBAN_TOKEN = process.env.KANBAN_TOKEN;
  const WS_ID        = '1123446613688331';
  const TODAY        = new Date().toISOString().slice(0, 10);

  try {
    // ── 1. Asana: project list ──────────────────────────────────────────────
    const projResp = await fetch(
      `https://app.asana.com/api/1.0/projects?workspace=${WS_ID}&limit=100` +
      `&opt_fields=name,due_date,start_on`,
      { headers: { Authorization: `Bearer ${ASANA_TOKEN}` } }
    );
    const projData = await projResp.json();
    const projects  = projData.data || [];

    // ── 2. Asana: tasks for every project (parallel) ────────────────────────
    const taskResults = await Promise.all(
      projects.map(p =>
        fetch(
          `https://app.asana.com/api/1.0/tasks?project=${p.gid}` +
          `&opt_fields=name,completed,due_on&limit=100`,
          { headers: { Authorization: `Bearer ${ASANA_TOKEN}` } }
        )
          .then(r => r.json())
          .then(d => ({ gid: p.gid, tasks: d.data || [] }))
          .catch(() => ({ gid: p.gid, tasks: [] }))
      )
    );

    // ── 3. Build Asana map (name → stats) ───────────────────────────────────
    const asana = {};
    projects.forEach(p => {
      const tasks    = taskResults.find(t => t.gid === p.gid)?.tasks || [];
      const withDue  = tasks.filter(t => t.due_on).sort((a, b) => a.due_on.localeCompare(b.due_on));
      const comp     = withDue.filter(t => t.completed);
      const incomp   = withDue.filter(t => !t.completed);
      const total    = tasks.length;
      const done     = tasks.filter(t => t.completed).length;
      asana[p.name]  = {
        due_date:     p.due_date   || null,
        start_on:     p.start_on  || null,
        total,
        done,
        pct:          total ? Math.round(done / total * 100) : 0,
        lastStep:     comp[comp.length - 1]?.name  || null,
        currentStep:  incomp[0]?.name              || null,
        currentDue:   incomp[0]?.due_on            || null,
        overdueCount: incomp.filter(t => t.due_on < TODAY).length,
      };
    });

    // ── 4. Kanban: all boards ───────────────────────────────────────────────
    const kbResp = await fetch(
      'https://kanban.abeka.com/api/v1/boards?per_page=300',
      {
        headers: {
          Authorization: `Bearer ${KANBAN_TOKEN}`,
          Accept:        'application/xml',
        },
      }
    );
    const kbXml = await kbResp.text();

    // Parse boards from XML without a DOM parser (server-side)
    const kanban = {};
    for (const m of kbXml.matchAll(/<board>([\s\S]*?)<\/board>/g)) {
      const board    = m[1];
      const name     = board.match(/<name[^>]*>(.*?)<\/name>/)?.[1]?.trim() || '';
      const versions = parseInt(board.match(/<version[^>]*>(\d+)<\/version>/)?.[1] || '0', 10);
      const updated  = board.match(/<updated-at[^>]*>([\d\-T:+]+)/)?.[1]?.slice(0, 10) || '';
      const code     = name.match(/^(\d{5,10})/)?.[1];
      if (code) {
        // Multiple boards per code → accumulate
        if (!kanban[code]) kanban[code] = { totalVersions: 0, lastActivity: '', boards: [] };
        kanban[code].totalVersions += versions;
        if (updated > kanban[code].lastActivity) kanban[code].lastActivity = updated;
        kanban[code].boards.push(name.replace(/^\d+\s*/, ''));
      }
    }

    // ── 5. Respond ──────────────────────────────────────────────────────────
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ asana, kanban, generated: new Date().toISOString() });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
