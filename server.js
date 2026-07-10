// server.js - Bahir-Dar Factory Production Management System
// Backend API with SQLite database, all 9 tabs mapped to tables & relations

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database Setup ──────────────────────────────────────────
const dbPath = path.join(__dirname, 'factory_data.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
    seedDemoData();
  }
});

// ─── Initialize Tables ──────────────────────────────────────
function initializeDatabase() {
  db.serialize(() => {
    // 1. Shops
    db.run(`
      CREATE TABLE IF NOT EXISTS shops (
        shop_id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_name TEXT NOT NULL UNIQUE,
        shop_type TEXT
      )
    `);

    // 2. Operators
    db.run(`
      CREATE TABLE IF NOT EXISTS operators (
        operator_id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        shop_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
      )
    `);

    // 3. Machines
    db.run(`
      CREATE TABLE IF NOT EXISTS machines (
        machine_id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_code TEXT NOT NULL UNIQUE,
        machine_name TEXT NOT NULL,
        shop_id INTEGER NOT NULL,
        category TEXT,
        FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
      )
    `);

    // 4. Projects
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        category TEXT,
        is_active BOOLEAN DEFAULT 1
      )
    `);

    // 5. Assembly Parts
    db.run(`
      CREATE TABLE IF NOT EXISTS assembly_parts (
        part_id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_name TEXT NOT NULL,
        project_id INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
      )
    `);

    // 6. Production Records (operator performance)
    db.run(`
      CREATE TABLE IF NOT EXISTS production_records (
        record_id INTEGER PRIMARY KEY AUTOINCREMENT,
        operator_id INTEGER NOT NULL,
        shop_id INTEGER NOT NULL,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        planned_part TEXT,
        planned_qty INTEGER,
        planned_time REAL,
        actual_part TEXT,
        actual_qty INTEGER,
        actual_time REAL,
        performance_pct REAL,
        delay_reason TEXT,
        sick_days INTEGER DEFAULT 0,
        permission_days INTEGER DEFAULT 0,
        lack_materials BOOLEAN DEFAULT 0,
        lack_tool_cutter BOOLEAN DEFAULT 0,
        design_problem BOOLEAN DEFAULT 0,
        machine_breakdown BOOLEAN DEFAULT 0,
        machine_sequence_issue BOOLEAN DEFAULT 0,
        over_capacity BOOLEAN DEFAULT 0,
        machine_occupied BOOLEAN DEFAULT 0,
        own_problem BOOLEAN DEFAULT 0,
        FOREIGN KEY (operator_id) REFERENCES operators(operator_id),
        FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
      )
    `);

    // 7. Project Production
    db.run(`
      CREATE TABLE IF NOT EXISTS project_production (
        prod_id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        planned_qty INTEGER,
        planned_time REAL,
        actual_qty INTEGER,
        actual_time REAL,
        performance_pct REAL,
        upto_date_qty INTEGER,
        upto_date_time TEXT,
        overall_perf_pct REAL,
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
      )
    `);

    // 8. Machine Time Registration
    db.run(`
      CREATE TABLE IF NOT EXISTS machine_time_reg (
        reg_id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id INTEGER NOT NULL,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        planned_time REAL,
        actual_time REAL,
        utilization_pct REAL,
        remark TEXT,
        FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
      )
    `);

    // 9. Assembly Records
    db.run(`
      CREATE TABLE IF NOT EXISTS assembly_records (
        assembly_id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_id INTEGER NOT NULL,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        assembling_planned REAL,
        assembling_wip REAL,
        assembling_completed REAL,
        polishing_planned REAL,
        polishing_wip REAL,
        polishing_completed REAL,
        painting_planned REAL,
        painting_wip REAL,
        painting_completed REAL,
        upto_date_qty INTEGER,
        performance_pct REAL,
        FOREIGN KEY (part_id) REFERENCES assembly_parts(part_id)
      )
    `);

    // 10. Issues / Reasons
    db.run(`
      CREATE TABLE IF NOT EXISTS issues (
        issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        problem TEXT NOT NULL,
        root_cause TEXT,
        impact_level TEXT,
        solution TEXT,
        affected_project_id INTEGER,
        FOREIGN KEY (affected_project_id) REFERENCES projects(project_id)
      )
    `);

    // 11. Plans (next week)
    db.run(`
      CREATE TABLE IF NOT EXISTS plans (
        plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        plan_type TEXT NOT NULL,
        reference_id INTEGER NOT NULL,
        planned_qty INTEGER,
        planned_time REAL,
        target_qty INTEGER,
        target_time REAL,
        growth_pct REAL,
        notes TEXT
      )
    `);

    // Indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_prod_week ON production_records(week_start, week_end)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_project_week ON project_production(week_start, week_end)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_machine_week ON machine_time_reg(week_start, week_end)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_assembly_week ON assembly_records(week_start, week_end)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_issues_week ON issues(week_start, week_end)`);

    console.log('📦 Database tables ready');
  });
}

