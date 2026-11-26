-- Three main categories: Energi and Vann og avløp become Annen
-- infrastruktur, Offentlige bygg part of Byutvikling. Subcategories keep
-- their names. Stored names are rewritten here; the app also reads any it
-- missed as the new ones (`retiredCategories` in app/lib/categories.ts).
UPDATE `project` SET `data` = json_set(`data`, '$.categories', (
  SELECT json_group_array(DISTINCT CASE value WHEN 'Energi' THEN 'Annen infrastruktur' WHEN 'Vann og avløp' THEN 'Annen infrastruktur' WHEN 'Offentlige bygg' THEN 'Byutvikling' ELSE value END)
  FROM json_each(`data`, '$.categories')
)) WHERE EXISTS (
  SELECT 1 FROM json_each(`data`, '$.categories')
  WHERE value IN ('Energi', 'Vann og avløp', 'Offentlige bygg')
);
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_set(`data`, '$.project.categories', (
  SELECT json_group_array(DISTINCT CASE value WHEN 'Energi' THEN 'Annen infrastruktur' WHEN 'Vann og avløp' THEN 'Annen infrastruktur' WHEN 'Offentlige bygg' THEN 'Byutvikling' ELSE value END)
  FROM json_each(`data`, '$.project.categories')
)) WHERE EXISTS (
  SELECT 1 FROM json_each(`data`, '$.project.categories')
  WHERE value IN ('Energi', 'Vann og avløp', 'Offentlige bygg')
);
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_set(`data`, '$.changes.categories', (
  SELECT json_group_array(DISTINCT CASE value WHEN 'Energi' THEN 'Annen infrastruktur' WHEN 'Vann og avløp' THEN 'Annen infrastruktur' WHEN 'Offentlige bygg' THEN 'Byutvikling' ELSE value END)
  FROM json_each(`data`, '$.changes.categories')
)) WHERE EXISTS (
  SELECT 1 FROM json_each(`data`, '$.changes.categories')
  WHERE value IN ('Energi', 'Vann og avløp', 'Offentlige bygg')
);
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_set(`data`, '$.base.categories', (
  SELECT json_group_array(DISTINCT CASE value WHEN 'Energi' THEN 'Annen infrastruktur' WHEN 'Vann og avløp' THEN 'Annen infrastruktur' WHEN 'Offentlige bygg' THEN 'Byutvikling' ELSE value END)
  FROM json_each(`data`, '$.base.categories')
)) WHERE EXISTS (
  SELECT 1 FROM json_each(`data`, '$.base.categories')
  WHERE value IN ('Energi', 'Vann og avløp', 'Offentlige bygg')
);
