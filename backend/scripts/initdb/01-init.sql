-- HCM202 Database Initialization
-- This script sets up basic database configuration and extensions

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search improvements

-- Create database user if not exists (handled by docker environment)
-- The user and database are created by PostgreSQL Docker image using environment variables

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'HCM202 database initialization completed at %', NOW();
END $$;
