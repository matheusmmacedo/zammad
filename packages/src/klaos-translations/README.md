# klaos-translations

PT-BR translation overrides for KLaOS Helpdesk (Zammad).

## Content

Three SQL files under `sql/` containing `UPDATE translations SET target = '…' WHERE id = N AND locale = 'pt-br'` statements.

## ⚠️ Known limitation

The SQL files target rows by **numeric `id`**, which is specific to the source installation. IDs may not match on a fresh Zammad install — in that case the UPDATE runs but affects zero rows (no error, no effect).

If translations don't apply after running, regenerate the SQL using `source`-based matching:

```sql
UPDATE translations SET target = '…' WHERE source = 'Original English string' AND locale = 'pt-br';
```

## How to apply (manual, until we wire into the .zpm installer)

```bash
# from a shell inside the zammad-init or zammad-railsserver container
psql "$POSTGRESQL_URL" -f /path/to/01-translations-ptbr.sql
psql "$POSTGRESQL_URL" -f /path/to/02-translations-ptbr.sql
psql "$POSTGRESQL_URL" -f /path/to/03-translations-ptbr.sql
```

Or via Rails console:
```ruby
ActiveRecord::Base.connection.execute(File.read('/opt/zammad/auto_install/klaos-translations/sql/01-translations-ptbr.sql'))
# repeat for 02/03
```

## Next steps

- Wire into a proper `.zpm` DB migration so it auto-runs on package install.
- Switch to `source`-based matching to survive ID drift.
- Eventually pull canonical PT-BR from Zammad Crowdin and upstream what's not there.
