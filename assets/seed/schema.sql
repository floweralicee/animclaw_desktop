-- OpenClaw workspace seed schema + sample data
-- Used to pre-build workspace.duckdb for new workspace onboarding.

-- ── nanoid32 macro ──
CREATE OR REPLACE MACRO nanoid32() AS (
  SELECT string_agg(
    substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-',
      (floor(random() * 64) + 1)::int, 1), '')
  FROM generate_series(1, 32)
);

-- ── Core tables ──

CREATE TABLE IF NOT EXISTS objects (
  id VARCHAR PRIMARY KEY DEFAULT (gen_random_uuid()::VARCHAR),
  name VARCHAR NOT NULL,
  description VARCHAR,
  icon VARCHAR,
  default_view VARCHAR DEFAULT 'table',
  parent_document_id VARCHAR,
  sort_order INTEGER DEFAULT 0,
  source_app VARCHAR,
  immutable BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS fields (
  id VARCHAR PRIMARY KEY DEFAULT (gen_random_uuid()::VARCHAR),
  object_id VARCHAR NOT NULL REFERENCES objects(id),
  name VARCHAR NOT NULL,
  description VARCHAR,
  type VARCHAR NOT NULL,
  required BOOLEAN DEFAULT false,
  default_value VARCHAR,
  related_object_id VARCHAR REFERENCES objects(id),
  relationship_type VARCHAR,
  enum_values JSON,
  enum_colors JSON,
  enum_multiple BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(object_id, name)
);

CREATE TABLE IF NOT EXISTS entries (
  id VARCHAR PRIMARY KEY DEFAULT (gen_random_uuid()::VARCHAR),
  object_id VARCHAR NOT NULL REFERENCES objects(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entry_fields (
  id VARCHAR PRIMARY KEY DEFAULT (gen_random_uuid()::VARCHAR),
  entry_id VARCHAR NOT NULL REFERENCES entries(id),
  field_id VARCHAR NOT NULL REFERENCES fields(id),
  value VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, field_id)
);

CREATE TABLE IF NOT EXISTS statuses (
  id VARCHAR PRIMARY KEY DEFAULT (gen_random_uuid()::VARCHAR),
  object_id VARCHAR NOT NULL REFERENCES objects(id),
  name VARCHAR NOT NULL,
  color VARCHAR DEFAULT '#94a3b8',
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(object_id, name)
);

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR PRIMARY KEY DEFAULT (gen_random_uuid()::VARCHAR),
  title VARCHAR DEFAULT 'Untitled',
  icon VARCHAR,
  cover_image VARCHAR,
  file_path VARCHAR NOT NULL UNIQUE,
  parent_id VARCHAR REFERENCES documents(id),
  parent_object_id VARCHAR REFERENCES objects(id),
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Seed: people ──

INSERT INTO objects (id, name, description, icon, default_view, immutable, sort_order)
VALUES ('seed_obj_people_00000000000000', 'people', 'Contact management', 'users', 'table', true, 0);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_people_fullname_000000', 'seed_obj_people_00000000000000', 'Full Name', 'text', true, 0),
  ('seed_fld_people_email_000000000', 'seed_obj_people_00000000000000', 'Email Address', 'email', true, 1),
  ('seed_fld_people_phone_000000000', 'seed_obj_people_00000000000000', 'Phone Number', 'phone', false, 2),
  ('seed_fld_people_company_0000000', 'seed_obj_people_00000000000000', 'Company', 'text', false, 3);

INSERT INTO fields (id, object_id, name, type, required, enum_values, enum_colors, sort_order) VALUES
  ('seed_fld_people_status_00000000', 'seed_obj_people_00000000000000', 'Status', 'enum', false,
   '["Active","Inactive","Lead"]'::JSON, '["#22c55e","#94a3b8","#3b82f6"]'::JSON, 4);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_people_notes_000000000', 'seed_obj_people_00000000000000', 'Notes', 'richtext', false, 5);

INSERT INTO entries (id, object_id) VALUES
  ('seed_ent_people_sarah_000000000', 'seed_obj_people_00000000000000'),
  ('seed_ent_people_james_000000000', 'seed_obj_people_00000000000000'),
  ('seed_ent_people_maria_000000000', 'seed_obj_people_00000000000000'),
  ('seed_ent_people_alex_0000000000', 'seed_obj_people_00000000000000'),
  ('seed_ent_people_priya_000000000', 'seed_obj_people_00000000000000');

INSERT INTO entry_fields (entry_id, field_id, value) VALUES
  ('seed_ent_people_sarah_000000000', 'seed_fld_people_fullname_000000', 'Sarah Chen'),
  ('seed_ent_people_sarah_000000000', 'seed_fld_people_email_000000000', 'sarah@acmecorp.com'),
  ('seed_ent_people_sarah_000000000', 'seed_fld_people_phone_000000000', '+1 (555) 234-5678'),
  ('seed_ent_people_sarah_000000000', 'seed_fld_people_company_0000000', 'Acme Corp'),
  ('seed_ent_people_sarah_000000000', 'seed_fld_people_status_00000000', 'Active'),
  ('seed_ent_people_james_000000000', 'seed_fld_people_fullname_000000', 'James Wilson'),
  ('seed_ent_people_james_000000000', 'seed_fld_people_email_000000000', 'james@techcorp.io'),
  ('seed_ent_people_james_000000000', 'seed_fld_people_phone_000000000', '+1 (555) 876-5432'),
  ('seed_ent_people_james_000000000', 'seed_fld_people_company_0000000', 'TechCorp Industries'),
  ('seed_ent_people_james_000000000', 'seed_fld_people_status_00000000', 'Active'),
  ('seed_ent_people_maria_000000000', 'seed_fld_people_fullname_000000', 'Maria Garcia'),
  ('seed_ent_people_maria_000000000', 'seed_fld_people_email_000000000', 'maria@innovate.co'),
  ('seed_ent_people_maria_000000000', 'seed_fld_people_phone_000000000', '+1 (555) 345-6789'),
  ('seed_ent_people_maria_000000000', 'seed_fld_people_company_0000000', 'Innovate Co'),
  ('seed_ent_people_maria_000000000', 'seed_fld_people_status_00000000', 'Lead'),
  ('seed_ent_people_alex_0000000000', 'seed_fld_people_fullname_000000', 'Alex Thompson'),
  ('seed_ent_people_alex_0000000000', 'seed_fld_people_email_000000000', 'alex@designstudio.io'),
  ('seed_ent_people_alex_0000000000', 'seed_fld_people_phone_000000000', '+1 (555) 567-8901'),
  ('seed_ent_people_alex_0000000000', 'seed_fld_people_company_0000000', 'Design Studio'),
  ('seed_ent_people_alex_0000000000', 'seed_fld_people_status_00000000', 'Active'),
  ('seed_ent_people_priya_000000000', 'seed_fld_people_fullname_000000', 'Priya Patel'),
  ('seed_ent_people_priya_000000000', 'seed_fld_people_email_000000000', 'priya@cloudnine.dev'),
  ('seed_ent_people_priya_000000000', 'seed_fld_people_phone_000000000', '+1 (555) 789-0123'),
  ('seed_ent_people_priya_000000000', 'seed_fld_people_company_0000000', 'CloudNine'),
  ('seed_ent_people_priya_000000000', 'seed_fld_people_status_00000000', 'Lead');

CREATE OR REPLACE VIEW v_people AS
PIVOT (
  SELECT e.id as entry_id, e.created_at, e.updated_at,
         f.name as field_name, ef.value
  FROM entries e
  JOIN entry_fields ef ON ef.entry_id = e.id
  JOIN fields f ON f.id = ef.field_id
  WHERE e.object_id = 'seed_obj_people_00000000000000'
) ON field_name IN ('Full Name', 'Email Address', 'Phone Number', 'Company', 'Status', 'Notes') USING first(value);

-- ── Seed: company ──

INSERT INTO objects (id, name, description, icon, default_view, immutable, sort_order)
VALUES ('seed_obj_company_0000000000000', 'company', 'Company tracking', 'building-2', 'table', true, 1);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_company_name_000000000', 'seed_obj_company_0000000000000', 'Company Name', 'text', true, 0);

INSERT INTO fields (id, object_id, name, type, required, enum_values, enum_colors, sort_order) VALUES
  ('seed_fld_company_industry_00000', 'seed_obj_company_0000000000000', 'Industry', 'enum', false,
   '["Technology","Finance","Healthcare","Education","Retail","Other"]'::JSON,
   '["#3b82f6","#22c55e","#ef4444","#f59e0b","#8b5cf6","#94a3b8"]'::JSON, 1);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_company_website_000000', 'seed_obj_company_0000000000000', 'Website', 'text', false, 2);

INSERT INTO fields (id, object_id, name, type, required, enum_values, enum_colors, sort_order) VALUES
  ('seed_fld_company_type_000000000', 'seed_obj_company_0000000000000', 'Type', 'enum', false,
   '["Client","Partner","Vendor","Prospect"]'::JSON,
   '["#22c55e","#3b82f6","#f59e0b","#94a3b8"]'::JSON, 3);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_company_notes_00000000', 'seed_obj_company_0000000000000', 'Notes', 'richtext', false, 4);

INSERT INTO entries (id, object_id) VALUES
  ('seed_ent_company_acme_000000000', 'seed_obj_company_0000000000000'),
  ('seed_ent_company_tech_000000000', 'seed_obj_company_0000000000000'),
  ('seed_ent_company_innov_00000000', 'seed_obj_company_0000000000000');

INSERT INTO entry_fields (entry_id, field_id, value) VALUES
  ('seed_ent_company_acme_000000000', 'seed_fld_company_name_000000000', 'Acme Corp'),
  ('seed_ent_company_acme_000000000', 'seed_fld_company_industry_00000', 'Technology'),
  ('seed_ent_company_acme_000000000', 'seed_fld_company_website_000000', 'https://acmecorp.com'),
  ('seed_ent_company_acme_000000000', 'seed_fld_company_type_000000000', 'Client'),
  ('seed_ent_company_tech_000000000', 'seed_fld_company_name_000000000', 'TechCorp Industries'),
  ('seed_ent_company_tech_000000000', 'seed_fld_company_industry_00000', 'Finance'),
  ('seed_ent_company_tech_000000000', 'seed_fld_company_website_000000', 'https://techcorp.io'),
  ('seed_ent_company_tech_000000000', 'seed_fld_company_type_000000000', 'Partner'),
  ('seed_ent_company_innov_00000000', 'seed_fld_company_name_000000000', 'Innovate Co'),
  ('seed_ent_company_innov_00000000', 'seed_fld_company_industry_00000', 'Healthcare'),
  ('seed_ent_company_innov_00000000', 'seed_fld_company_website_000000', 'https://innovate.co'),
  ('seed_ent_company_innov_00000000', 'seed_fld_company_type_000000000', 'Prospect');

CREATE OR REPLACE VIEW v_company AS
PIVOT (
  SELECT e.id as entry_id, e.created_at, e.updated_at,
         f.name as field_name, ef.value
  FROM entries e
  JOIN entry_fields ef ON ef.entry_id = e.id
  JOIN fields f ON f.id = ef.field_id
  WHERE e.object_id = 'seed_obj_company_0000000000000'
) ON field_name IN ('Company Name', 'Industry', 'Website', 'Type', 'Notes') USING first(value);

-- ── Seed: task ──

INSERT INTO objects (id, name, description, icon, default_view, sort_order)
VALUES ('seed_obj_task_000000000000000', 'task', 'AI animation production tasks', 'camera', 'kanban', 2);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_task_title_00000000000', 'seed_obj_task_000000000000000', 'Title', 'text', true, 0),
  ('seed_fld_task_desc_000000000000', 'seed_obj_task_000000000000000', 'Description', 'text', false, 1);

INSERT INTO fields (id, object_id, name, type, required, enum_values, enum_colors, sort_order) VALUES
  ('seed_fld_task_status_0000000000', 'seed_obj_task_000000000000000', 'Status', 'enum', false,
   '["Backlog","In Progress","Review","Done"]'::JSON,
   '["#64748b","#3b82f6","#8b5cf6","#22c55e"]'::JSON, 2),
  ('seed_fld_task_priority_00000000', 'seed_obj_task_000000000000000', 'Priority', 'enum', false,
   '["Low","Medium","High","Critical"]'::JSON,
   '["#94a3b8","#f59e0b","#ef4444","#dc2626"]'::JSON, 3),
  ('seed_fld_task_phase_000000000', 'seed_obj_task_000000000000000', 'Phase', 'enum', false,
   '["Pre-Production","Production","Post-Production"]'::JSON,
   '["#06b6d4","#6366f1","#f59e0b"]'::JSON, 4),
  ('seed_fld_task_category_000000', 'seed_obj_task_000000000000000', 'Category', 'enum', false,
   '["Script","Character Design","Environment","Shot Generation","Audio","Animation","Compositing","Delivery"]'::JSON,
   '["#3b82f6","#8b5cf6","#22c55e","#f59e0b","#06b6d4","#ef4444","#ec4899","#94a3b8"]'::JSON, 5),
  ('seed_fld_task_aitool_00000000', 'seed_obj_task_000000000000000', 'AI Tool', 'enum', false,
   '["Midjourney","Stable Diffusion","Runway","Pika","Sora","ElevenLabs","ComfyUI","DaVinci Resolve","Other"]'::JSON,
   '["#f59e0b","#8b5cf6","#22c55e","#3b82f6","#06b6d4","#ec4899","#ef4444","#6366f1","#94a3b8"]'::JSON, 6);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_task_duedate_000000000', 'seed_obj_task_000000000000000', 'Due Date', 'date', false, 7),
  ('seed_fld_task_notes_00000000000', 'seed_obj_task_000000000000000', 'Notes', 'richtext', false, 8),
  ('seed_fld_task_shot_ref_000000', 'seed_obj_task_000000000000000', 'Linked Shot', 'text', false, 9),
  ('seed_fld_task_chars_ref_00000', 'seed_obj_task_000000000000000', 'Characters', 'tags', false, 10);

INSERT INTO statuses (id, object_id, name, color, sort_order, is_default) VALUES
  ('seed_sts_task_backlog_0000000', 'seed_obj_task_000000000000000', 'Backlog',      '#64748b', 0, true),
  ('seed_sts_task_inprog_00000000', 'seed_obj_task_000000000000000', 'In Progress',  '#3b82f6', 1, false),
  ('seed_sts_task_review_00000000', 'seed_obj_task_000000000000000', 'Review',       '#8b5cf6', 2, false),
  ('seed_sts_task_done_000000000x', 'seed_obj_task_000000000000000', 'Done',         '#22c55e', 3, false);

INSERT INTO entries (id, object_id) VALUES
  ('seed_ent_task_breakdown_00000', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_style_newsreel0', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_carl_concept_00', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_ellie_concept_0', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_dug_concept_000', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_russell_conc_00', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_muntz_kevin_000', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_theatre_env_000', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_house_env_00000', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_paradise_falls0', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_balloon_lift_00', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_montage_prompt0', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_storyboard_ac10', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_voice_casting_0', 'seed_obj_task_000000000000000'),
  ('seed_ent_task_color_palette_0', 'seed_obj_task_000000000000000');

INSERT INTO entry_fields (entry_id, field_id, value) VALUES
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_title_00000000000', 'Script breakdown — Act I'),
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_desc_000000000000', 'Break down scenes 1–37 from up.md into individual shot requirements, character appearances, and environment needs. Cross-reference shot list (shots 001–014).'),
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_status_0000000000', 'In Progress'),
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_category_000000', 'Script'),
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_shot_ref_000000', '001–014'),
  ('seed_ent_task_breakdown_00000', 'seed_fld_task_chars_ref_00000', '["Carl Fredricksen","Ellie","Young Carl","Young Ellie"]'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_title_00000000000', 'Newsreel visual style preset'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_desc_000000000000', 'Build a Midjourney style preset for the 1930s newsreel opening. Grainy, high-contrast black-and-white, vignette, scratches on film. Reference: scene 1, shot 001.'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_status_0000000000', 'Done'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_category_000000', 'Shot Generation'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_shot_ref_000000', '001, 002'),
  ('seed_ent_task_style_newsreel0', 'seed_fld_task_chars_ref_00000', '["Charles F. Muntz","Young Carl"]'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_title_00000000000', 'Carl Fredricksen — character concept'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_desc_000000000000', 'AI-generate full-body reference sheet for elderly Carl (78): grey suit, square jaw, thick glasses, grape soda pin, tennis-ball cane. Reference charactersheet.md. Try 4-panel turnaround.'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_status_0000000000', 'Done'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_category_000000', 'Character Design'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_carl_concept_00', 'seed_fld_task_chars_ref_00000', '["Carl Fredricksen"]'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_title_00000000000', 'Ellie — character concept (young & old)'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_desc_000000000000', 'Two versions: Young Ellie (8yo — red frizzy hair, overalls, flight helmet) and Adult Ellie (zookeeper uniform). Side-by-side reference. See charactersheet.md.'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_status_0000000000', 'In Progress'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_category_000000', 'Character Design'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_ellie_concept_0', 'seed_fld_task_chars_ref_00000', '["Ellie","Young Ellie"]'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_title_00000000000', 'Dug — character concept'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_desc_000000000000', 'Golden retriever with high-tech translating collar. Friendly expression, slightly goofy. Include close-up of collar detail. Reference charactersheet.md.'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_status_0000000000', 'In Progress'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_priority_00000000', 'Medium'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_category_000000', 'Character Design'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_dug_concept_000', 'seed_fld_task_chars_ref_00000', '["Dug"]'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_title_00000000000', 'Russell — character concept'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_desc_000000000000', 'Asian-American boy, 8yo, in full Wilderness Explorer uniform: neckerchief, sash full of badges, enormous backpack. Enthusiastic posture. See charactersheet.md.'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_priority_00000000', 'Medium'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_category_000000', 'Character Design'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_russell_conc_00', 'seed_fld_task_chars_ref_00000', '["Russell"]'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_title_00000000000', 'Muntz & Kevin — character concepts'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_desc_000000000000', 'Muntz: tall, dashing, 1930s explorer attire, aged into villain. Kevin: 13-ft iridescent flightless bird, brilliant feathers, long flexible neck. Separate reference sheets. See charactersheet.md.'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_priority_00000000', 'Medium'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_category_000000', 'Character Design'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_muntz_kevin_000', 'seed_fld_task_chars_ref_00000', '["Charles F. Muntz","Kevin"]'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_title_00000000000', '1930s movie theatre interior'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_desc_000000000000', 'Packed small-town cinema, silver screen glowing, rows of seats, warm amber light. Shots 001 (Establishing) and 002 (Close-Up). Two camera angles needed.'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_status_0000000000', 'In Progress'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_phase_000000000', 'Production'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_category_000000', 'Environment'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_shot_ref_000000', '001, 002'),
  ('seed_ent_task_theatre_env_000', 'seed_fld_task_chars_ref_00000', '["Young Carl"]'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_title_00000000000', 'Carl & Ellie''s house — interior environments'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_desc_000000000000', 'Living room (adventure shrine, two chairs, paradise falls mural), front hall, kitchen, bedroom. Multiple era variants: 1940s wedding → 1970s → present. Must feel like "your grandparents'' house smelled."'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_phase_000000000', 'Production'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_category_000000', 'Environment'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_shot_ref_000000', '007, 010, 013, 015'),
  ('seed_ent_task_house_env_00000', 'seed_fld_task_chars_ref_00000', '["Carl Fredricksen","Ellie"]'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_title_00000000000', 'Paradise Falls — establishing shot'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_desc_000000000000', 'Majestic waterfall down a flat-topped tepui mountain. Dense South American jungle. Mist at the base. Must feel fantastic but plausible (reference real tepuis of Venezuela). Shot 020 — EXT / Day.'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_phase_000000000', 'Production'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_category_000000', 'Environment'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_aitool_00000000', 'Stable Diffusion'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_shot_ref_000000', '020'),
  ('seed_ent_task_paradise_falls0', 'seed_fld_task_chars_ref_00000', '[]'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_title_00000000000', 'House liftoff — balloon sequence (hero shot)'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_desc_000000000000', 'THE hero shot. Thousands of colorful balloons bursting from roof at dawn, house lifting off above the city. Shots 018 (wide) + 019 (floating above town). Balloon physics via Runway after Midjourney base image.'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_priority_00000000', 'Critical'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_phase_000000000', 'Production'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_category_000000', 'Animation'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_aitool_00000000', 'Runway'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_shot_ref_000000', '018, 019'),
  ('seed_ent_task_balloon_lift_00', 'seed_fld_task_chars_ref_00000', '["Carl Fredricksen","Russell"]'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_title_00000000000', 'Married Life montage — prompt library'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_desc_000000000000', 'Complete prompt library for the 28-scene wordless montage (scenes 10–37, up.md). Per scene: description, era, lighting, mood, color palette. Wedding → baby room → doctor → paradise falls jar → aging → death.'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_priority_00000000', 'Critical'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_phase_000000000', 'Production'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_category_000000', 'Shot Generation'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_aitool_00000000', 'Midjourney'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_shot_ref_000000', '008–014'),
  ('seed_ent_task_montage_prompt0', 'seed_fld_task_chars_ref_00000', '["Carl Fredricksen","Ellie"]'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_title_00000000000', 'Storyboard — Act I (shots 001–014)'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_desc_000000000000', 'AI-assisted storyboard panels for all 14 Complete-status shots. ComfyUI for consistent sketch style. Output: 16:9 panels with shot number + scene reference overlay.'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_status_0000000000', 'In Progress'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_priority_00000000', 'High'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_category_000000', 'Shot Generation'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_aitool_00000000', 'ComfyUI'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_shot_ref_000000', '001–014'),
  ('seed_ent_task_storyboard_ac10', 'seed_fld_task_chars_ref_00000', '["Carl Fredricksen","Ellie","Young Carl","Young Ellie"]'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_title_00000000000', 'AI voice casting — all characters'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_desc_000000000000', 'Test ElevenLabs profiles for Carl (gravelly, elderly), Russell (chipper 8yo), Dug (enthusiastic, simple), Muntz (theatrical, 1930s radio). Record sample dialogue lines from up.md.'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_priority_00000000', 'Medium'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_category_000000', 'Audio'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_aitool_00000000', 'ElevenLabs'),
  ('seed_ent_task_voice_casting_0', 'seed_fld_task_chars_ref_00000', '["Carl Fredricksen","Russell","Dug","Charles F. Muntz"]'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_title_00000000000', 'Era color palettes — production bible'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_desc_000000000000', 'Color palettes per era: 1930s (desaturated, sepia-adjacent), 1940s–70s montage (warm mid-century), present day (cooler, lonelier), South America (vivid, oversaturated). Each: 6 hex values + mood word.'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_status_0000000000', 'Backlog'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_priority_00000000', 'Medium'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_phase_000000000', 'Pre-Production'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_category_000000', 'Script'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_aitool_00000000', 'Other'),
  ('seed_ent_task_color_palette_0', 'seed_fld_task_chars_ref_00000', '[]');

CREATE OR REPLACE VIEW v_task AS
PIVOT (
  SELECT e.id as entry_id, e.created_at, e.updated_at,
         f.name as field_name, ef.value
  FROM entries e
  JOIN entry_fields ef ON ef.entry_id = e.id
  JOIN fields f ON f.id = ef.field_id
  WHERE e.object_id = 'seed_obj_task_000000000000000'
) ON field_name IN (
  'Title','Description','Status','Priority',
  'Phase','Category','AI Tool','Linked Shot','Characters',
  'Due Date','Notes'
) USING first(value);

-- ── Seed: script ──

INSERT INTO objects (id, name, description, icon, default_view, sort_order)
VALUES ('seed_obj_script_000000000000000', 'script', 'Script library', 'file-text', 'table', 3);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_script_title_000000000', 'seed_obj_script_000000000000000', 'Title', 'text', true, 0),
  ('seed_fld_script_writer_00000000', 'seed_obj_script_000000000000000', 'Writer', 'text', false, 1);

INSERT INTO fields (id, object_id, name, type, required, enum_values, enum_colors, sort_order) VALUES
  ('seed_fld_script_genre_000000000', 'seed_obj_script_000000000000000', 'Genre', 'enum', false,
   '["Animation","Drama","Comedy","Horror","Thriller","Sci-Fi","Documentary","Other"]'::JSON,
   '["#6366f1","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#22c55e","#94a3b8"]'::JSON, 2),
  ('seed_fld_script_status_00000000', 'seed_obj_script_000000000000000', 'Status', 'enum', false,
   '["Development","Pre-Production","Production","Post-Production","Completed","Archived"]'::JSON,
   '["#94a3b8","#f59e0b","#3b82f6","#8b5cf6","#22c55e","#64748b"]'::JSON, 3),
  ('seed_fld_script_format_00000000', 'seed_obj_script_000000000000000', 'Format', 'enum', false,
   '["Feature Film","Short Film","TV Episode","Web Series","Documentary","Other"]'::JSON,
   '["#3b82f6","#06b6d4","#f59e0b","#22c55e","#8b5cf6","#94a3b8"]'::JSON, 4);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_script_pages_000000000', 'seed_obj_script_000000000000000', 'Pages', 'number', false, 5),
  ('seed_fld_script_notes_000000000', 'seed_obj_script_000000000000000', 'Notes', 'richtext', false, 6);

INSERT INTO entries (id, object_id) VALUES
  ('seed_ent_script_up_0000000000000', 'seed_obj_script_000000000000000');

INSERT INTO entry_fields (entry_id, field_id, value) VALUES
  ('seed_ent_script_up_0000000000000', 'seed_fld_script_title_000000000', 'Up'),
  ('seed_ent_script_up_0000000000000', 'seed_fld_script_writer_00000000', 'Pete Docter & Bob Peterson'),
  ('seed_ent_script_up_0000000000000', 'seed_fld_script_genre_000000000', 'Animation'),
  ('seed_ent_script_up_0000000000000', 'seed_fld_script_status_00000000', 'Production'),
  ('seed_ent_script_up_0000000000000', 'seed_fld_script_format_00000000', 'Feature Film'),
  ('seed_ent_script_up_0000000000000', 'seed_fld_script_pages_000000000', '109'),
  ('seed_ent_script_up_0000000000000', 'seed_fld_script_notes_000000000', 'Pixar / Walt Disney Pictures. 2009 Academy Award winner for Best Animated Feature and Best Original Score.');

INSERT INTO documents (id, title, icon, file_path, parent_object_id, sort_order)
VALUES ('seed_doc_up_script_000000000000', 'Up — Script', 'file-text', 'script/up.md',
        'seed_obj_script_000000000000000', 0);

CREATE OR REPLACE VIEW v_script AS
PIVOT (
  SELECT e.id as entry_id, e.created_at, e.updated_at,
         f.name as field_name, ef.value
  FROM entries e
  JOIN entry_fields ef ON ef.entry_id = e.id
  JOIN fields f ON f.id = ef.field_id
  WHERE e.object_id = 'seed_obj_script_000000000000000'
) ON field_name IN ('Title', 'Writer', 'Genre', 'Status', 'Format', 'Pages', 'Notes') USING first(value);

-- ── Seed: shot ──

INSERT INTO objects (id, name, description, icon, default_view, sort_order)
VALUES ('seed_obj_shot_0000000000000000', 'shot', 'Shot list', 'camera', 'table', 4);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_shot_shotnum_000000000', 'seed_obj_shot_0000000000000000', 'Shot #', 'text', true, 0),
  ('seed_fld_shot_scenenum_00000000', 'seed_obj_shot_0000000000000000', 'Scene #', 'text', false, 1),
  ('seed_fld_shot_location_00000000', 'seed_obj_shot_0000000000000000', 'Location', 'text', false, 2);

INSERT INTO fields (id, object_id, name, type, required, enum_values, enum_colors, sort_order) VALUES
  ('seed_fld_shot_intext_000000000', 'seed_obj_shot_0000000000000000', 'INT/EXT', 'enum', false,
   '["INT","EXT","INT/EXT"]'::JSON,
   '["#3b82f6","#22c55e","#f59e0b"]'::JSON, 3),
  ('seed_fld_shot_timeofday_0000000', 'seed_obj_shot_0000000000000000', 'Time of Day', 'enum', false,
   '["Day","Night","Morning","Evening","Continuous"]'::JSON,
   '["#f59e0b","#3b82f6","#06b6d4","#8b5cf6","#94a3b8"]'::JSON, 4),
  ('seed_fld_shot_type_000000000000', 'seed_obj_shot_0000000000000000', 'Shot Type', 'enum', false,
   '["Establishing","Wide","Medium","Close-Up","Extreme Close-Up","POV","Two-Shot","Over-the-Shoulder","Insert"]'::JSON,
   '["#6366f1","#3b82f6","#06b6d4","#22c55e","#ef4444","#f59e0b","#8b5cf6","#94a3b8","#64748b"]'::JSON, 5),
  ('seed_fld_shot_status_000000000', 'seed_obj_shot_0000000000000000', 'Status', 'enum', false,
   '["Not Started","In Progress","Complete","Hold"]'::JSON,
   '["#94a3b8","#3b82f6","#22c55e","#f59e0b"]'::JSON, 7);

INSERT INTO fields (id, object_id, name, type, required, sort_order) VALUES
  ('seed_fld_shot_desc_000000000000', 'seed_obj_shot_0000000000000000', 'Description', 'text', false, 6),
  ('seed_fld_shot_chars_00000000000', 'seed_obj_shot_0000000000000000', 'Characters', 'tags', false, 8),
  ('seed_fld_shot_notes_00000000000', 'seed_obj_shot_0000000000000000', 'Notes', 'richtext', false, 9);

INSERT INTO statuses (id, object_id, name, color, sort_order, is_default) VALUES
  ('seed_sts_shot_notstart_0000000', 'seed_obj_shot_0000000000000000', 'Not Started', '#94a3b8', 0, true),
  ('seed_sts_shot_inprog_000000000', 'seed_obj_shot_0000000000000000', 'In Progress', '#3b82f6', 1, false),
  ('seed_sts_shot_complete_00000000', 'seed_obj_shot_0000000000000000', 'Complete', '#22c55e', 2, false),
  ('seed_sts_shot_hold_000000000000', 'seed_obj_shot_0000000000000000', 'Hold', '#f59e0b', 3, false);

-- Shot entries (20 shots from Up — Act I)
INSERT INTO entries (id, object_id) VALUES
  ('seed_ent_shot_001_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_002_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_003_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_004_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_005_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_006_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_007_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_008_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_009_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_010_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_011_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_012_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_013_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_014_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_015_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_016_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_017_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_018_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_019_000000000000', 'seed_obj_shot_0000000000000000'),
  ('seed_ent_shot_020_000000000000', 'seed_obj_shot_0000000000000000');

INSERT INTO entry_fields (entry_id, field_id, value) VALUES
  -- Shot 001
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_shotnum_000000000', '001'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_scenenum_00000000', '1'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_location_00000000', 'Movie Theatre'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_timeofday_0000000', 'Continuous'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_type_000000000000', 'Establishing'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_desc_000000000000', 'Wide establishing shot of the packed 1930s movie theatre. A newsreel plays on the silver screen.'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_chars_00000000000', '["Young Carl"]'),
  ('seed_ent_shot_001_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 002
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_shotnum_000000000', '002'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_scenenum_00000000', '1'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_location_00000000', 'Movie Theatre'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_timeofday_0000000', 'Continuous'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_type_000000000000', 'Close-Up'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_desc_000000000000', 'Close-up on Young Carl''s face — mouth agape, eyes wide — wearing leather flight helmet and goggles.'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_chars_00000000000', '["Young Carl"]'),
  ('seed_ent_shot_002_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 003
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_shotnum_000000000', '003'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_scenenum_00000000', '2'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_location_00000000', 'Small Town Neighborhood'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_desc_000000000000', 'Young Carl runs along the sidewalk, "flying" his blue Spirit of Adventure balloon. Title cards play over.'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_chars_00000000000', '["Young Carl"]'),
  ('seed_ent_shot_003_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 004
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_shotnum_000000000', '004'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_scenenum_00000000', '4'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_location_00000000', 'Dilapidated House — Living Room'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_timeofday_0000000', 'Continuous'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_type_000000000000', 'Medium'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_desc_000000000000', 'Young Ellie steers her makeshift dirigible cockpit. The rusty bicycle wheel. Coke-bottle binoculars.'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_chars_00000000000', '["Young Ellie"]'),
  ('seed_ent_shot_004_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 005
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_shotnum_000000000', '005'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_scenenum_00000000', '4'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_location_00000000', 'Dilapidated House — Living Room'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_timeofday_0000000', 'Continuous'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_type_000000000000', 'Two-Shot'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_desc_000000000000', 'Ellie removes the grape soda cap pin from her shirt and pins it on Carl. The moment they become a club.'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_chars_00000000000', '["Young Carl","Young Ellie"]'),
  ('seed_ent_shot_005_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 006
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_shotnum_000000000', '006'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_scenenum_00000000', '5'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_location_00000000', 'Dilapidated House — Upstairs'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_timeofday_0000000', 'Continuous'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl inches across the single rickety beam toward his floating blue balloon — and falls through the floor.'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_chars_00000000000', '["Young Carl","Young Ellie"]'),
  ('seed_ent_shot_006_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 007
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_shotnum_000000000', '007'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_scenenum_00000000', '9'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_location_00000000', 'Carl''s Room'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_timeofday_0000000', 'Night'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_type_000000000000', 'Two-Shot'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl and Ellie huddle under a blanket tent with a flashlight. Ellie reveals her Adventure Book.'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_chars_00000000000', '["Young Carl","Young Ellie"]'),
  ('seed_ent_shot_007_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 008
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_shotnum_000000000', '008'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_scenenum_00000000', '10'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_location_00000000', 'Church'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl and Ellie''s wedding. Her side of the church erupts; his side claps politely. She jumps and kisses him.'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen","Ellie"]'),
  ('seed_ent_shot_008_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 009
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_shotnum_000000000', '009'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_scenenum_00000000', '16'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_location_00000000', 'Rural Hillside'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl and Ellie lie side by side on a picnic blanket, watching clouds. He closes his eyes, smiling. He''s lucky.'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen","Ellie"]'),
  ('seed_ent_shot_009_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 010
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_shotnum_000000000', '010'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_scenenum_00000000', '25'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_location_00000000', 'Carl & Ellie''s House — Living Room'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_timeofday_0000000', 'Continuous'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_type_000000000000', 'Insert'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_desc_000000000000', 'Insert: the Paradise Falls jar, slowly filling with coins over the years — then smashed again and again.'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_chars_00000000000', '[]'),
  ('seed_ent_shot_010_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 011
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_shotnum_000000000', '011'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_scenenum_00000000', '29'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_location_00000000', 'Zoo'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl and Ellie in their 60s, still working happily side by side at the zoo. His balloon cart floats up.'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen","Ellie"]'),
  ('seed_ent_shot_011_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 012
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_shotnum_000000000', '012'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_scenenum_00000000', '34'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_location_00000000', 'Rural Hillside'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_timeofday_0000000', 'Afternoon'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_type_000000000000', 'Medium'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl hurries up picnic hill, hiding airline tickets in his basket. Ellie falters — and falls. He runs to her.'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen","Ellie"]'),
  ('seed_ent_shot_012_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 013
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_shotnum_000000000', '013'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_scenenum_00000000', '35'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_location_00000000', 'Hospital Room'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_type_000000000000', 'Medium'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_desc_000000000000', 'Ellie in the hospital bed looks through her Adventure Book. A blue balloon floats in. Carl stands at the door.'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen","Ellie"]'),
  ('seed_ent_shot_013_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 014
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_shotnum_000000000', '014'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_scenenum_00000000', '36'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_location_00000000', 'Church'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_timeofday_0000000', 'Afternoon'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl sits alone in the church pews next to a massive bouquet of balloons. Silence.'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen"]'),
  ('seed_ent_shot_014_000000000000', 'seed_fld_shot_status_000000000', 'Complete'),
  -- Shot 015
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_shotnum_000000000', '015'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_scenenum_00000000', '38'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_location_00000000', 'Carl''s Bedroom'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_intext_000000000', 'INT'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_timeofday_0000000', 'Morning'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl wakes alone in the double bed, several years later. The room is still and silent.'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen"]'),
  ('seed_ent_shot_015_000000000000', 'seed_fld_shot_status_000000000', 'In Progress'),
  -- Shot 016
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_shotnum_000000000', '016'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_scenenum_00000000', '45'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_location_00000000', 'Carl''s Neighborhood'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_type_000000000000', 'Establishing'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl''s house — the lone surviving square on the block, surrounded by cranes and high-rise construction.'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen"]'),
  ('seed_ent_shot_016_000000000000', 'seed_fld_shot_status_000000000', 'In Progress'),
  -- Shot 017
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_shotnum_000000000', '017'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_scenenum_00000000', '48'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_location_00000000', 'Carl''s House — Porch'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_type_000000000000', 'Medium'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_desc_000000000000', 'Russell stands at the door reading from his Wilderness Explorer Manual. Enormous backpack. Carl in doorway.'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen","Russell"]'),
  ('seed_ent_shot_017_000000000000', 'seed_fld_shot_status_000000000', 'In Progress'),
  -- Shot 018
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_shotnum_000000000', '018'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_scenenum_00000000', '59'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_location_00000000', 'Carl''s House'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_timeofday_0000000', 'Morning'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_desc_000000000000', 'Thousands of balloons burst through the roof and windows of the house. It groans, shudders — and lifts off.'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen"]'),
  ('seed_ent_shot_018_000000000000', 'seed_fld_shot_status_000000000', 'Not Started'),
  -- Shot 019
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_shotnum_000000000', '019'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_scenenum_00000000', '60'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_location_00000000', 'Above the Town'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_timeofday_0000000', 'Morning'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_type_000000000000', 'Wide'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_desc_000000000000', 'Carl''s house floats free above the city, trailing a magnificent column of colorful balloons into a clear sky.'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_chars_00000000000', '["Carl Fredricksen","Russell"]'),
  ('seed_ent_shot_019_000000000000', 'seed_fld_shot_status_000000000', 'Not Started'),
  -- Shot 020
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_shotnum_000000000', '020'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_scenenum_00000000', '1'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_location_00000000', 'Paradise Falls — South America'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_intext_000000000', 'EXT'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_timeofday_0000000', 'Day'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_type_000000000000', 'Establishing'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_desc_000000000000', 'The majestic Paradise Falls: a massive waterfall cascading down a gigantic flat-topped mountain in jungle. Newsreel footage.'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_chars_00000000000', '[]'),
  ('seed_ent_shot_020_000000000000', 'seed_fld_shot_status_000000000', 'Not Started');

CREATE OR REPLACE VIEW v_shot AS
PIVOT (
  SELECT e.id as entry_id, e.created_at, e.updated_at,
         f.name as field_name, ef.value
  FROM entries e
  JOIN entry_fields ef ON ef.entry_id = e.id
  JOIN fields f ON f.id = ef.field_id
  WHERE e.object_id = 'seed_obj_shot_0000000000000000'
) ON field_name IN ('Shot #', 'Scene #', 'Location', 'INT/EXT', 'Time of Day', 'Shot Type', 'Description', 'Characters', 'Status', 'Notes') USING first(value);