// ─── Seed Demo Data ──────────────────────────────────────────
function seedDemoData() {
  db.serialize(() => {
    // Check if data exists
    db.get('SELECT COUNT(*) as count FROM shops', (err, row) => {
      if (err || row.count > 0) return;

      const shops = [
        'Machine Shop', 'Fabrication Shop', 'Forging & Heat Treat',
        'Welding Shop', 'Polishing', 'Painting', 'Assembly'
      ];
      const shopIds = {};

      // Insert shops
      const stmtShop = db.prepare('INSERT INTO shops (shop_name) VALUES (?)');
      shops.forEach(name => stmtShop.run(name));
      stmtShop.finalize();

      // Get shop IDs
      shops.forEach((name, idx) => { shopIds[name] = idx + 1; });

      // Operators
      const operatorData = {
        'Machine Shop': ['Yilikal Anteneh', 'Ayshshim Chalie', 'Tsegaye Chanie', 'Melkamu Yaregal',
          'Dinkayehu Melese', 'Mulu Abebe', 'Birtukan Alamirew', 'Meseret Mulugieta',
          'Solomon Alemu', 'Nahom Solomon', 'Getasew Dessie', 'Takele Mekie',
          'Tilaye Aragew', 'Ayaliew Worku', 'Biniyam Misganaw', 'Habtamu Afewerk',
          'Oumer Hasen', 'Awol Shiferaw', 'Getaneh Deml', 'Temesgen Alem',
          'Werkagegnehu Shewaye', 'Kefialew Wedaje', 'Tesfanew Gizte', 'Wale Andualem'
        ],
        'Fabrication Shop': ['Abdela Endeshaw', 'Genet Siltan', 'Gojam Adamu', 'Astray Tsiga',
          'Abayneh Tadese', 'Birhanu Kindu', 'Temesgen Nibret', 'Abrham Ayana', 'Getachew'
        ],
        'Forging & Heat Treat': ['H/Eyesus Abeje', 'Shumye Guadu'],
        'Welding Shop': ['Abebaw Ager', 'Wubit Abera', 'Mesafint Afewerk', 'Belachew Tesfahun',
          'Chalachew Amogne', 'Amlakie Semani', 'Adebabay Tawuneh', 'Yenatfanta Kassa',
          'Amelmal Delelew', 'Netsanet Bazezew', 'Samrawit Mekonnen', 'Misganaw Tilahun',
          'Mniyichil Tilahun', 'Molalgn Ayinie', 'Tarekegn Wubu', 'Yaregal Mengesha',
          'Azmeraw Kebtie', 'Melaku Asimare', 'Yitayew Yilma', 'Bekalu Yaregal',
          'Agumas Bishaw', 'Salamlak', 'Zerihun Dejen', 'Bekele Kassa',
          'Birtukan Mola', 'Esey Alebachew', 'Zemenu Mola', 'Belete Siltanu',
          'Hailye Yismaw', 'Metalgn Getu', 'Firehiwot T/Mariam', 'Zelalem Melkamu',
          'Ejigu Bogale', 'Andualem Asresaw', 'Nigusu Bogale', 'Smegnew Alem',
          'Zelalem Aweke', 'Wubshet Abe', 'Wasihun Fente'
        ],
        'Polishing': ['Antehunegn Asres', 'Metadel Gietu', 'Agumas Bishaw', 'Mulu Tesfa',
          'Addisu Koye', 'Demelash', 'Nigusie', 'Yihenew Lakew', 'Minale Yechale'
        ],
        'Painting': ['Adisie Ewunetu', 'Adgo Baye', 'Zelalem Getnet', 'Yibeltal Dires', 'Yeshumnesh'],
        'Assembly': ['Endalew Admasu', 'Zemenu Yohannes', 'Nigatu Dires', 'Yohannes Biazin',
          'Birhanu Demlew', 'Temesgen Alem', 'Wale Andualem', 'Habtamu Manaye'
        ]
      };

      const stmtOp = db.prepare('INSERT INTO operators (full_name, shop_id) VALUES (?, ?)');
      for (const [shop, names] of Object.entries(operatorData)) {
        const sid = shopIds[shop];
        names.forEach(name => stmtOp.run(name, sid));
      }
      stmtOp.finalize();

      // Machines
      const machineData = {
        'Machine Shop': ['PH1', 'PH2', 'PH3', 'PH4', 'PH5', 'PH6', 'MDL1', 'MDL2', 'MDL3', 'MDL4',
          'MDL5', 'MDL6', 'MDL7', 'MDL8', 'MDL9', 'MDL10', 'MDL11', 'CPL1', 'CPL2', 'CPL3',
          'CPL4', 'CPL5', 'CPL6', 'CPL7', 'CPL8', 'CPL9', 'CPL10', 'CPL11', 'CHDPL1', 'CHDPL2',
          'DCVTL1', 'DCVTL2', 'CUM1', 'CUM2', 'CUM3', 'CUM4', 'CUM5', 'CUM6', 'CUM7', 'CUM8',
          'CUM9', 'CUM10', 'VMCM1', 'VMCM2', 'VMCM3', 'VMCM4', 'CNCUM5', 'CNCUM6', 'GH1',
          'RD1', 'RD2', 'RD3', 'FD1', 'FD2', 'FD3', 'GD1', 'CNCVD1', 'SH1', 'HVS1', 'HVS2',
          'SG1', 'SG2', 'SG3', 'CEG1', 'CEG2', 'CCIG1', 'CCIG2', 'C5AG1', 'UCG1', 'UCG2',
          'PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'VH1', 'CDHH1', 'CDHDB1', 'CDHD1', 'EDM1',
          'EDM2', 'CWCEDM1', 'CWCEDM2'
        ],
        'Fabrication Shop': ['MS1', 'MS2', 'MS3', 'PS1', 'PS2', 'PS3', 'PS4', 'FS1', 'FS2', 'FS3',
          'FS4', 'PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'MB1', 'MB2', 'HB', 'PB1', 'PB2',
          'R1', 'R2', 'R3', 'R4', 'SM1', 'SM2', 'HDHS1', 'HDHS2', 'HFRPR1', 'HTRPR1',
          'HSMB1', 'HCSP1', 'HCSP2', 'APB1', 'APFB1', 'CHTP1'
        ],
        'Gas Cutting Shop': ['SGC', 'HGC1', 'HGC2', 'CNCGC1', 'CNCGC2', 'CNCGC3', 'MGC', 'PC1',
          'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'CLC1', 'GTCPMC1', 'ATPHFC1', 'ATPHFC2'
        ],
        'Welding Shop': ['AW1', 'AW2', 'AW3', 'AW4', 'AW5', 'AW6', 'AW7', 'AW8', 'AW9', 'AW10',
          'AW11', 'TW1', 'TW2', 'TW3', 'MW1', 'MW2', 'MW3', 'MW4', 'MW5', 'MW6',
          'SMW1', 'SMW2', 'SMW3', 'PSW1', 'PSW2'
        ],
        'Forging & Heat Treat': ['HFM1', 'HFM2', 'PnFM1', 'PnFM2', 'PnFM3', 'HTM1', 'HTM2',
          'HPM2000-1', 'HPM2000-2', 'HPM2000-3', 'HPM2000-4', 'HPM2000-5', 'HPM2000-6',
          'HPM5000-1', 'HPM5000-2', 'HPM5000-3'
        ]
      };

      const stmtMac = db.prepare('INSERT INTO machines (machine_code, machine_name, shop_id) VALUES (?, ?, ?)');
      for (const [shop, codes] of Object.entries(machineData)) {
        const sid = shopIds[shop];
        codes.forEach(code => stmtMac.run(code, code, sid));
      }
      stmtMac.finalize();

      // Projects
      const projects = [
        { name: 'Axle Housing', category: 'Customer' },
        { name: 'Gear Box', category: 'Customer' },
        { name: 'Flange Coupling', category: 'Customer' },
        { name: 'Pump Body', category: 'Customer' },
        { name: 'Valve Stem', category: 'Customer' },
        { name: 'Cylinder Head', category: 'Customer' },
        { name: 'Hydraulic Manifold', category: 'Customer' },
        { name: 'Spindle Shaft', category: 'Customer' },
        { name: 'Bearing Housing', category: 'Customer' },
        { name: 'Custom Gear', category: 'Our Own Service' },
        { name: 'Tool Post', category: 'Our Own Service' },
        { name: 'Fixture Base', category: 'Our Own Service' }
      ];
      const projIds = [];
      const stmtProj = db.prepare('INSERT INTO projects (project_name, category) VALUES (?, ?)');
      projects.forEach(p => { stmtProj.run(p.name, p.category); });
      stmtProj.finalize();

      // Get project IDs
      db.all('SELECT project_id, project_name FROM projects', (err, rows) => {
        if (err) return;
        const map = {};
        rows.forEach(r => map[r.project_name] = r.project_id);

        // Assembly parts
        const parts = ['Gearbox Housing', 'Pump Casing', 'Valve Body', 'Flange Assembly', 'Cylinder Head'];
        const stmtPart = db.prepare('INSERT INTO assembly_parts (part_name, project_id) VALUES (?, ?)');
        parts.forEach((name, idx) => {
          const proj = projects[idx % projects.length];
          stmtPart.run(name, map[proj.name] || 1);
        });
        stmtPart.finalize();

        // Issues
        const issues = [
          { problem: 'Lack of raw material', cause: 'Supply Chain', impact: 'High',
          solution: 'Expedite PO & local sourcing' },
          { problem: 'Tool cutter breakage', cause: 'Maintenance', impact: 'Medium',
          solution: 'Preventive replacement schedule' },
          { problem: 'Machine breakdown (Lathe #3)', cause: 'Mechanical', impact: 'High',
          solution: 'Overhaul & spare parts order' },
          { problem: 'Design change request', cause: 'Engineering', impact: 'Low',
          solution: 'Update BOM & re-train operators' },
          { problem: 'Operator absenteeism', cause: 'HR', impact: 'Medium',
          solution: 'Cross-training & backup plan' }
        ];
        const stmtIssue = db.prepare(
          'INSERT INTO issues (week_start, week_end, problem, root_cause, impact_level, solution) VALUES (?, ?, ?, ?, ?, ?)'
          );
        const week = '2026-07-10';
        issues.forEach(iss => {
          stmtIssue.run(week, week, iss.problem, iss.cause, iss.impact, iss.solution);
        });
        stmtIssue.finalize();
      });

      console.log('🌱 Demo data seeded');
    });
  });
}

