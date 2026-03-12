-- Create the Comentario text column for the jira_tickets table
ALTER TABLE public.jira_tickets ADD COLUMN IF NOT EXISTS comentario TEXT;
