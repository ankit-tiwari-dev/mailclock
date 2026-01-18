-- Delete all data from PostgreSQL database
-- This will remove all records from the EmailJob and User tables

-- First, delete from EmailJob (has foreign key to User)
TRUNCATE TABLE "EmailJob" CASCADE;

-- Then, delete from User
TRUNCATE TABLE "User" CASCADE;

-- Alternative if you want to DELETE instead of TRUNCATE:
-- DELETE FROM "EmailJob";
-- DELETE FROM "User";

-- Reset the sequences (if using serial/auto-increment, not needed for UUID)
-- Not needed in this case since you're using UUIDs
