-- 學生母檔 (對應你的 student.csv)
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,          -- 學號
    rfid_tag TEXT UNIQUE,         -- 實體卡片 UID
    name TEXT NOT NULL,           -- 姓名
    class_info TEXT NOT NULL,     -- 班級座號 (例如: 101-05)
    seat_number INTEGER,          -- 預設/當日座位編號
    deposit_eligible BOOLEAN DEFAULT TRUE -- 保證金資格
);

-- 每日考勤狀態實例 (對應你的 YYYYMMDD.csv)
CREATE TABLE IF NOT EXISTS daily_status (
    date TEXT NOT NULL,           -- 格式: YYYYMMDD
    student_id TEXT NOT NULL,
    status TEXT NOT NULL,         -- expected, present, temp_leave, late, absent, leave_approved
    arrival_time DATETIME,        -- 首次簽到時間
    notes TEXT,                   -- 教師手動修改的備註 (非明顯錯誤除錯用)
    PRIMARY KEY (date, student_id)
);

-- 刷卡動態紀錄牆 (用於右側面板顯示與歷史查閱)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    action_type TEXT NOT NULL,    -- ENTRY(簽到), LEAVE_TEMP(暫離), RETURN_TEMP(返回), ADMIN_FIX(管理員修正)
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);