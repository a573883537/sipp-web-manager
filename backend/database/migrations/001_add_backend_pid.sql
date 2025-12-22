-- Migration: Add backend_pid column for orphan process detection
-- Date: 2025-12-22

USE sipp_manager;

-- Add backend_pid column if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'task_history';
SET @columnname = 'backend_pid';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1', -- Column exists, do nothing
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT DEFAULT NULL COMMENT "Backend process PID (for orphan detection)" AFTER control_port')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add index on backend_pid if it doesn't exist
SET @indexname = 'idx_task_backend_pid';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (index_name = @indexname)
  ) > 0,
  'SELECT 1', -- Index exists, do nothing
  CONCAT('CREATE INDEX ', @indexname, ' ON ', @tablename, ' (backend_pid)')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SELECT 'Migration completed: added backend_pid column and index' AS status;
