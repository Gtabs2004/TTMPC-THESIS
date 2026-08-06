-- Salary Schedule (per team spec: SALARY_SCHEDULE)
--
-- Tracks payroll release dates for each employer agency serving TTMPC members
-- so the Treasurer can log when payroll actually landed vs. expected. Downstream
-- this drives:
--   1. Late-payment detection with grace period (when payroll is late)
--   2. Delay statistics for the Treasurer Schedule page
--   3. Read-only status for Cashiers
--
-- Team schema:
--   ScheduleID   uuid PK
--   ExpectedDate date
--   ReleaseDate  date
--   IsDelayed    boolean  (used for delinquency fairness / penalty application)
--   Agency       categorical (NGA, LGU, SUC, PI, NGO, Cooperative)
--
-- Physical implementation uses snake_case to match the rest of the DB and to
-- keep Supabase's auto-generated REST endpoints usable without quoted idents.
-- Extra operational columns (cycle_year/month/half, notes, audit) stay so the
-- calendar seeder can populate rows deterministically.

CREATE TABLE IF NOT EXISTS salary_schedule (
  schedule_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency          TEXT NOT NULL CHECK (agency IN ('NGA','LGU','SUC','PI','NGO','Cooperative')),
  cycle_year      INT NOT NULL,
  cycle_month     INT NOT NULL CHECK (cycle_month BETWEEN 1 AND 12),
  cycle_half      INT NOT NULL CHECK (cycle_half IN (1, 2)),
  expected_date   DATE NOT NULL,
  release_date    DATE NULL,
  is_delayed      BOOLEAN GENERATED ALWAYS AS (
    release_date IS NOT NULL AND release_date > expected_date
  ) STORED,
  notes           TEXT NULL,
  recorded_by     UUID NULL,
  recorded_at     TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agency, cycle_year, cycle_month, cycle_half)
);

CREATE INDEX IF NOT EXISTS idx_salary_schedule_expected
  ON salary_schedule (expected_date);

CREATE INDEX IF NOT EXISTS idx_salary_schedule_release
  ON salary_schedule (release_date)
  WHERE release_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salary_schedule_agency
  ON salary_schedule (agency);

-- Convenience view: only cycles that have been logged.
-- Derived delay_days lets downstream code skip recomputing it.
CREATE OR REPLACE VIEW salary_schedule_logged_v AS
SELECT
  schedule_id,
  agency,
  cycle_year,
  cycle_month,
  cycle_half,
  expected_date,
  release_date,
  (release_date - expected_date) AS delay_days,
  is_delayed,
  CASE
    WHEN release_date <= expected_date THEN 'on_time'
    ELSE 'late'
  END AS status,
  notes,
  recorded_by,
  recorded_at
FROM salary_schedule
WHERE release_date IS NOT NULL;

-- Rolling stats view: last 6 logged cycles per agency.
-- Drives the "Late Cycles: N of last M" KPI. Frontend filters by agency.
CREATE OR REPLACE VIEW salary_schedule_delay_stats_v AS
WITH ranked AS (
  SELECT
    v.*,
    ROW_NUMBER() OVER (PARTITION BY agency ORDER BY expected_date DESC) AS rn
  FROM salary_schedule_logged_v v
),
last_six AS (
  SELECT * FROM ranked WHERE rn <= 6
)
SELECT
  agency,
  COUNT(*)                                                       AS sample_size,
  COUNT(*) FILTER (WHERE status = 'late')                        AS late_count,
  COALESCE(AVG(delay_days) FILTER (WHERE status = 'late'), 0)    AS avg_delay_when_late,
  COALESCE(MAX(delay_days), 0)                                   AS max_delay
FROM last_six
GROUP BY agency;
