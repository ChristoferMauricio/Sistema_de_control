-- Create the Comentario text column for the tickets table
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS comentario TEXT;
