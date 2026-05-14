-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Nombres (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  Nombre text,
  Programador text,
  CONSTRAINT Nombres_pkey PRIMARY KEY (id)
);
CREATE TABLE public.equipo_desarrollo (
  id integer NOT NULL DEFAULT nextval('equipo_desarrollo_id_seq'::regclass),
  rol text NOT NULL,
  nombre text NOT NULL,
  nombre_clave text,
  correo_pgim text,
  correo_gcorp text,
  CONSTRAINT equipo_desarrollo_pkey PRIMARY KEY (id)
);
CREATE TABLE public.gsm (
  id integer NOT NULL DEFAULT nextval('gsm_id_seq'::regclass),
  nombre text NOT NULL,
  modalidad text NOT NULL,
  cargo text NOT NULL,
  correo text NOT NULL,
  CONSTRAINT gsm_pkey PRIMARY KEY (id)
);
CREATE TABLE public.jira_persons (
  email text NOT NULL,
  display_name text NOT NULL,
  CONSTRAINT jira_persons_pkey PRIMARY KEY (email)
);
CREATE TABLE public.jira_ticket_links (
  source_key text NOT NULL,
  target_key text NOT NULL,
  link_type text,
  CONSTRAINT jira_ticket_links_pkey PRIMARY KEY (source_key, target_key),
  CONSTRAINT jira_ticket_links_source_key_fkey FOREIGN KEY (source_key) REFERENCES public.jira_tickets(jira_key)
);
CREATE TABLE public.jira_ticket_status_history (
  id integer NOT NULL DEFAULT nextval('jira_ticket_status_history_id_seq'::regclass),
  jira_key text NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT jira_ticket_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT fk_history_ticket FOREIGN KEY (jira_key) REFERENCES public.jira_tickets(jira_key)
);
CREATE TABLE public.jira_ticket_subtasks (
  parent_key text NOT NULL,
  child_key text NOT NULL,
  CONSTRAINT jira_ticket_subtasks_pkey PRIMARY KEY (parent_key, child_key),
  CONSTRAINT jira_ticket_subtasks_parent_key_fkey FOREIGN KEY (parent_key) REFERENCES public.jira_tickets(jira_key)
);
CREATE TABLE public.jira_tickets (
  id integer NOT NULL DEFAULT nextval('jira_tickets_id_seq'::regclass),
  jira_key text NOT NULL UNIQUE,
  summary text,
  status text,
  assignee_email text,
  priority text,
  issue_type text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  synced_at timestamp with time zone DEFAULT now(),
  sprint text,
  story_points numeric,
  reporter_email text,
  parent_key text,
  comentario text,
  description text,
  linked_keys jsonb DEFAULT '[]'::jsonb,
  labels ARRAY,
  deleted_at timestamp with time zone,
  fecha_inicio date,
  fecha_solucion date,
  CONSTRAINT jira_tickets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.observaciones (
  id integer NOT NULL DEFAULT nextval('observaciones_id_seq'::regclass),
  sprint text,
  modulo text,
  submodulo text,
  descripcion text,
  obs_word_link text,
  ambiente text,
  quien_detecto text,
  fecha_registro date DEFAULT CURRENT_DATE,
  quien_corrigio text,
  estado text DEFAULT 'Registro'::text,
  fecha_modificacion date,
  observacion_final text,
  solucion_word_link text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT observaciones_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reuniones (
  id integer NOT NULL DEFAULT nextval('reuniones_id_seq'::regclass),
  sprint text,
  tipo text NOT NULL DEFAULT 'Reunión Interna'::text,
  modulo text,
  tema text,
  estado text NOT NULL DEFAULT '1.Tentativa'::text,
  fechas_propuestas jsonb DEFAULT '[]'::jsonb,
  fecha_programada text,
  presentes jsonb DEFAULT '[]'::jsonb,
  prioridad text DEFAULT '2.Media'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reuniones_pkey PRIMARY KEY (id)
);
CREATE TABLE public.team_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_roles_pkey PRIMARY KEY (id),
  CONSTRAINT team_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);