// ─── Helper: random number ───────────────────────────────────
function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }

// ─── API Routes ──────────────────────────────────────────────

// ─── 1. Get all shops ────────────────────────────────────────
app.get('/api/shops', (req, res) => {
  db.all('SELECT * FROM shops ORDER BY shop_id', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── 2. Get operators with shop info ────────────────────────
app.get('/api/operators', (req, res) => {
  const shopFilter = req.query.shop_id;
  let sql = `
    SELECT o.*, s.shop_name 
    FROM operators o 
    JOIN shops s ON o.shop_id = s.shop_id
  `;
  if (shopFilter) sql += ` WHERE o.shop_id = ${parseInt(shopFilter)}`;
  sql += ' ORDER BY o.full_name';
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── 3. Get machines with shop info ─────────────────────────
app.get('/api/machines', (req, res) => {
  const shopFilter = req.query.shop_id;
  let sql = `
    SELECT m.*, s.shop_name 
    FROM machines m 
    JOIN shops s ON m.shop_id = s.shop_id
  `;
  if (shopFilter) sql += ` WHERE m.shop_id = ${parseInt(shopFilter)}`;
  sql += ' ORDER BY m.machine_code';
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── 4. Get projects ────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  db.all('SELECT * FROM projects ORDER BY project_id', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── 5. Get assembly parts ──────────────────────────────────
app.get('/api/assembly-parts', (req, res) => {
  const sql = `
    SELECT ap.*, p.project_name 
    FROM assembly_parts ap 
    LEFT JOIN projects p ON ap.project_id = p.project_id
    ORDER BY ap.part_id
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── 6. Production Records (operator performance) ──────────
app.get('/api/production-records', (req, res) => {
  const { week_start, week_end, shop_id, operator_id } = req.query;
  let sql = `
    SELECT pr.*, o.full_name, s.shop_name 
    FROM production_records pr
    JOIN operators o ON pr.operator_id = o.operator_id
    JOIN shops s ON pr.shop_id = s.shop_id
    WHERE 1=1
  `;
  const params = [];
  if (week_start) { sql += ' AND pr.week_start = ?'; params.push(week_start); }
  if (week_end) { sql += ' AND pr.week_end = ?'; params.push(week_end); }
  if (shop_id) { sql += ' AND pr.shop_id = ?'; params.push(parseInt(shop_id)); }
  if (operator_id) { sql += ' AND pr.operator_id = ?'; params.push(parseInt(operator_id)); }
  sql += ' ORDER BY pr.record_id DESC LIMIT 200';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── 7. Create / Update production record ──────────────────
app.post('/api/production-records', (req, res) => {
  const data = req.body;
  const sql = `
    INSERT INTO production_records (
      operator_id, shop_id, week_start, week_end,
      planned_part, planned_qty, planned_time,
      actual_part, actual_qty, actual_time,
      performance_pct, delay_reason,
      sick_days, permission_days,
      lack_materials, lack_tool_cutter, design_problem,
      machine_breakdown, machine_sequence_issue,
      over_capacity, machine_occupied, own_problem
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.operator_id, data.shop_id, data.week_start, data.week_end,
    data.planned_part, data.planned_qty, data.planned_time,
    data.actual_part, data.actual_qty, data.actual_time,
    data.performance_pct, data.delay_reason,
    data.sick_days || 0, data.permission_days || 0,
    data.lack_materials || 0, data.lack_tool_cutter || 0, data.design_problem || 0,
    data.machine_breakdown || 0, data.machine_sequence_issue || 0,
    data.over_capacity || 0, data.machine_occupied || 0, data.own_problem || 0
  ];
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ record_id: this.lastID, ...data });
  });
});

// ─── 8. Project Production ──────────────────────────────────
app.get('/api/project-production', (req, res) => {
  const { week_start, week_end, project_id } = req.query;
  let sql = `
    SELECT pp.*, p.project_name, p.category
    FROM project_production pp
    JOIN projects p ON pp.project_id = p.project_id
    WHERE 1=1
  `;
  const params = [];
  if (week_start) { sql += ' AND pp.week_start = ?'; params.push(week_start); }
  if (week_end) { sql += ' AND pp.week_end = ?'; params.push(week_end); }
  if (project_id) { sql += ' AND pp.project_id = ?'; params.push(parseInt(project_id)); }
  sql += ' ORDER BY pp.prod_id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/project-production', (req, res) => {
  const data = req.body;
  const sql = `
    INSERT INTO project_production (
      project_id, week_start, week_end,
      planned_qty, planned_time, actual_qty, actual_time,
      performance_pct, upto_date_qty, upto_date_time, overall_perf_pct
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.project_id, data.week_start, data.week_end,
    data.planned_qty, data.planned_time, data.actual_qty, data.actual_time,
    data.performance_pct, data.upto_date_qty, data.upto_date_time, data.overall_perf_pct
  ];
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ prod_id: this.lastID, ...data });
  });
});

// ─── 9. Machine Time Registration ───────────────────────────
app.get('/api/machine-time', (req, res) => {
  const { week_start, week_end, machine_id } = req.query;
  let sql = `
    SELECT mtr.*, m.machine_code, m.machine_name, s.shop_name
    FROM machine_time_reg mtr
    JOIN machines m ON mtr.machine_id = m.machine_id
    JOIN shops s ON m.shop_id = s.shop_id
    WHERE 1=1
  `;
  const params = [];
  if (week_start) { sql += ' AND mtr.week_start = ?'; params.push(week_start); }
  if (week_end) { sql += ' AND mtr.week_end = ?'; params.push(week_end); }
  if (machine_id) { sql += ' AND mtr.machine_id = ?'; params.push(parseInt(machine_id)); }
  sql += ' ORDER BY mtr.reg_id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/machine-time', (req, res) => {
  const data = req.body;
  const sql = `
    INSERT INTO machine_time_reg (
      machine_id, week_start, week_end,
      planned_time, actual_time, utilization_pct, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.machine_id, data.week_start, data.week_end,
    data.planned_time, data.actual_time, data.utilization_pct, data.remark
  ];
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ reg_id: this.lastID, ...data });
  });
});

// ─── 10. Assembly Records ──────────────────────────────────
app.get('/api/assembly-records', (req, res) => {
  const { week_start, week_end, part_id } = req.query;
  let sql = `
    SELECT ar.*, ap.part_name, p.project_name
    FROM assembly_records ar
    JOIN assembly_parts ap ON ar.part_id = ap.part_id
    LEFT JOIN projects p ON ap.project_id = p.project_id
    WHERE 1=1
  `;
  const params = [];
  if (week_start) { sql += ' AND ar.week_start = ?'; params.push(week_start); }
  if (week_end) { sql += ' AND ar.week_end = ?'; params.push(week_end); }
  if (part_id) { sql += ' AND ar.part_id = ?'; params.push(parseInt(part_id)); }
  sql += ' ORDER BY ar.assembly_id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/assembly-records', (req, res) => {
  const data = req.body;
  const sql = `
    INSERT INTO assembly_records (
      part_id, week_start, week_end,
      assembling_planned, assembling_wip, assembling_completed,
      polishing_planned, polishing_wip, polishing_completed,
      painting_planned, painting_wip, painting_completed,
      upto_date_qty, performance_pct
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.part_id, data.week_start, data.week_end,
    data.assembling_planned, data.assembling_wip, data.assembling_completed,
    data.polishing_planned, data.polishing_wip, data.polishing_completed,
    data.painting_planned, data.painting_wip, data.painting_completed,
    data.upto_date_qty, data.performance_pct
  ];
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ assembly_id: this.lastID, ...data });
  });
});

// ─── 11. Issues / Reasons ──────────────────────────────────
app.get('/api/issues', (req, res) => {
  const { week_start, week_end } = req.query;
  let sql = `
    SELECT i.*, p.project_name
    FROM issues i
    LEFT JOIN projects p ON i.affected_project_id = p.project_id
    WHERE 1=1
  `;
  const params = [];
  if (week_start) { sql += ' AND i.week_start = ?'; params.push(week_start); }
  if (week_end) { sql += ' AND i.week_end = ?'; params.push(week_end); }
  sql += ' ORDER BY i.issue_id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/issues', (req, res) => {
  const data = req.body;
  const sql = `
    INSERT INTO issues (week_start, week_end, problem, root_cause, impact_level, solution, affected_project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.week_start, data.week_end, data.problem,
    data.root_cause, data.impact_level, data.solution, data.affected_project_id
  ];
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ issue_id: this.lastID, ...data });
  });
});

