-- Owner-requested one-time reset. Keep messages and all non-mutual decisions.
INSERT OR IGNORE INTO settings(key,value)
SELECT 'match_reset_backup_0004',
       json_group_array(json_object('sender',a.sender,'recipient',a.recipient,'kind',a.kind,'created',a.created))
FROM likes a JOIN likes b ON a.sender=b.recipient AND a.recipient=b.sender
WHERE a.kind='like' AND b.kind='like';
--> statement-breakpoint
DELETE FROM likes
WHERE kind='like' AND EXISTS (
  SELECT 1 FROM json_each((SELECT value FROM settings WHERE key='match_reset_backup_0004')) item
  WHERE json_extract(item.value,'$.sender')=likes.sender
    AND json_extract(item.value,'$.recipient')=likes.recipient
    AND json_extract(item.value,'$.created')=likes.created
);
