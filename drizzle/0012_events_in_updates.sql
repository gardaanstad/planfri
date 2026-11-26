-- A project's timeline events and its updates become one list: each
-- milestone is an update without a body, dated by its year or month, in
-- projects and in suggestions waiting for a moderator. A correction's
-- `updates` carries the timeline's events alone.
UPDATE `project` SET `data` = json_remove(json_set(`data`, '$.updates', (
  SELECT json_group_array(json(item)) FROM (
    SELECT value AS item FROM json_each(`data`, '$.updates')
    UNION ALL
    SELECT json_object('id', json_extract(value, '$.id'), 'title', json_extract(value, '$.label'), 'date', json_extract(value, '$.date'))
    FROM json_each(`data`, '$.milestones')
  )
)), '$.milestones') WHERE json_type(`data`, '$.milestones') IS NOT NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_remove(json_set(`data`, '$.project.updates', (
  SELECT json_group_array(json(item)) FROM (
    SELECT value AS item FROM json_each(`data`, '$.project.updates')
    UNION ALL
    SELECT json_object('id', json_extract(value, '$.id'), 'title', json_extract(value, '$.label'), 'date', json_extract(value, '$.date'))
    FROM json_each(`data`, '$.project.milestones')
  )
)), '$.project.milestones') WHERE json_type(`data`, '$.project.milestones') IS NOT NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_remove(json_set(`data`, '$.changes.updates', (
  SELECT json_group_array(json_object('id', json_extract(value, '$.id'), 'title', json_extract(value, '$.label'), 'date', json_extract(value, '$.date')))
  FROM json_each(`data`, '$.changes.milestones')
)), '$.changes.milestones') WHERE json_type(`data`, '$.changes.milestones') IS NOT NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_remove(json_set(`data`, '$.base.updates', (
  SELECT json_group_array(json_object('id', json_extract(value, '$.id'), 'title', json_extract(value, '$.label'), 'date', json_extract(value, '$.date')))
  FROM json_each(`data`, '$.base.milestones')
)), '$.base.milestones') WHERE json_type(`data`, '$.base.milestones') IS NOT NULL;
--> statement-breakpoint
-- A base without milestones had none; it reads as no events.
UPDATE `suggestion` SET `data` = json_set(`data`, '$.base.updates', json('[]'))
WHERE json_type(`data`, '$.changes.updates') IS NOT NULL
  AND json_type(`data`, '$.base') IS NOT NULL
  AND json_type(`data`, '$.base.updates') IS NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_replace(`data`, '$.applied',
  json(replace(json_extract(`data`, '$.applied'), '"milestones"', '"updates"')))
WHERE json_extract(`data`, '$.applied') LIKE '%"milestones"%';