// ─── 12. Plans (next week) ──────────────────────────────────
app.get('/api/plans', (req, res) => {
  const { week_start, week_end, plan_type, reference_id } = req.query;
  let sql = 'SELECT * FROM plans WHERE 1=1';
  const params = [];
  if (week_start) { sql += ' AND week_start = ?'; params.push(week_start); }
  if (week_end) { sql += ' AND week_end = ?'; params.push(week_end); }
  if (plan_type) { sql += ' AND plan_type = ?'; params.push(plan_type); }
  if (reference_id) { sql += ' AND reference_id = ?'; params.push(parseInt(reference_id)); }
  sql += ' ORDER BY plan_id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/plans', (req, res) => {
  const data = req.body;
  const sql = `
    INSERT INTO plans (
      week_start, week_end, plan_type, reference_id,
      planned_qty, planned_time, target_qty, target_time,
      growth_pct, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.week_start, data.week_end, data.plan_type, data.reference_id,
    data.planned_qty, data.planned_time, data.target_qty, data.target_time,
    data.growth_pct, data.notes
  ];
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ plan_id: this.lastID, ...data });
  });
});

// ─── 13. Dashboard summary stats ────────────────────────────
app.get('/api/dashboard/stats', (req, res) => {
  const weekStart = req.query.week_start || '2026-07-10';
  const weekEnd = req.query.week_end || '2026-07-10';

  const stats = {};

  // Total operators
  db.get('SELECT COUNT(*) as total FROM operators WHERE is_active = 1', (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    stats.totalOperators = row.total;

    // Total machines
    db.get('SELECT COUNT(*) as total FROM machines', (err, row2) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.totalMachines = row2.total;

      // Total projects
      db.get('SELECT COUNT(*) as total FROM projects WHERE is_active = 1', (err, row3) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.totalProjects = row3.total;

        // Avg performance from production records
        db.get(
          'SELECT AVG(performance_pct) as avgPerf FROM production_records WHERE week_start = ? AND week_end = ?',
          [weekStart, weekEnd],
          (err, row4) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.avgPerformance = row4.avgPerf ? Math.round(row4.avgPerf) : 83;

            // Machine utilization
            db.get(
              'SELECT AVG(utilization_pct) as avgUtil FROM machine_time_reg WHERE week_start = ? AND week_end = ?',
              [weekStart, weekEnd],
              (err, row5) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.machineUtilization = row5.avgUtil ? Math.round(row5.avgUtil) : 71;

                // Plan coverage
                db.get(
                  'SELECT COUNT(*) as total FROM plans WHERE week_start = ?',
                  ['2026-07-14'],
                  (err, row6) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const totalRefs = stats.totalOperators + stats.totalMachines + stats.totalProjects;
                    stats.planCoverage = totalRefs > 0 ? Math.round((row6.total / totalRefs) * 100) : 92;
                    res.json(stats);
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});

// ─── 14. Generate demo data for current week ────────────────
app.post('/api/generate-demo-week', (req, res) => {
  const { week_start, week_end } = req.body;
  if (!week_start || !week_end) {
    return res.status(400).json({ error: 'week_start and week_end required' });
  }

  // Get all operators
  db.all('SELECT operator_id, shop_id FROM operators', (err, ops) => {
    if (err) return res.status(500).json({ error: err.message });

    // Get all projects
    db.all('SELECT project_id FROM projects', (err, projs) => {
      if (err) return res.status(500).json({ error: err.message });

      // Get all machines
      db.all('SELECT machine_id FROM machines', (err, macs) => {
        if (err) return res.status(500).json({ error: err.message });

        // Get all assembly parts
        db.all('SELECT part_id FROM assembly_parts', (err, parts) => {
          if (err) return res.status(500).json({ error: err.message });

          const stmtProd = db.prepare(`
            INSERT INTO production_records (
              operator_id, shop_id, week_start, week_end,
              planned_part, planned_qty, planned_time,
              actual_part, actual_qty, actual_time,
              performance_pct, delay_reason,
              sick_days, permission_days,
              lack_materials, lack_tool_cutter, design_problem,
              machine_breakdown, machine_sequence_issue,
              over_capacity, machine_occupied, own_problem
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const reasons = ['—', 'Sick', 'Material', 'Tool', 'Breakdown', 'Design', 'Permistion'];
          ops.forEach(op => {
            const plannedQty = rand(15, 70);
            const actualQty = rand(10, 65);
            const perf = Math.round((actualQty / plannedQty) * 100);
            const r = reasons[rand(0, reasons.length - 1)];
            stmtProd.run(
              op.operator_id, op.shop_id, week_start, week_end,
              'Part-' + String.fromCharCode(65 + rand(0, 7)), plannedQty, rand(2, 8),
              'Part-' + String.fromCharCode(65 + rand(0, 7)), actualQty, rand(2, 8),
              perf, r === '—' ? null : r,
              r === 'Sick' ? rand(1, 3) : 0,
              r === 'Permistion' ? rand(1, 2) : 0,
              r === 'Material' ? 1 : 0,
              r === 'Tool' ? 1 : 0,
              r === 'Design' ? 1 : 0,
              r === 'Breakdown' ? 1 : 0,
              0, 0, 0, 0
            );
          });
          stmtProd.finalize();

          // Project production
          const stmtProj = db.prepare(`
            INSERT INTO project_production (
              project_id, week_start, week_end,
              planned_qty, planned_time, actual_qty, actual_time,
              performance_pct, upto_date_qty, upto_date_time, overall_perf_pct
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          projs.forEach(p => {
            const planned = rand(20, 90);
            const actual = Math.round(planned * (0.6 + Math.random() * 0.4));
            const perf = Math.round((actual / planned) * 100);
            stmtProj.run(
              p.project_id, week_start, week_end,
              planned, rand(10, 40), actual, rand(8, 35),
              perf, rand(50, 200), `${rand(1, 30)} days`, rand(70, 95)
            );
          });
          stmtProj.finalize();

          // Machine time
          const stmtMac = db.prepare(`
            INSERT INTO machine_time_reg (
              machine_id, week_start, week_end,
              planned_time, actual_time, utilization_pct, remark
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          macs.forEach(m => {
            const planned = rand(20, 70);
            const actual = Math.round(planned * (0.5 + Math.random() * 0.5));
            const util = Math.round((actual / planned) * 100);
            stmtMac.run(m.machine_id, week_start, week_end, planned, actual, util, '');
          });
          stmtMac.finalize();

          // Assembly records
          const stmtAsm = db.prepare(`
            INSERT INTO assembly_records (
              part_id, week_start, week_end,
              assembling_planned, assembling_wip, assembling_completed,
              polishing_planned, polishing_wip, polishing_completed,
              painting_planned, painting_wip, painting_completed,
              upto_date_qty, performance_pct
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          parts.forEach(p => {
            const asm = rand(55, 95);
            const pol = rand(45, 90);
            const pnt = rand(40, 85);
            stmtAsm.run(
              p.part_id, week_start, week_end,
              asm, rand(10, 40), rand(30, 80),
              pol, rand(10, 35), rand(25, 70),
              pnt, rand(10, 30), rand(20, 65),
              rand(10, 50), Math.round((asm + pol + pnt) / 3)
            );
          });
          stmtAsm.finalize();

          res.json({ message: `Demo data generated for ${week_start} - ${week_end}`, count: ops.length });
        });
      });
    });
  });
});

// ─── Serve frontend ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints:`);
  console.log(`   GET  /api/shops`);
  console.log(`   GET  /api/operators`);
  console.log(`   GET  /api/machines`);
  console.log(`   GET  /api/projects`);
  console.log(`   GET  /api/assembly-parts`);
  console.log(`   GET  /api/production-records`);
  console.log(`   POST /api/production-records`);
  console.log(`   GET  /api/project-production`);
  console.log(`   POST /api/project-production`);
  console.log(`   GET  /api/machine-time`);
  console.log(`   POST /api/machine-time`);
  console.log(`   GET  /api/assembly-records`);
  console.log(`   POST /api/assembly-records`);
  console.log(`   GET  /api/issues`);
  console.log(`   POST /api/issues`);
  console.log(`   GET  /api/plans`);
  console.log(`   POST /api/plans`);
  console.log(`   GET  /api/dashboard/stats`);
  console.log(`   POST /api/generate-demo-week`);
});
