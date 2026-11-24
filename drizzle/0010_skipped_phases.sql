-- A timeline can now skip Planlagt and Ferdig as well as Foreslått: the
-- noProposal flag becomes a list of skipped phases, in projects and in
-- suggestions waiting for a moderator.
UPDATE `project` SET `data` = json_remove(
  CASE WHEN json_extract(`data`, '$.noProposal')
    THEN json_set(`data`, '$.skippedPhases', json('["proposed"]'))
    ELSE `data` END,
  '$.noProposal'
) WHERE json_type(`data`, '$.noProposal') IS NOT NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_remove(
  CASE WHEN json_extract(`data`, '$.project.noProposal')
    THEN json_set(`data`, '$.project.skippedPhases', json('["proposed"]'))
    ELSE `data` END,
  '$.project.noProposal'
) WHERE json_type(`data`, '$.project.noProposal') IS NOT NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_remove(
  json_set(`data`, '$.changes.skippedPhases',
    json(CASE WHEN json_extract(`data`, '$.changes.noProposal') THEN '["proposed"]' ELSE '[]' END)),
  '$.changes.noProposal'
) WHERE json_type(`data`, '$.changes.noProposal') IS NOT NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_remove(
  json_set(`data`, '$.base.skippedPhases',
    json(CASE WHEN json_extract(`data`, '$.base.noProposal') THEN '["proposed"]' ELSE '[]' END)),
  '$.base.noProposal'
) WHERE json_type(`data`, '$.base.noProposal') IS NOT NULL;
--> statement-breakpoint
UPDATE `suggestion` SET `data` = json_replace(`data`, '$.applied',
  json(replace(json_extract(`data`, '$.applied'), '"noProposal"', '"skippedPhases"')))
WHERE json_extract(`data`, '$.applied') LIKE '%"noProposal"%';
